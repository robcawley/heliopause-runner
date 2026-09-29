import * as THREE from 'three/webgpu';

// The camera is the pilot's head, riding inside the ship. On top of the
// ship's attitude it adds:
//   head lag     - g-force throws the head against the turn, on a spring
//   look-in      - the pilot glances slightly into the turn
//   trauma       - hits and near misses add trauma; shake is trauma squared
//   FOV          - widens with boost, narrows with brake, punches on events
function smoothNoise(t, seed) {
  return Math.sin(t + seed) * 0.5 + Math.sin(t * 2.31 + seed * 1.7) * 0.3 + Math.sin(t * 4.77 + seed * 2.9) * 0.2;
}

export function createCameraRig(camera, ship, config) {
  ship.group.add(camera);
  camera.position.set(0, 0, 0);

  const r = { trauma: 0, fovPunch: 0, hx: 0, hy: 0, hvx: 0, hvy: 0, t: 0 };

  r.addTrauma = (amount) => { r.trauma = Math.min(1, r.trauma + amount); };
  r.punch = (degrees) => { r.fovPunch += degrees; };
  r.reset = () => { Object.assign(r, { trauma: 0, fovPunch: 0, hx: 0, hy: 0, hvx: 0, hvy: 0 }); };

  r.update = (dt, extraFov = 0) => {
    const c = config.camera, f = config.flight;
    r.t += dt;

    // Head lag against g-force
    let tx = -ship.localAx * c.headLag;
    let ty = -ship.localAy * c.headLag;
    const len = Math.hypot(tx, ty);
    if (len > c.headLagMax) { tx *= c.headLagMax / len; ty *= c.headLagMax / len; }
    r.hvx += ((tx - r.hx) * c.headStiffness - r.hvx * c.headDamping) * dt;
    r.hvy += ((ty - r.hy) * c.headStiffness - r.hvy * c.headDamping) * dt;
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

    const rollCounter = -ship.rollAngle * (1 - config.roll.cameraFollow);
    const lookYaw = ship.yawRate * c.lookIntoTurn;
    const lookPitch = ship.pitchRate * c.lookIntoTurn * 0.6;

    camera.position.set(r.hx + sx, r.hy + sy, 0);
    camera.rotation.set(rx - r.hy * 0.25 + lookPitch, ry + r.hx * 0.25 + lookYaw, rz + rollCounter);

    // FOV
    const boostT = THREE.MathUtils.clamp((ship.speed - f.cruiseSpeed) / Math.max(1, f.boostSpeed - f.cruiseSpeed), 0, 1);
    const brakeT = THREE.MathUtils.clamp((f.cruiseSpeed - ship.speed) / Math.max(1, f.cruiseSpeed - f.brakeSpeed), 0, 1);
    r.fovPunch *= Math.exp(-7 * dt);
    const fovT = c.fov + boostT * c.boostFovKick + brakeT * c.brakeFovKick + r.fovPunch + extraFov;
    camera.fov += (fovT - camera.fov) * (1 - Math.exp(-c.fovResponse * dt));
    camera.updateProjectionMatrix();
  };

  return r;
}
