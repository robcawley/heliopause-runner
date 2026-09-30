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
  const step = new THREE.Vector3();
  const prevRel = new THREE.Vector3();
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
    r.baseRadius = r.radius;
    r.damageScale = 1;
    r.quat.random();
    r.axis.randomDirection();
    r.spin = (Math.random() * 0.8 + 0.1) / Math.sqrt(r.size);
    r.vel.randomDirection().multiplyScalar(Math.random() * (big ? 0.4 : 1.6));
    r.nearest = Infinity; r.approached = false; r.closing = false; r.phased = false;
    r.giant = big;
    r.hp = big ? Infinity : Math.max(1, r.size * r.size * 1.2);
    r.maxHp = r.hp;
  }

  function placeOnce(r, ship, initial) {
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

  // Settlements (or anything else) can clear airspace: a rock that lands inside it is placed
  // again, and if nowhere will do this frame it is parked out of range to try the next
  let exclude = null;
  function place(r, ship, initial) {
    for (let i = 0; i < 8; i++) {
      placeOnce(r, ship, initial);
      if (!exclude || !exclude(r.pos, r.radius)) return;
    }
    r.pos.copy(ship.pos).addScaledVector(heading(ship), config.world.fieldRadius * 2);
  }

  function init(ship) {
    rocks.length = 0;
    const w = config.world;
    const pathCount = Math.round(w.pathRocks * (config.run?.density ?? 1));   // contracts thin or thicken the rocks on your line
    const n = Math.min(MAX_ROCKS, w.ambientRocks + pathCount);
    for (let i = 0; i < n; i++) {
      const r = {
        index: i, path: i < pathCount,
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
      if (exclude && exclude(r.pos, r.radius)) { place(r, ship, false); continue; }
      rel.subVectors(r.pos, ship.pos);
      const d2 = rel.lengthSq();

      // Out of range, or a path rock well behind you: respawn ahead
      if (d2 > range2 * 1.05 || (r.path && rel.dot(dir) < -40)) { place(r, ship, false); continue; }

      const reach = r.radius + nm.radius * 2 + 25;
      if (d2 < reach * reach) {
        relVel.subVectors(r.vel, ship.vel);
        const closingNow = rel.dot(relVel) < 0;
        // Swept test: the closest the rock came to the pilot at any moment of this frame's
        // movement, not just where it ended up. At boost and a low frame rate the ship moves
        // further per frame than a small rock is wide, so sampling the end point alone let
        // rocks pass through the hull and even score as near misses.
        step.copy(relVel).multiplyScalar(worldDt);
        prevRel.subVectors(rel, step);
        const s2 = step.lengthSq();
        const u = s2 > 1e-9 ? THREE.MathUtils.clamp(-prevRel.dot(step) / s2, 0, 1) : 1;
        const clearance = prevRel.addScaledVector(step, u).length() - r.radius;
        if (clearance < nm.hitRadius) {
          if (handlers.onHit(r, clearance) === 'destroy') { place(r, ship, false); continue; }
        } else if (r.phased && !closingNow) r.phased = false;   // phased right through and clear of it
        if (closingNow || r.closing) r.nearest = Math.min(r.nearest, clearance);
        if (closingNow) {
          r.closing = true;
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
      scl.set(r.size * r.stretch[0], r.size * r.stretch[1], r.size * r.stretch[2]).multiplyScalar(r.damageScale);
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
    if (r.hp > 0) {
      // Each impact breaks away some of the silhouette, and the collision
      // sphere follows it. Even a large rock changes shape as shots land.
      if (!r.giant) {
        r.damageScale = 0.68 + 0.32 * (r.hp / r.maxHp);
        r.radius = r.baseRadius * r.damageScale;
      }
      return null;
    }
    const gone = { pos: r.pos.clone(), vel: r.vel.clone(), size: r.size };
    place(r, ship, false);
    return gone;
  }

  // The first rock whose surface the pilot will reach within `horizon` seconds on the
  // current course, or null. PIP uses it so the autopilot never flies you into ice.
  function predictHit(ship, horizon) {
    const hitR = config.nearMiss.hitRadius;
    let best = null, bestT = horizon;
    for (const r of rocks) {
      rel.subVectors(r.pos, ship.pos);
      relVel.subVectors(r.vel, ship.vel);
      const R = r.radius + hitR;
      const c = rel.lengthSq() - R * R;
      if (c <= 0) continue;                       // already touching: the hit test has it
      const b = rel.dot(relVel);
      if (b >= 0) continue;                       // moving apart
      const a = relVel.lengthSq();
      const disc = b * b - a * c;
      if (disc < 0) continue;                     // passes clear
      const t = (-b - Math.sqrt(disc)) / a;
      if (t < bestT) { bestT = t; best = r; }
    }
    if (!best) return null;
    const side = Math.sign(rel.subVectors(best.pos, ship.pos).dot(ship.right)) || 1;
    return { rock: best, t: bestT, side };
  }

  function dispose() { mesh.geometry.dispose(); mesh.material.dispose(); }

  return { mesh, init, update, handlers, rocks, raycast, damage, predictHit, dispose, setExclusion(fn) { exclude = fn; } };
}
