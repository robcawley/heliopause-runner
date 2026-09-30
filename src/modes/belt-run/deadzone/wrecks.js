import * as THREE from 'three/webgpu';
import { mat, partM, part, merge, scrapMaterial, glowMaterial } from './geo.js';

// The wreck field of a Dead Zone: the bones of an old battle, built from a seed around the
// zone's centre.
//   Hulls      broken capital ships. Solid; the big cover. Raiders nest in their hatches.
//   Machinery  drifting engines, turrets and containers. Solid, slowly moving.
//   Scrap      clouds of loose plating. They rattle the hull a little, and raider guns
//              cannot lock on to you inside one.
//   Mag coils  derelict coils: they charge (glow, crackle) and then throw out a magnetic
//              pulse that shoves ships away, hurting them close in. Raiders too.
//   Arcs       live cables between pylons: flicker (the warning), arc, then rest.
// Everything solid is a set of spheres, so ships, bolts and line-of-sight checks stay cheap.
//
// handlers: onCoilCharge(coil), onCoilPulse(coil), onArcWarn(arc), onArcOn(arc)
const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const PULSE_RADIUS = 70;

export function createWrecks(config) {
  const Z = config.deadZone;
  const group = new THREE.Group();
  group.visible = false;
  const hullMat = scrapMaterial({ paint: 0x4a5450, burnt: 0x101110, rim: 0x6c807b, rimStrength: 0.32, scale: 0.05 });
  const darkMat = scrapMaterial({ paint: 0x2b2c29, burnt: 0x0a0a09, rim: 0x4f5a57, rimStrength: 0.22, scale: 0.18 });
  const markMat = glowMaterial(0xff4a32, 1.2, { fog: true });     // dead running lights, faction stripes
  const pylonMat = glowMaterial(0x9fe8ff, 0.4);

  const handlers = { onCoilCharge: () => {}, onCoilPulse: () => {}, onArcWarn: () => {}, onArcOn: () => {} };
  const center = new V3();
  const hulls = [];       // { bound: {c, r}, spheres: [{c, r}] }
  const machines = [];    // { mesh, pos, vel, axis, spin, r }
  const clouds = [];      // { group, c, r, spin, axis }
  const coils = [];       // { pos, state, timer, core, ring, shock, level, pulse }
  const arcs = [];        // { a, b, state, timer, beam, strands, level }
  const hatches = [];     // { pos, normal } where raiders burst out
  const extras = [];      // pylons: static spheres { c, r }
  const disposables = [];
  let built = false, time = 0;

  const tmp = new V3(), tmp2 = new V3(), ab = new V3(), ap = new V3();
  const segDist2 = (a, b, p) => {
    ab.subVectors(b, a);
    const l2 = ab.lengthSq();
    const t = l2 > 1e-9 ? THREE.MathUtils.clamp(ap.subVectors(p, a).dot(ab) / l2, 0, 1) : 0;
    return tmp2.copy(a).addScaledVector(ab, t).distanceToSquared(p);
  };

  function addMesh(geo, material, m) {
    const mesh = new THREE.Mesh(geo, material);
    if (m) { mesh.matrixAutoUpdate = false; mesh.matrix.copy(m); }
    group.add(mesh);
    disposables.push(geo);
    return mesh;
  }

  // ---- A broken capital ship -------------------------------------------------------
  function buildHull(r, pos, quat) {
    const L = 50 + r() * 85, rad = 7 + r() * 8;
    const pieces = 1 + Math.floor(r() * 2.6);
    const gh = [], gd = [], gm = [];
    const local = [], hatchLocal = [];
    const segLen = L / pieces;
    let z = -L / 2, bx = 0, by = 0, ox = 0, oy = 0;
    for (let k = 0; k < pieces; k++) {
      const len = segLen * (0.72 + r() * 0.2);
      const zc = z + len / 2;
      const flat = 0.82 + r() * 0.18;
      const sm = mat(ox, oy, zc, bx, by, r() * 0.4, 1, flat, 1);
      const sides = r() < 0.5 ? 6 : 8;
      gh.push(partM(new THREE.CylinderGeometry(rad, rad * (0.8 + r() * 0.25), len, sides).rotateX(Math.PI / 2), sm));
      // Plating strakes and a keel
      gd.push(partM(new THREE.BoxGeometry(rad * 0.3, rad * 0.5, len * 0.9), sm.clone().multiply(mat(0, -rad * flat * 0.95, 0))));
      for (let s = 0; s < 3; s++) {
        const a = r() * TAU;
        gh.push(partM(new THREE.BoxGeometry(rad * 0.9, 0.5, len * (0.2 + r() * 0.3)), sm.clone().multiply(mat(Math.cos(a) * rad * 0.95, Math.sin(a) * rad * 0.95, (r() - 0.5) * len * 0.5, 0, 0, a + Math.PI / 2))));
      }
      // A faint faction stripe and a couple of dead lights
      gm.push(partM(new THREE.BoxGeometry(0.35, 0.35, len * 0.55), sm.clone().multiply(mat(rad * 0.98, 0, 0))));
      for (let s = 0; s < 2; s++) {
        const a = r() * TAU;
        gm.push(partM(new THREE.SphereGeometry(0.45, 6, 4), sm.clone().multiply(mat(Math.cos(a) * rad * 1.02, Math.sin(a) * rad * flat * 1.02, (r() - 0.5) * len * 0.8))));
      }
      // Colliders along the segment
      const cr = rad * 0.93;
      for (let d = -len / 2 + cr * 0.6; d <= len / 2 - cr * 0.6 + 0.01; d += cr * 1.1) {
        local.push({ c: new V3(0, 0, d).applyMatrix4(sm), r: cr });
      }
      if (local.length === 0) local.push({ c: new V3(ox, oy, zc), r: cr });
      // Hatches: where raiders burst out
      for (let h = 0; h < 2; h++) {
        const a = r() * TAU;
        const p = new V3(Math.cos(a) * rad * 1.35, Math.sin(a) * rad * flat * 1.35, (r() - 0.5) * len * 0.6).applyMatrix4(sm);
        const n = new V3(Math.cos(a), Math.sin(a), 0).transformDirection(sm);
        hatchLocal.push({ p, n });
      }
      // The break: exposed ribs and torn plates
      if (k < pieces - 1) {
        const endZ = zc + len / 2;
        for (let s = 0; s < 4; s++) {
          const arc = Math.PI * (0.9 + r() * 0.7);
          gd.push(part(new THREE.TorusGeometry(rad * 0.94, 0.4, 4, 12, arc), ox, oy, endZ + s * 2.4, bx, by, r() * TAU));
        }
        for (let s = 0; s < 5; s++) {
          gh.push(part(new THREE.BoxGeometry(rad * (0.4 + r() * 0.6), 0.3, rad * (0.3 + r() * 0.5)), ox + (r() - 0.5) * rad, oy + (r() - 0.5) * rad, endZ + r() * 3, r() * 3, r() * 3, r() * 3));
        }
        bx += (r() - 0.5) * 0.3; by += (r() - 0.5) * 0.3;
        ox += (r() - 0.5) * rad * 0.8; oy += (r() - 0.5) * rad * 0.8;
      }
      // A bridge tower on the middle piece, engines on the last
      if (k === Math.floor(pieces / 2)) {
        const tm = sm.clone().multiply(mat(0, rad * flat + rad * 0.35, len * 0.1));
        gh.push(partM(new THREE.BoxGeometry(rad * 0.8, rad * 0.8, len * 0.22), tm));
        gm.push(partM(new THREE.BoxGeometry(rad * 0.7, 0.4, 0.3), tm.clone().multiply(mat(0, rad * 0.2, -len * 0.11))));
        local.push({ c: new V3(0, 0, 0).applyMatrix4(tm), r: rad * 0.55 });
      }
      if (k === pieces - 1) {
        for (const sx of [-1, 1]) {
          gd.push(partM(new THREE.CylinderGeometry(rad * 0.32, rad * 0.4, 12, 8).rotateX(Math.PI / 2), sm.clone().multiply(mat(sx * rad * 0.5, 0, len / 2 + 5))));
        }
      }
      z += segLen;
    }
    const m = new THREE.Matrix4().compose(pos, quat, new V3(1, 1, 1));
    addMesh(merge(gh), hullMat, m);
    addMesh(merge(gd), darkMat, m);
    addMesh(merge(gm), markMat, m);
    const spheres = local.map((s) => ({ c: s.c.clone().applyMatrix4(m), r: s.r }));
    const bound = { c: pos.clone(), r: L / 2 + rad * 2.5 };
    hulls.push({ bound, spheres });
    for (const h of hatchLocal) hatches.push({ pos: h.p.clone().applyMatrix4(m), normal: h.n.clone().transformDirection(m) });
    return { L, rad };
  }

  // ---- Drifting machinery ------------------------------------------------------------
  const machineKinds = [
    () => ({ r: 4.6, g: [
      part(new THREE.CylinderGeometry(2.4, 3.1, 8, 8).rotateX(Math.PI / 2)),
      part(new THREE.ConeGeometry(2.6, 3, 8, 1, true).rotateX(-Math.PI / 2), 0, 0, 5.3),
      part(new THREE.TorusGeometry(3.2, 0.4, 4, 12), 0, 0, -2),
    ] }),
    () => ({ r: 4.2, g: [
      part(new THREE.BoxGeometry(4.4, 1.8, 4.4)),
      part(new THREE.BoxGeometry(3, 2, 3.4), 0, 1.8, 0, 0, 0.4, 0),
      part(new THREE.CylinderGeometry(0.3, 0.3, 7, 6).rotateX(Math.PI / 2), 0.7, 2, -4, 0, 0.4, 0),
      part(new THREE.CylinderGeometry(0.3, 0.3, 6, 6).rotateX(Math.PI / 2), -0.7, 2, -3.5, 0.1, 0.4, 0),
    ] }),
    () => ({ r: 5.2, g: [
      part(new THREE.BoxGeometry(4, 4, 9)),
      part(new THREE.BoxGeometry(4.3, 0.4, 0.5), 0, 2, -3), part(new THREE.BoxGeometry(4.3, 0.4, 0.5), 0, 2, 3),
      part(new THREE.BoxGeometry(0.4, 4.3, 0.5), 2, 0, 0),
    ] }),
    () => ({ r: 4.6, g: [
      part(new THREE.TorusGeometry(3.4, 0.9, 6, 12)),
      part(new THREE.IcosahedronGeometry(1.8, 0)),
      part(new THREE.BoxGeometry(0.5, 7.5, 0.5)),
    ] }),
  ];
  function buildMachine(r, pos) {
    const kind = machineKinds[Math.floor(r() * machineKinds.length)]();
    const s = 0.8 + r() * 0.8;
    const mesh = new THREE.Mesh(merge(kind.g), r() < 0.5 ? hullMat : darkMat);
    disposables.push(mesh.geometry);
    mesh.scale.setScalar(s);
    mesh.position.copy(pos);
    mesh.quaternion.setFromEuler(new THREE.Euler(r() * TAU, r() * TAU, r() * TAU));
    group.add(mesh);
    machines.push({
      mesh, pos: mesh.position, r: kind.r * s,
      vel: new V3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.6 + r() * 2.4),
      axis: new V3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), spin: (r() - 0.5) * 0.5,
    });
  }

  // ---- Scrap clouds -------------------------------------------------------------------
  const plateGeo = new THREE.BoxGeometry(1, 0.12, 0.7);
  function buildCloud(r, pos) {
    const cr = 32 + r() * 22, count = 150;
    const inst = new THREE.InstancedMesh(plateGeo, r() < 0.5 ? hullMat : darkMat, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      tmp.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(Math.cbrt(r()) * cr);
      const s = 0.5 + Math.pow(r(), 2) * 3;
      m.copy(mat(tmp.x, tmp.y * 0.6, tmp.z, r() * TAU, r() * TAU, r() * TAU, s, s, s));
      inst.setMatrixAt(i, m);
    }
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(inst);
    group.add(g);
    clouds.push({ group: g, c: pos.clone(), r: cr, spin: (r() < 0.5 ? -1 : 1) * (0.04 + r() * 0.05), axis: new V3(r() - 0.5, 1, r() - 0.5).normalize(), inst });
  }

  // ---- Mag coils ------------------------------------------------------------------------
  function buildCoil(r, pos) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.quaternion.setFromEuler(new THREE.Euler(r() * TAU, r() * TAU, 0));
    const bodyGeo = merge([
      part(new THREE.TorusGeometry(9, 1.5, 6, 20)),
      ...[0, 1, 2, 3].map((k) => part(new THREE.BoxGeometry(2.2, 4, 3.2), Math.cos(k * TAU / 4) * 9, Math.sin(k * TAU / 4) * 9, 0, 0, 0, k * TAU / 4)),
    ]);
    disposables.push(bodyGeo);
    g.add(new THREE.Mesh(bodyGeo, darkMat));
    const ringMat = glowMaterial(0x7fe8ff, 0.2, { additive: true });
    const coreMat = glowMaterial(0x9ff0ff, 0.3);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.35, 4, 40), ringMat);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), coreMat);
    disposables.push(ring.geometry, core.geometry);
    g.add(ring, core);
    const shockMat = glowMaterial(0x6fdcff, 0, { additive: true });
    const shock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), shockMat);
    shock.visible = false;
    disposables.push(shock.geometry);
    group.add(g, shock);
    shock.position.copy(pos);
    coils.push({ pos: pos.clone(), group: g, ringMat, coreMat, shock, shockMat, state: 'idle', timer: 2 + r() * 5, pulse: 0, r: 10.5, radius: PULSE_RADIUS, level: 0 });
  }

  // ---- Arc pylons -------------------------------------------------------------------------
  const pylonGeo = new THREE.OctahedronGeometry(1.6, 0);
  function buildArc(r, a, b) {
    const pa = new THREE.Mesh(pylonGeo, darkMat), pb = new THREE.Mesh(pylonGeo, darkMat);
    const ta = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), pylonMat), tb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), pylonMat);
    disposables.push(ta.geometry, tb.geometry);
    pa.position.copy(a); pb.position.copy(b); ta.position.copy(a); tb.position.copy(b);
    pa.scale.set(1.2, 2.4, 1.2); pb.scale.set(1.2, 2.4, 1.2);
    const beamMat = glowMaterial(0xaef2ff, 0, { additive: true });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 6, 1, true), beamMat);
    disposables.push(beam.geometry);
    beam.position.copy(a).add(b).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new V3(0, 1, 0), tmp.subVectors(b, a).normalize());
    beam.scale.set(1, a.distanceTo(b), 1);
    beam.visible = false;
    const strands = [0, 1].map(() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
      disposables.push(geo);
      const line = new THREE.Line(geo, new THREE.LineBasicNodeMaterial({ color: new THREE.Color(1.6, 2.6, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      line.frustumCulled = false;
      line.visible = false;
      group.add(line);
      return line;
    });
    group.add(pa, pb, ta, tb, beam);
    extras.push({ c: a.clone(), r: 2.6 }, { c: b.clone(), r: 2.6 });
    arcs.push({ a: a.clone(), b: b.clone(), beam, beamMat, strands, state: 'off', timer: 1 + r() * 3, level: 0, cooldown: 0 });
  }

  // ---- Build and clear ------------------------------------------------------------------
  function build(c, seed) {
    clear();
    center.copy(c);
    const r = rng(seed);
    const R = Z.radius;
    const placed = [];   // { c, r } keep-outs
    const clearOf = (p, rad) => {
      tmp.subVectors(p, center);
      // The way in stays open: a corridor down the lane's line on the near side
      if (Math.hypot(tmp.x, tmp.y) < 60 + rad && tmp.z > -R * 0.35) return false;
      return placed.every((o) => o.c.distanceTo(p) > o.r + rad);
    };
    const spot = (minR, maxR, rad) => {
      for (let i = 0; i < 24; i++) {
        const p = new V3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(minR + Math.cbrt(r()) * (maxR - minR));
        p.y *= 0.7;
        p.add(center);
        if (clearOf(p, rad)) return p;
      }
      return null;
    };
    for (let i = 0; i < Z.wrecks; i++) {
      const p = spot(R * 0.15, R * 0.88, 45);
      if (!p) continue;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 1.4, r() * TAU, (r() - 0.5) * 1.4));
      const { L } = buildHull(r, p, q);
      placed.push({ c: p, r: L * 0.42 });
    }
    for (let i = 0; i < Z.scrapClouds; i++) { const p = spot(R * 0.2, R * 0.8, 50); if (p) { buildCloud(r, p); placed.push({ c: p, r: 30 }); } }
    for (let i = 0; i < Z.magCoils; i++) { const p = spot(R * 0.15, R * 0.75, 30); if (p) { buildCoil(r, p); placed.push({ c: p, r: 20 }); } }
    for (let i = 0; i < Z.arcs; i++) {
      const a = spot(R * 0.15, R * 0.8, 40);
      if (!a) continue;
      const b = a.clone().add(new V3(r() - 0.5, (r() - 0.5) * 0.5, r() - 0.5).normalize().multiplyScalar(45 + r() * 35));
      buildArc(r, a, b);
      placed.push({ c: a.clone().lerp(b, 0.5), r: 45 });
    }
    for (let i = 0; i < Z.machinery; i++) { const p = spot(R * 0.1, R * 0.85, 12); if (p) { buildMachine(r, p); placed.push({ c: p, r: 6 }); } }
    group.visible = true;
    built = true;
  }

  function clear() {
    for (const g of disposables) g.dispose?.();
    disposables.length = 0;
    for (const a of arcs) a.strands.forEach((s) => s.material.dispose());
    for (const c of coils) { c.ringMat.dispose(); c.coreMat.dispose(); c.shockMat.dispose(); }
    for (const a of arcs) a.beamMat.dispose();
    group.clear();
    hulls.length = 0; machines.length = 0; clouds.length = 0; coils.length = 0; arcs.length = 0; hatches.length = 0; extras.length = 0;
    group.visible = false;
    built = false;
  }

  // ---- Queries ------------------------------------------------------------------------------
  // The deepest overlap of a sphere at p with anything solid: { depth, normal, kind, vel }
  const hitN = new V3();
  function collide(p, radius, out) {
    if (!built) return null;
    let best = 0, kind = '', vel = null;
    const test = (c, r, k, v) => {
      const d = p.distanceTo(c);
      const depth = r + radius - d;
      if (depth > best) { best = depth; kind = k; vel = v; hitN.subVectors(p, c).divideScalar(Math.max(d, 1e-4)); }
    };
    for (const h of hulls) {
      if (p.distanceTo(h.bound.c) > h.bound.r + radius) continue;
      for (const s of h.spheres) test(s.c, s.r, 'hull', null);
    }
    for (const m of machines) test(m.pos, m.r, 'machine', m.vel);
    for (const c of coils) test(c.pos, c.r, 'coil', null);
    for (const e of extras) test(e.c, e.r, 'pylon', null);
    if (best <= 0) return null;
    out.copy(hitN);
    return { depth: best, normal: out, kind, vel };
  }
  function solid(p) { return !!collide(p, 0, tmp); }
  // Line of sight: true if something solid sits between a and b
  function blocked(a, b) {
    if (!built) return false;
    const hit = (c, r) => segDist2(a, b, c) < r * r * 0.8;
    for (const h of hulls) {
      if (!hit(h.bound.c, h.bound.r)) continue;
      for (const s of h.spheres) if (hit(s.c, s.r)) return true;
    }
    for (const m of machines) if (hit(m.pos, m.r)) return true;
    return false;
  }
  // 0..1: how deep in a scrap cloud p is
  function inScrap(p) {
    let k = 0;
    for (const c of clouds) k = Math.max(k, 1 - p.distanceTo(c.c) / c.r);
    return k;
  }
  // An arc that is live and touching the sphere at p, or null
  function arcAt(p, radius) {
    for (const a of arcs) if (a.state === 'on' && segDist2(a.a, a.b, p) < (2.4 + radius) ** 2) return a;
    return null;
  }

  // ---- Animation ----------------------------------------------------------------------------
  const q = new THREE.Quaternion();
  function jitterStrand(line, a, b, amp) {
    const arr = line.geometry.attributes.position.array;
    ab.subVectors(b, a);
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const env = Math.sin(t * Math.PI) * amp;
      arr[i * 3] = a.x + ab.x * t + (Math.random() - 0.5) * env;
      arr[i * 3 + 1] = a.y + ab.y * t + (Math.random() - 0.5) * env;
      arr[i * 3 + 2] = a.z + ab.z * t + (Math.random() - 0.5) * env;
    }
    line.geometry.attributes.position.needsUpdate = true;
  }

  function update(dt) {
    if (!built) return;
    time += dt;
    markMat.userData.level.value = 0.8 + 0.5 * (Math.sin(time * 2.1) > 0.6 ? 1 : 0);
    for (const m of machines) {
      m.pos.addScaledVector(m.vel, dt);
      if (m.pos.distanceTo(center) > Z.radius * 0.9) m.vel.addScaledVector(tmp.subVectors(center, m.pos).normalize(), dt * 2);
      q.setFromAxisAngle(m.axis, m.spin * dt);
      m.mesh.quaternion.premultiply(q);
    }
    for (const c of clouds) { q.setFromAxisAngle(c.axis, c.spin * dt); c.group.quaternion.premultiply(q); }
    for (const c of coils) {
      c.timer -= dt;
      if (c.state === 'idle' && c.timer <= 0) { c.state = 'charge'; c.timer = 1.7; handlers.onCoilCharge(c); }
      else if (c.state === 'charge' && c.timer <= 0) { c.state = 'pulse'; c.timer = 0.5; c.pulse = 0; handlers.onCoilPulse(c); }
      else if (c.state === 'pulse' && c.timer <= 0) { c.state = 'idle'; c.timer = 4 + Math.random() * 3.5; }
      const charge = c.state === 'charge' ? 1 - c.timer / 1.7 : 0;
      c.level = charge;
      c.ringMat.userData.level.value = 0.2 + charge * charge * 3.2 + (c.state === 'charge' ? Math.random() * charge : 0);
      c.coreMat.userData.level.value = 0.3 + charge * 2.5;
      c.group.rotation.z += dt * (0.2 + charge * 6);
      if (c.state === 'pulse') {
        const k = 1 - c.timer / 0.5;
        c.shock.visible = true;
        c.shock.scale.setScalar(4 + k * c.radius);
        c.shockMat.userData.level.value = (1 - k) * 0.9;
      } else c.shock.visible = false;
    }
    for (const a of arcs) {
      a.timer -= dt;
      if (a.state === 'off' && a.timer <= 0) { a.state = 'warn'; a.timer = 0.9; handlers.onArcWarn(a); }
      else if (a.state === 'warn' && a.timer <= 0) { a.state = 'on'; a.timer = 2.2; handlers.onArcOn(a); }
      else if (a.state === 'on' && a.timer <= 0) { a.state = 'off'; a.timer = 2.6 + Math.random() * 1.2; }
      const on = a.state === 'on', warn = a.state === 'warn';
      a.beam.visible = on || (warn && Math.random() < 0.35);
      a.beamMat.userData.level.value = on ? 1.4 + Math.random() * 0.8 : 0.35;
      a.strands.forEach((s, i) => {
        s.visible = on || (warn && Math.random() < 0.5);
        if (s.visible) jitterStrand(s, a.a, a.b, on ? 3.2 + i * 1.5 : 1.4);
      });
    }
  }

  // Force an arc or coil to the start of its warning (the director uses this to set a scene)
  return {
    group, handlers, build, clear, update, collide, solid, blocked, inScrap, arcAt,
    hatches, coils, arcs, clouds, machines, center,
    get built() { return built; },
    dispose() { clear(); plateGeo.dispose(); pylonGeo.dispose(); hullMat.dispose(); darkMat.dispose(); markMat.dispose(); pylonMat.dispose(); },
  };
}
