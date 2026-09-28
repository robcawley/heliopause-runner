import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, positionLocal, normalView, positionViewDirection, dot, pow,
  saturate, mix, mx_noise_float, oneMinus,
} from 'three/tsl';
import { CONFIG } from '../config.js';

// The belt. Rocks are pooled and recycled; they move toward the ship and are
// tested once, at the moment they cross the ship's plane (z = 0). That single
// test decides hit / near miss / clean pass, which keeps the rule readable.
//
// Events fire through callbacks:
//   onApproach(rock, clearance, side)  ~whooshLead seconds before a close pass
//   onPass(rock, clearance, side)      as the rock reaches the ship, clearance in world units;
//                                      return 'destroy' to shatter the rock (hits)
const MAX_ROCKS = 160;
const CANOPY_DEPTH = 1.6;   // how far the cockpit reaches ahead of the pilot's eye

function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 4);         // non-indexed: flat facets for free
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const craters = Array.from({ length: 7 }, () => ({
    c: new THREE.Vector3().randomDirection(), r: 0.25 + Math.random() * 0.35, d: 0.06 + Math.random() * 0.1,
  }));
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let h = 1
      + Math.sin(n.x * 3.1 + n.y * 1.7) * 0.12
      + Math.sin(n.y * 5.3 - n.z * 2.2) * 0.07
      + Math.sin(n.z * 9.7 + n.x * 4.1) * 0.035;
    for (const k of craters) {
      const d = n.distanceTo(k.c);
      if (d < k.r) h -= k.d * Math.cos((d / k.r) * Math.PI * 0.5);
    }
    v.copy(n).multiplyScalar(h);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function rockMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0.05, flatShading: true });
  // Dirty ice: grey-blue with darker carbon streaks
  m.colorNode = Fn(() => {
    const n = mx_noise_float(positionLocal.mul(2.4)).mul(0.5).add(0.5);
    const streak = mx_noise_float(positionLocal.mul(vec3(0.8, 6.0, 0.8))).mul(0.5).add(0.5);
    const ice = vec3(0.46, 0.52, 0.6);
    const carbon = vec3(0.09, 0.085, 0.09);
    return mix(carbon, ice, saturate(n.mul(1.3).sub(streak.mul(0.4))));
  })();
  // A cold rim so silhouettes read against black space, even on the shadow side
  m.emissiveNode = Fn(() => {
    const facing = saturate(dot(normalView, positionViewDirection));
    return vec3(0.25, 0.55, 0.75).mul(pow(oneMinus(facing), float(3.0))).mul(0.55);
  })();
  return m;
}

export function createRocks() {
  const mesh = new THREE.InstancedMesh(rockGeometry(), rockMaterial(), MAX_ROCKS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  const rocks = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const dq = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  const handlers = { onApproach: () => {}, onPass: () => {} };

  function place(r, ship, initial) {
    const w = CONFIG.world;
    r.z = initial ? -(40 + Math.random() * (w.rockSpawnDepth - 40)) : -w.rockSpawnDepth * (1 + Math.random() * 0.2);
    r.giant = r.index < w.giantRocks;

    // Centre the spawn on where the ship will be when the rock arrives, so free
    // flight never runs out of belt, whichever way you are heading.
    const arrive = Math.min(4, -r.z / Math.max(1, ship.speed));
    const cx = ship.x + ship.vx * arrive * 0.6;
    const cy = ship.y + ship.vy * arrive * 0.6;

    if (r.giant) {
      const side = Math.random() < 0.5 ? -1 : 1;
      r.size = 10 + Math.random() * 16;
      r.x = cx + side * (w.rockSpread + 20 + Math.random() * 45);
      r.y = cy + (Math.random() - 0.5) * 70;
    } else {
      r.size = w.rockMinSize + Math.pow(Math.random(), 1.8) * (w.rockMaxSize - w.rockMinSize);
      const aimed = Math.random() < w.rockAimBias;
      const sx = aimed ? 4 : w.rockSpread;
      const sy = aimed ? 3 : w.rockSpread * 0.7;
      r.x = cx + (Math.random() - 0.5) * 2 * sx;
      r.y = cy + (Math.random() - 0.5) * 2 * sy;
    }
    r.vx = (Math.random() - 0.5) * (r.giant ? 0.5 : 1.6);
    r.vy = (Math.random() - 0.5) * (r.giant ? 0.5 : 1.2);
    r.stretch = [0.8 + Math.random() * 0.45, 0.75 + Math.random() * 0.4, 0.8 + Math.random() * 0.5];
    r.radius = r.size * Math.max(...r.stretch) * 1.05;
    r.quat = new THREE.Quaternion().random();
    r.axis = new THREE.Vector3().randomDirection();
    r.spin = (Math.random() * 0.8 + 0.1) / Math.sqrt(r.size);
    r.approached = false;
    r.tested = false;
  }

  function init(ship) {
    rocks.length = 0;
    for (let i = 0; i < MAX_ROCKS; i++) {
      const r = { index: i };
      place(r, ship, true);
      rocks.push(r);
    }
  }

  function update(dt, ship) {
    const n = Math.min(MAX_ROCKS, CONFIG.world.rockCount + CONFIG.world.giantRocks);
    mesh.count = n;
    const lead = CONFIG.nearMiss.whooshLead;

    for (let i = 0; i < n; i++) {
      const r = rocks[i];
      r.z += ship.speed * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;

      if (!r.giant) {
        const dx = r.x - ship.x;
        const dy = r.y - ship.y;
        const clearance = Math.hypot(dx, dy) - r.radius;
        const side = Math.sign(dx) || 1;

        // Approach: schedule the whoosh so its peak lands on the pass
        if (!r.approached && r.z > -ship.speed * lead) {
          r.approached = true;
          if (clearance < CONFIG.nearMiss.radius * 1.6) handlers.onApproach(r, clearance, side, dx, dy);
        }
        // The test fires when the rock's leading face reaches the canopy, not its
        // centre reaching the pilot, so a hit never clips through the cockpit.
        if (!r.tested && r.z + r.radius >= -CANOPY_DEPTH) {
          r.tested = true;
          if (handlers.onPass(r, clearance, side, dx, dy) === 'destroy') place(r, ship, false);
        }
      }

      const tooFar = Math.abs(r.x - ship.x) > CONFIG.world.rockSpread * (r.giant ? 4 : 2.6) && r.z < -40;
      if (r.z > 30 || (r.giant && r.z > 80) || tooFar) place(r, ship, false);

      dq.setFromAxisAngle(r.axis, r.spin * dt);
      r.quat.premultiply(dq);
      pos.set(r.x, r.y, r.z);
      scl.set(r.size * r.stretch[0], r.size * r.stretch[1], r.size * r.stretch[2]);
      m4.compose(pos, r.quat, scl);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, init, update, handlers, rocks };
}
