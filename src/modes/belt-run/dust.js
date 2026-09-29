import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, uniform, positionLocal, instancedBufferAttribute, fract,
  smoothstep, length, varying, mix,
} from 'three/tsl';

// Ice grit around the cockpit: what tells you how fast you are going and
// which way you are sliding. Each speck has a fixed place in the world; the
// shader wraps the field in a box around the pilot, so it never runs out
// whichever way you fly, and stretches each speck into a streak along your
// velocity. Thousands of them cost nothing on the CPU.
export function createDust(config) {
  const w = config.world;
  const count = w.dustCount;

  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4 + 0] = Math.random() * 1000;
    seeds[i * 4 + 1] = Math.random() * 1000;
    seeds[i * 4 + 2] = Math.random() * 1000;
    seeds[i * 4 + 3] = Math.random();
  }
  const seed = instancedBufferAttribute(new THREE.InstancedBufferAttribute(seeds, 4));

  const uCam = uniform(new THREE.Vector3());
  const uHalf = uniform(w.dustRange);
  const uStreak = uniform(1);
  const uAxisZ = uniform(new THREE.Vector3(0, 0, 1));   // along velocity
  const uAxisX = uniform(new THREE.Vector3(1, 0, 0));
  const uAxisY = uniform(new THREE.Vector3(0, 1, 0));
  const uGlow = uniform(1);
  const uTint = uniform(new THREE.Color(1, 1, 1));
  const vFade = varying(float(0), 'vDustFade');

  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

  material.positionNode = Fn(() => {
    const span = uHalf.mul(2.0);
    // fract, not mod: WGSL's % keeps the sign of negative numbers, fract never does
    const rel = fract(seed.xyz.sub(uCam).add(uHalf).div(span)).mul(span).sub(uHalf);
    const thickness = mix(float(0.012), float(0.035), seed.w);
    const p = positionLocal;
    const offset = uAxisZ.mul(p.z.mul(uStreak)).add(uAxisX.mul(p.x.mul(thickness))).add(uAxisY.mul(p.y.mul(thickness)));
    const d = length(rel);
    vFade.assign(smoothstep(uHalf, uHalf.mul(0.55), d).mul(smoothstep(0.8, 3.2, d)));
    return uCam.add(rel).add(offset);
  })();

  material.colorNode = Fn(() => {
    const tint = mix(vec3(0.55, 0.75, 1.0), vec3(0.9, 0.95, 1.0), seed.w);
    return tint.mul(uTint).mul(vFade).mul(uGlow).mul(seed.w.mul(1.4).add(0.35));
  })();

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
  mesh.frustumCulled = false;
  const identity = new THREE.Matrix4();
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, identity);

  const dir = new THREE.Vector3();
  const helper = new THREE.Vector3();

  return {
    mesh,
    update(ship) {
      uCam.value.copy(ship.pos);
      const speed = ship.vel.length();
      dir.copy(ship.vel).divideScalar(Math.max(speed, 1e-3));
      uAxisZ.value.copy(dir);
      helper.set(0, 1, 0);
      if (Math.abs(dir.y) > 0.95) helper.set(1, 0, 0);
      uAxisX.value.crossVectors(helper, dir).normalize();
      uAxisY.value.crossVectors(dir, uAxisX.value).normalize();
      uStreak.value = Math.max(0.3, speed * config.world.dustStreak);
      uHalf.value = config.world.dustRange;
      uGlow.value = 0.8 + (speed / config.flight.boostSpeed) * 0.9;
    },
    // Radiation turns the grit a sickly amber
    setRadiation(k) { uTint.value.setRGB(1 + k * 0.35, 1 + k * 0.15, 1 - k * 0.5); },
  };
}
