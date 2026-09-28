import * as THREE from 'three/webgpu';
import { CONFIG } from '../config.js';

// The camera is the pilot's head. It sits inside the ship group, so it inherits
// bank and pitch, then adds three things of its own:
//   1. Head lag   - acceleration throws the head the opposite way on a spring,
//                   so the cockpit frame visibly shifts under hard turns.
//   2. Trauma     - hits and near misses add trauma (0..1). Shake scales with
//                   trauma squared and uses smooth noise, not random jitter.
//   3. FOV        - widens with speed, plus short punches for events.

// Smooth 1D noise from summed sines with incommensurate frequencies
function smoothNoise(t, seed) {
  return (Math.sin(t * 1.0 + seed) * 0.5 + Math.sin(t * 2.31 + seed * 1.7) * 0.3 + Math.sin(t * 4.77 + seed * 2.9) * 0.2);
}

export function createCameraRig(camera, ship) {
  ship.group.add(camera);
  camera.position.set(0, 0, 0);

  const r = {
    trauma: 0,
    fovPunch: 0,
    hx: 0, hy: 0, hvx: 0, hvy: 0,    // head offset + velocity
    t: 0,
  };

  r.addTrauma = (amount) => { r.trauma = Math.min(1, r.trauma + amount); };
  r.punch = (degrees) => { r.fovPunch += degrees; };

  r.update = (dt, extraFov = 0) => {
    const c = CONFIG.camera;
    const f = CONFIG.flight;
    r.t += dt;

    // Head lag: target is opposite to acceleration, clamped
    let tx = -ship.ax * c.headLag;
    let ty = -ship.ay * c.headLag;
    const len = Math.hypot(tx, ty);
    if (len > c.headLagMax) { tx *= c.headLagMax / len; ty *= c.headLagMax / len; }
    const ax = (tx - r.hx) * c.headStiffness - r.hvx * c.headDamping;
    const ay = (ty - r.hy) * c.headStiffness - r.hvy * c.headDamping;
    r.hvx += ax * dt; r.hvy += ay * dt;
    r.hx += r.hvx * dt; r.hy += r.hvy * dt;

    // Trauma shake
    r.trauma = Math.max(0, r.trauma - c.traumaDecay * dt);
    const shake = r.trauma * r.trauma;
    const n = r.t * c.shakeFrequency;
    const sx = smoothNoise(n, 1.3) * c.shakeOffset * shake;
    const sy = smoothNoise(n, 7.1) * c.shakeOffset * shake;
    const rx = smoothNoise(n, 3.7) * c.shakeAngle * shake;
    const ry = smoothNoise(n, 5.2) * c.shakeAngle * shake;
    const rz = smoothNoise(n, 9.4) * c.shakeAngle * shake * 1.4;

    camera.position.set(r.hx + sx, r.hy + sy, 0);
    camera.rotation.set(rx - r.hy * 0.25, ry + r.hx * 0.25, rz);

    // FOV: speed + punches
    const speedT = THREE.MathUtils.clamp((ship.speed - f.cruiseSpeed) / Math.max(1, f.boostSpeed - f.cruiseSpeed), 0, 1);
    r.fovPunch *= Math.exp(-7 * dt);
    const fovT = c.fov + speedT * c.boostFovKick + r.fovPunch + extraFov;
    camera.fov += (fovT - camera.fov) * (1 - Math.exp(-c.fovResponse * dt));
    camera.updateProjectionMatrix();
  };

  return r;
}
