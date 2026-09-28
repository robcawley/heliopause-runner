import * as THREE from 'three/webgpu';
import { CONFIG } from '../config.js';

// The ship always flies down the belt (the belt streams past it along +z), but
// sideways it is free: the stick asks for a lateral velocity and the ship
// accelerates toward it with some weight. The nose follows the velocity
// vector, so a hard dodge genuinely points you across the belt, and bank comes
// from speed plus acceleration, so turning in feels different from holding a turn.
//
// x, y are the ship's offset from the beacon lane's centre line.
const TAU = Math.PI * 2;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createShip() {
  const group = new THREE.Group();          // position + attitude; cockpit and camera ride inside
  group.rotation.order = 'YXZ';

  const s = {
    group,
    x: 0, y: 0,
    vx: 0, vy: 0,
    ax: 0, ay: 0,                           // smoothed lateral acceleration
    speed: CONFIG.flight.cruiseSpeed,
    bank: 0, pitch: 0, yaw: 0,
    rollAngle: 0, rollTime: 0, rollDir: 0,
    rollCharges: CONFIG.roll.charges,
    travelled: 0,                           // distance along the lane
  };

  s.reset = () => {
    Object.assign(s, { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, bank: 0, pitch: 0, yaw: 0, rollAngle: 0, rollTime: 0, rollCharges: CONFIG.roll.charges });
  };

  s.tryRoll = (dir) => {
    if (s.rollTime > 0 || s.rollCharges < 1 || !dir) return false;
    s.rollCharges -= 1;
    s.rollDir = dir;
    s.rollTime = CONFIG.roll.duration;
    s.vx += dir * CONFIG.roll.impulse;
    return true;
  };

  // dt: real time (the pilot's hands); worldDt: world time (slowed by hit-stop and slow-mo)
  s.update = (dt, worldDt, input) => {
    const f = CONFIG.flight;
    const r = CONFIG.roll;

    // Lateral velocity chases the stick's demand
    const pvx = s.vx, pvy = s.vy;
    const k = 1 - Math.exp(-f.agility * dt);
    s.vx += (input.stickX * f.maxLateral - s.vx) * k;
    s.vy += (input.stickY * f.maxLateral * 0.8 - s.vy) * k;
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    const ka = 1 - Math.exp(-12 * dt);
    s.ax += ((s.vx - pvx) / Math.max(dt, 1e-4) - s.ax) * ka;
    s.ay += ((s.vy - pvy) / Math.max(dt, 1e-4) - s.ay) * ka;

    // Forward speed
    const target = input.boost ? f.boostSpeed : f.cruiseSpeed;
    s.speed += (target - s.speed) * (1 - Math.exp(-f.speedResponse * dt));
    s.travelled += s.speed * worldDt;

    // Attitude: nose along the velocity vector, bank from speed and acceleration
    const yawT = -Math.atan2(s.vx, s.speed) * f.headingFollow;
    const pitchT = Math.atan2(s.vy, s.speed) * f.headingFollow;
    const bankT = THREE.MathUtils.clamp(-(s.vx * f.bankPerSpeed + s.ax * f.bankPerAccel), -f.maxBank, f.maxBank);
    const kk = 1 - Math.exp(-9 * dt);
    s.yaw += (yawT - s.yaw) * kk;
    s.pitch += (pitchT - s.pitch) * kk;
    s.bank += (bankT - s.bank) * kk;

    // Barrel roll
    if (s.rollTime > 0) {
      s.rollTime = Math.max(0, s.rollTime - dt);
      s.rollAngle = -s.rollDir * TAU * easeInOut(1 - s.rollTime / r.duration);
      if (s.rollTime === 0) s.rollAngle = 0;
    }
    if (s.rollCharges < r.charges) s.rollCharges = Math.min(r.charges, s.rollCharges + dt / r.recharge);

    group.position.set(s.x, s.y, 0);
    group.rotation.set(s.pitch, s.yaw, s.bank + s.rollAngle);
  };

  return s;
}
