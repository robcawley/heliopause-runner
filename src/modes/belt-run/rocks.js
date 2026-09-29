import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, positionLocal, normalView, positionViewDirection, dot, pow,
  saturate, mix, mx_noise_float, oneMinus,
} from 'three/tsl';

// The belt, simulated in a sphere around the ship.
//
//   Ambient rocks - scattered through the whole sphere. When one drifts out of
//                   range it respawns ahead of you. Scenery, parallax, strays.
//   Path rocks    - respawn along where you are heading, a few hundred metres
//                   out. These are what you dodge, whichever way you fly.
//
// Every rock is tested every frame in 3D:
//   hit        - surface within hitRadius of the pilot (the canopy reaches ~1.5 ahead)
//   near miss  - scored at closest approach, if it came within nearMiss.radius
//   approach   - fires ~whooshLead seconds before a close pass, for the whoosh
//
// Events (set on handlers): onApproach(rock, miss, pan), onHit(rock, clearance),
// onNearMiss(rock, clearance, pan). onHit may return 'destroy'.
const MAX_ROCKS = 1000;

function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 3);         // non-indexed: flat facets for free
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

export function createRocks(config) {
  const mesh = new THREE.InstancedMesh(rockGeometry(), rockMaterial(), MAX_ROCKS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;

  const rocks = [];
  const handlers = { onApproach: () => {}, onHit: () => {}, onNearMiss: () => {} };

  const m4 = new THREE.Matrix4();
  const dq = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const rel = new THREE.Vector3();
  const relVel = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const qInv = new THREE.Quaternion();
  const perpA = new THREE.Vector3();
  const perpB = new THREE.Vector3();

  function heading(ship) {
    const s = ship.vel.length();
    return s > 1 ? tmp.copy(ship.vel).divideScalar(s) : tmp.copy(ship.fwd);
  }

  function size(r, big) {
    const w = config.world;
    r.size = big ? 9 + Math.random() * 18
      : w.rockMinSize + Math.pow(Math.random(), 1.8) * (w.rockMaxSize - w.rockMinSize);
    r.stretch = [0.8 + Math.random() * 0.45, 0.75 + Math.random() * 0.4, 0.8 + Math.random() * 0.5];
    r.radius = r.size * Math.max(...r.stretch) * 1.05;
    r.quat.random();
    r.axis.randomDirection();
    r.spin = (Math.random() * 0.8 + 0.1) / Math.sqrt(r.size);
    r.vel.randomDirection().multiplyScalar(Math.random() * (big ? 0.4 : 1.6));
    r.nearest = Infinity; r.approached = false; r.closing = false; r.phased = false;
    r.giant = big;
    r.hp = big ? Infinity : Math.max(1, r.size * r.size * 1.2);
  }

  function place(r, ship, initial) {
    const w = config.world;
    const dir = heading(ship);
    perpA.set(0, 1, 0); if (Math.abs(dir.y) > 0.9) perpA.set(1, 0, 0);
    perpA.cross(dir).normalize();
    perpB.crossVectors(dir, perpA);

    if (r.path) {
      const dist = initial ? 70 + Math.random() * (w.fieldRadius * 0.85 - 70) : w.fieldRadius * (0.7 + Math.random() * 0.25);
      const a = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * w.pathSpread;
      r.pos.copy(ship.pos).addScaledVector(dir, dist)
        .addScaledVector(perpA, Math.cos(a) * rad).addScaledVector(perpB, Math.sin(a) * rad);
      size(r, false);
      return;
    }

    const big = Math.random() < 0.02;
    if (initial) {
      // Anywhere in the sphere, but never on top of the pilot
      do { r.pos.randomDirection().multiplyScalar(Math.cbrt(Math.random()) * w.fieldRadius); } while (r.pos.length() < 40);
      r.pos.add(ship.pos);
    } else {
      // On the far shell, in the half ahead of you
      rel.randomDirection();
      if (rel.dot(dir) < 0) rel.addScaledVector(dir, -2 * rel.dot(dir));
      rel.lerp(dir, 0.35).normalize();
      r.pos.copy(ship.pos).addScaledVector(rel, w.fieldRadius * (0.85 + Math.random() * 0.12));
    }
    size(r, big && r.pos.distanceTo(ship.pos) > 120);
  }

  function init(ship) {
    rocks.length = 0;
    const w = config.world;
    const n = Math.min(MAX_ROCKS, w.ambientRocks + w.pathRocks);
    for (let i = 0; i < n; i++) {
      const r = {
        index: i, path: i < w.pathRocks,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        quat: new THREE.Quaternion(), axis: new THREE.Vector3(),
      };
      place(r, ship, true);
      rocks.push(r);
    }
    mesh.count = n;
  }

  function update(dt, worldDt, ship) {
    const w = config.world, nm = config.nearMiss;
    const lead = nm.whooshLead;
    const range2 = w.fieldRadius * w.fieldRadius;
    const dir = heading(ship).clone();
    ship.group.getWorldQuaternion(qInv).invert();

    for (const r of rocks) {
      r.pos.addScaledVector(r.vel, worldDt);
      rel.subVectors(r.pos, ship.pos);
      const d2 = rel.lengthSq();

      // Out of range, or a path rock well behind you: respawn ahead
      if (d2 > range2 * 1.05 || (r.path && rel.dot(dir) < -40)) { place(r, ship, false); continue; }

      const reach = r.radius + nm.radius * 2 + 25;
      if (d2 < reach * reach) {
        const clearance = Math.sqrt(d2) - r.radius;
        relVel.subVectors(r.vel, ship.vel);
        const closingNow = rel.dot(relVel) < 0;

        if (clearance < nm.hitRadius) {
          if (handlers.onHit(r, clearance) === 'destroy') { place(r, ship, false); continue; }
        }

        if (closingNow) {
          r.closing = true;
          r.nearest = Math.min(r.nearest, clearance);
          // Predict the pass for the whoosh
          if (!r.approached) {
            const v2 = relVel.lengthSq();
            const t = v2 > 1e-3 ? -rel.dot(relVel) / v2 : Infinity;
            if (t < lead) {
              r.approached = true;
              closest.copy(rel).addScaledVector(relVel, t);
              const miss = closest.length() - r.radius;
              if (miss < nm.radius * 1.6) {
                closest.applyQuaternion(qInv);
                handlers.onApproach(r, miss, THREE.MathUtils.clamp(closest.x / 4, -1, 1));
              }
            }
          }
        } else if (r.closing) {
          // Just passed closest approach
          r.closing = false;
          if (r.nearest >= nm.hitRadius && r.nearest < nm.radius) {
            tmp.copy(rel).applyQuaternion(qInv);
            handlers.onNearMiss(r, r.nearest, Math.sign(tmp.x) || 1);
          }
          r.nearest = Infinity;
        }
      }

      dq.setFromAxisAngle(r.axis, r.spin * worldDt);
      r.quat.premultiply(dq);
      scl.set(r.size * r.stretch[0], r.size * r.stretch[1], r.size * r.stretch[2]);
      m4.compose(r.pos, r.quat, scl);
      mesh.setMatrixAt(r.index, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // Blasters: the first rock a segment (a to b) passes through, or null.
  // Uses a slightly shrunk sphere so hits land on the visible surface.
  const seg = new THREE.Vector3(), oc = new THREE.Vector3();
  function raycast(a, b) {
    seg.subVectors(b, a);
    const len = seg.length();
    if (len < 1e-6) return null;
    seg.divideScalar(len);
    let best = null, bestT = Infinity;
    for (const r of rocks) {
      const rr = r.radius * 0.85;
      oc.subVectors(r.pos, a);
      const t = oc.dot(seg);
      if (t < -rr || t > len + rr) continue;
      const d2 = oc.lengthSq() - t * t;
      if (d2 > rr * rr) continue;
      const hitT = Math.max(0, t - Math.sqrt(rr * rr - d2));
      if (hitT <= len && hitT < bestT) { bestT = hitT; best = r; }
    }
    return best ? { rock: best, point: a.clone().addScaledVector(seg, bestT), normal: a.clone().addScaledVector(seg, bestT).sub(best.pos).normalize() } : null;
  }

  // Returns what was destroyed (position, velocity, size), or null if it survived
  function damage(r, amount, ship) {
    r.hp -= amount;
    if (r.hp > 0) return null;
    const gone = { pos: r.pos.clone(), vel: r.vel.clone(), size: r.size };
    place(r, ship, false);
    return gone;
  }

  function dispose() { mesh.geometry.dispose(); mesh.material.dispose(); }

  return { mesh, init, update, handlers, rocks, raycast, damage, dispose };
}
