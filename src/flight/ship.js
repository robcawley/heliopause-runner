import * as THREE from 'three/webgpu';
import { CONFIG } from '../config.js';

// The ship never moves forward: the belt moves past it. It only slides around
// the flight frame, chasing the aim point on a damped spring. Everything the
// pilot feels (bank, pitch, head throw) is derived from that spring's velocity
// and acceleration, so one set of numbers drives the whole sensation.
export function createShip() {
  const group = new THREE.Group();          // position + attitude; cockpit and camera ride inside
  group.rotation.order = 'YXZ';

  const s = {
    group,
    x: 0, y: 0,
    vx: 0, vy: 0,
    ax: 0, ay: 0,
    speed: CONFIG.flight.cruiseSpeed,
    bank: 0, pitch: 0, yaw: 0,
    travelled: 0,                           // total distance flown, drives the dust shader
  };

  // dt: real time (the pilot's hands); worldDt: world time (slowed by hit-stop and slow-mo)
  s.update = (dt, worldDt, input) => {
    const f = CONFIG.flight;

    // Damped spring toward the aim point (semi-implicit Euler, stable at 20-240 fps)
    const fx = (input.aimX - s.x) * f.stiffness - s.vx * f.damping;
    const fy = (input.aimY - s.y) * f.stiffness - s.vy * f.damping;
    s.ax = fx; s.ay = fy;
    s.vx += fx * dt; s.vy += fy * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;

    // Soft walls: if the spring overshoots the frame, bleed it off
    if (Math.abs(s.x) > f.boundsX) { s.x = Math.sign(s.x) * f.boundsX; s.vx *= 0.3; }
    if (Math.abs(s.y) > f.boundsY) { s.y = Math.sign(s.y) * f.boundsY; s.vy *= 0.3; }

    // Forward speed
    const target = input.boost ? f.boostSpeed : f.cruiseSpeed;
    s.speed += (target - s.speed) * (1 - Math.exp(-f.speedResponse * dt));
    s.travelled += s.speed * worldDt;

    // Attitude, smoothed so it reads as mass rather than jitter
    const k = 1 - Math.exp(-10 * dt);
    const bankT = THREE.MathUtils.clamp(-s.vx * f.bankPerSpeed, -f.maxBank, f.maxBank);
    const pitchT = THREE.MathUtils.clamp(s.vy * f.pitchPerSpeed, -0.35, 0.35);
    const yawT = -s.vx * f.yawIntoTurn;
    s.bank += (bankT - s.bank) * k;
    s.pitch += (pitchT - s.pitch) * k;
    s.yaw += (yawT - s.yaw) * k;

    group.position.set(s.x, s.y, 0);
    group.rotation.set(s.pitch, s.yaw, s.bank);
  };

  return s;
}
