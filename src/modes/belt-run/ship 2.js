import * as THREE from 'three/webgpu';

// A nimble arcade fighter with full freedom of movement.
//
// Orientation is a quaternion, and pitch, yaw and roll all turn the ship
// about its own axes, so you can loop, turn right round, fly upside down and
// come back. Each turn rate chases its input quickly, so the ship answers at
// once but never snaps.
//
// Auto-level: when you are not rolling, the ship eases its wings level with
// the beacon lane's "up", so you never lose the horizon for long. It fades
// out when you point straight up or down, stands back while you pull hard on
// pitch (so loops stay loops), and can be turned off (autoLevel 0).
//
// The ship flies where it points: velocity swings round to the nose at a rate
// set by `grip`, so hard turns carry a little drift. Barrel rolls add a
// sideways burst in the ship's own frame and a full 360 on top.
//
// Rotations run on real time (the pilot's hands); translation runs on world
// time, so slow motion slows the flight but never the controls.
const TAU = Math.PI * 2;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export function createShip(config) {
  const group = new THREE.Group();

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const levelRight = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const prevVel = new THREE.Vector3();
  const accel = new THREE.Vector3();
  const qInv = new THREE.Quaternion();
  const dq = new THREE.Quaternion();
  const bankQ = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const Z = new THREE.Vector3(0, 0, 1);

  const s = {
    group,
    quat: new THREE.Quaternion(),    // the ship's true orientation
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),        // total velocity, including any roll burst
    base: new THREE.Vector3(),       // velocity without the roll burst
    dodge: new THREE.Vector3(),
    fwd, right, up,
    yawRate: 0, pitchRate: 0, rollRate: 0,
    bank: 0,                         // visual lean into turns, on top of the true orientation
    speed: 0,
    localAx: 0, localAy: 0,          // g-force in the ship's frame, for head lag
    rollAngle: 0, rollTime: 0, rollDir: 0, rollCharges: 0,
    prevZ: 0,
    distance: 0,
    laneProgress: 0,
  };

  function axes() {
    fwd.set(0, 0, -1).applyQuaternion(s.quat);
    right.set(1, 0, 0).applyQuaternion(s.quat);
    up.set(0, 1, 0).applyQuaternion(s.quat);
  }

  s.reset = () => {
    const f = config.flight;
    s.quat.identity();
    s.pos.set(0, 0, 0); s.prevZ = 0;
    s.yawRate = s.pitchRate = s.rollRate = s.bank = 0;
    s.rollAngle = s.rollTime = 0; s.rollCharges = config.roll.charges;
    s.speed = f.cruiseSpeed;
    s.base.set(0, 0, -f.cruiseSpeed); s.vel.copy(s.base); s.dodge.set(0, 0, 0);
    s.distance = 0; s.laneProgress = 0;
    s.localAx = s.localAy = 0;
    axes();
  };

  s.tryRoll = (dir) => {
    if (s.rollTime > 0 || s.rollCharges < 1 || !dir) return false;
    s.rollCharges -= 1;
    s.rollDir = dir;
    s.rollTime = config.roll.duration;
    s.dodge.addScaledVector(right, dir * config.roll.impulse);
    return true;
  };

  // Signed angle (radians) to roll about the nose to bring the wings level
  function levelError() {
    levelRight.crossVectors(fwd, WORLD_UP);
    const len = levelRight.length();
    if (len < 0.15) return 0;                       // pointing near straight up or down: no horizon
    levelRight.divideScalar(len);
    cross.crossVectors(right, levelRight);
    return Math.atan2(cross.dot(fwd), right.dot(levelRight)) * Math.min(1, (len - 0.15) / 0.5);
  }

  s.update = (dt, worldDt, input) => {
    const f = config.flight;
    const r = config.roll;
    const kt = 1 - Math.exp(-f.turnResponse * dt);
    const pitchSign = f.invertY ? -1 : 1;
    const rollIn = input.roll || 0;

    // Turn rates chase the inputs. Rolling right is a negative turn about the ship's z axis.
    s.yawRate += (-input.stickX * f.yawRate - s.yawRate) * kt;
    s.pitchRate += (input.stickY * pitchSign * f.pitchRate - s.pitchRate) * kt;
    let rollT = -rollIn * f.rollRate;
    if (Math.abs(rollIn) < 0.05 && f.autoLevel > 0) {
      // Stand back while the pilot is pulling hard on pitch, so loops stay loops
      const hold = Math.pow(1 - Math.min(1, Math.abs(input.stickY) * 1.4), 2);
      // levelError is about +fwd; the ship's z axis points backwards, so the sign flips
      rollT = THREE.MathUtils.clamp(-levelError() * f.autoLevel * hold, -f.rollRate, f.rollRate);
    }
    s.rollRate += (rollT - s.rollRate) * (1 - Math.exp(-f.turnResponse * 0.7 * dt));

    euler.set(s.pitchRate * dt, s.yawRate * dt, s.rollRate * dt, 'YXZ');
    dq.setFromEuler(euler);
    s.quat.multiply(dq).normalize();
    axes();

    // Throttle
    const target = input.boost ? f.boostSpeed : input.brake ? f.brakeSpeed : f.cruiseSpeed;
    s.speed += (target - s.speed) * (1 - Math.exp(-f.speedResponse * dt));

    // Velocity swings toward the nose; the roll burst rides on top and decays
    desired.copy(fwd).multiplyScalar(s.speed);
    s.base.lerp(desired, 1 - Math.exp(-f.grip * dt));
    s.base.setLength(s.speed);
    s.dodge.multiplyScalar(Math.exp(-f.dodgeDecay * dt));
    prevVel.copy(s.vel);
    s.vel.copy(s.base).add(s.dodge);

    s.prevZ = s.pos.z;
    s.pos.addScaledVector(s.vel, worldDt);
    s.distance += s.vel.length() * worldDt;
    s.laneProgress = Math.max(s.laneProgress, -s.pos.z);

    // g-force in the ship's own frame (smoothed): drives head lag
    accel.copy(s.vel).sub(prevVel).divideScalar(Math.max(dt, 1e-4));
    qInv.copy(s.quat).invert();
    accel.applyQuaternion(qInv);
    const ka = 1 - Math.exp(-12 * dt);
    s.localAx += (accel.x - s.localAx) * ka;
    s.localAy += (accel.y - s.localAy) * ka;

    // A visual lean into yaw turns, on top of the true orientation
    const bankT = THREE.MathUtils.clamp(s.yawRate * f.bankPerTurn, -f.maxBank, f.maxBank);
    s.bank += (bankT - s.bank) * (1 - Math.exp(-8 * dt));

    // Barrel roll
    if (s.rollTime > 0) {
      s.rollTime = Math.max(0, s.rollTime - dt);
      s.rollAngle = -s.rollDir * TAU * easeInOut(1 - s.rollTime / r.duration);
      if (s.rollTime === 0) s.rollAngle = 0;
    }
    if (s.rollCharges < r.charges) s.rollCharges = Math.min(r.charges, s.rollCharges + dt / r.recharge);

    group.position.copy(s.pos);
    bankQ.setFromAxisAngle(Z, s.bank + s.rollAngle);
    group.quaternion.copy(s.quat).multiply(bankQ);
  };

  s.reset();
  return s;
}
