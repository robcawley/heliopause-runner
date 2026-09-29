import * as THREE from 'three/webgpu';

// A nimble arcade fighter.
//
// The stick sets turn rates (yaw and pitch), which chase the stick quickly, so
// the ship answers immediately but never snaps. The ship flies where it
// points: velocity swings round to the nose at a rate set by `grip`, so hard
// turns carry a little drift. Yaw is unlimited; pitch stops short of vertical
// so the horizon never flips. Bank is visual, from turn rate.
//
// Barrel rolls add a sideways burst (in the ship's own frame) and a full 360.
//
// Rotations run on real time (the pilot's hands); translation runs on world
// time, so slow motion slows the flight but never the controls.
const TAU = Math.PI * 2;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createShip(config) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const prevVel = new THREE.Vector3();
  const accel = new THREE.Vector3();
  const qInv = new THREE.Quaternion();

  const s = {
    group,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),        // total velocity, including any roll burst
    base: new THREE.Vector3(),       // velocity without the roll burst
    dodge: new THREE.Vector3(),
    fwd, right, up,
    yaw: 0, pitch: 0, yawRate: 0, pitchRate: 0,
    bank: 0,
    speed: 0,
    localAx: 0, localAy: 0,          // g-force in the ship's frame, for head lag
    rollAngle: 0, rollTime: 0, rollDir: 0, rollCharges: 0,
    prevZ: 0,
    distance: 0,                     // total distance flown
    laneProgress: 0,                 // furthest point reached along the lane
  };

  s.reset = () => {
    const f = config.flight;
    s.pos.set(0, 0, 0); s.prevZ = 0;
    s.yaw = s.pitch = s.yawRate = s.pitchRate = s.bank = 0;
    s.rollAngle = s.rollTime = 0; s.rollCharges = config.roll.charges;
    s.speed = f.cruiseSpeed;
    s.base.set(0, 0, -f.cruiseSpeed); s.vel.copy(s.base); s.dodge.set(0, 0, 0);
    s.distance = 0; s.laneProgress = 0;
    s.localAx = s.localAy = 0;
    orient();
  };

  function orient() {
    euler.set(s.pitch, s.yaw, 0);
    fwd.set(0, 0, -1).applyEuler(euler);
    right.set(1, 0, 0).applyEuler(euler);
    up.set(0, 1, 0).applyEuler(euler);
  }

  s.tryRoll = (dir) => {
    if (s.rollTime > 0 || s.rollCharges < 1 || !dir) return false;
    s.rollCharges -= 1;
    s.rollDir = dir;
    s.rollTime = config.roll.duration;
    s.dodge.addScaledVector(right, dir * config.roll.impulse);
    return true;
  };

  s.update = (dt, worldDt, input) => {
    const f = config.flight;
    const r = config.roll;

    // Turn rates chase the stick
    const kt = 1 - Math.exp(-f.turnResponse * dt);
    const pitchSign = f.invertY ? -1 : 1;
    s.yawRate += (-input.stickX * f.yawRate - s.yawRate) * kt;
    s.pitchRate += (input.stickY * pitchSign * f.pitchRate - s.pitchRate) * kt;
    s.yaw += s.yawRate * dt;
    s.pitch = THREE.MathUtils.clamp(s.pitch + s.pitchRate * dt, -f.maxPitch, f.maxPitch);
    if (Math.abs(s.pitch) >= f.maxPitch) s.pitchRate *= 0.5;
    orient();

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
    group.getWorldQuaternion(qInv).invert();
    accel.applyQuaternion(qInv);
    const ka = 1 - Math.exp(-12 * dt);
    s.localAx += (accel.x - s.localAx) * ka;
    s.localAy += (accel.y - s.localAy) * ka;

    // Visual bank from turn rate
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
    group.rotation.set(s.pitch, s.yaw, s.bank + s.rollAngle);
  };

  s.reset();
  return s;
}
