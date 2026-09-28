import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, uniform, positionLocal, instancedBufferAttribute, mod,
  smoothstep, length, vec2, varying, mix,
} from 'three/tsl';
import { CONFIG } from '../config.js';

// Ice grit streaming past the canopy. This is what tells you how fast you are
// going. Every particle is placed in the vertex shader from one number (how far
// the ship has flown), so thousands cost nothing on the CPU.
export function createDust() {
  const w = CONFIG.world;
  const count = w.dustCount;

  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4 + 0] = (Math.random() - 0.5) * 2 * w.dustSpread;
    seeds[i * 4 + 1] = (Math.random() - 0.5) * 2 * w.dustSpread;
    seeds[i * 4 + 2] = Math.random() * w.dustDepth;
    seeds[i * 4 + 3] = Math.random();                       // brightness / size variation
  }
  const seedNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(seeds, 4));

  const uTravelled = uniform(0);
  const uStreak = uniform(1);
  const uShip = uniform(new THREE.Vector2());
  const uDepth = uniform(w.dustDepth);
  const uGlow = uniform(1);
  const uSpread = uniform(w.dustSpread);
  const uTint = uniform(new THREE.Color(1, 1, 1));

  const vFade = varying(float(0), 'vDustFade');

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  material.positionNode = Fn(() => {
    const thickness = mix(float(0.012), float(0.035), seedNode.w);
    // Box geometry spans -0.5..0.5; stretch it along z into a streak
    const local = positionLocal.mul(vec3(thickness, thickness, uStreak));
    const z = mod(seedNode.z.add(uTravelled), uDepth).sub(uDepth.sub(12.0));
    // Wrap the field around the ship so it never runs out, however far you stray
    const span = uSpread.mul(2.0);
    const wx = mod(seedNode.x.sub(uShip.x).add(uSpread), span).sub(uSpread).add(uShip.x);
    const wy = mod(seedNode.y.sub(uShip.y).add(uSpread), span).sub(uSpread).add(uShip.y);
    const pos = vec3(wx, wy, z).add(local);

    // Fade in from the far end, and out as a speck passes the canopy
    const lateral = length(vec2(wx, wy).sub(uShip));
    const fade = smoothstep(uDepth.negate().add(12.0), uDepth.mul(-0.55), z)
      .mul(smoothstep(0.6, 2.8, lateral))
      .mul(smoothstep(12.0, 4.0, z));
    vFade.assign(fade);
    return pos;
  })();

  material.colorNode = Fn(() => {
    const tint = mix(vec3(0.55, 0.75, 1.0), vec3(0.9, 0.95, 1.0), seedNode.w);
    return tint.mul(uTint).mul(vFade).mul(uGlow).mul(seedNode.w.mul(1.4).add(0.35));
  })();

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
  mesh.frustumCulled = false;
  const identity = new THREE.Matrix4();
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, identity);

  return {
    mesh,
    update(ship) {
      uTravelled.value = ship.travelled;
      uStreak.value = Math.max(0.3, ship.speed * CONFIG.world.dustStreak);
      uShip.value.set(ship.x, ship.y);
      uGlow.value = 0.8 + (ship.speed / CONFIG.flight.boostSpeed) * 0.9;
    },
    // Radiation turns the grit a sickly amber
    setRadiation(k) { uTint.value.setRGB(1 + k * 0.6, 1 + k * 0.25, 1 - k * 0.7); },
  };
}
