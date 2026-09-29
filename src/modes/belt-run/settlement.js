import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, uniform, uv, positionLocal, instancedBufferAttribute,
  floor, fract, hash, mix, step, abs, smoothstep, sin, time, saturate, mx_noise_float,
} from 'three/tsl';

// Settlements: towns cut into giant asteroids that straddle the beacon lane.
//
// Every so often (config.settlement: firstAt, then roughly every `spacing` metres) the lane
// runs straight through a giant rock split by a canyon. The canyon walls are lined with
// stacked buildings, neon strips and signs, cables strung wall to wall, landing pads on the
// floor and slow local traffic. The town keeps its airspace clear: no belt rocks and no
// repair gates inside, and its dock limits are a no-fire zone where the blasters jam
// (config.settlement.jamBlasters; an upgrade can switch that off later).
//
// Only one settlement exists at a time. The shape is built once; each new settlement moves
// it down the lane, tilts it about the lane's axis, renames it and repaints its neon, so no
// two feel quite the same.
//
// Frame: the settlement's own space has the canyon running along z (the lane), its floor
// below and its walls either side of x = 0. The group sits on the lane's centre line and
// rotates only about z, so a point on the lane's axis is the same in both frames.

const NAMES = [
  'Varda Steps', 'Arrokoth Market', 'Salacia Cut', 'Haumea Reach', 'Gonggong Narrows',
  'Ixion Row', 'Sedna Lanterns', 'Orcus Ward', 'Quaoar Landing', 'Makemake Drift',
];
// Three neon colours per town (HDR, so they bloom)
const PALETTES = [
  [[3.2, 0.35, 1.9], [0.3, 2.4, 3.2], [3.0, 1.7, 0.35]],     // magenta, cyan, amber
  [[0.35, 3.0, 1.2], [3.2, 0.5, 0.4], [2.6, 2.4, 0.5]],      // green, red, yellow
  [[1.3, 0.6, 3.4], [3.2, 1.1, 0.25], [0.3, 2.8, 2.6]],      // violet, orange, teal
];

const FLOOR = -55;          // canyon floor, metres below the lane's centre line
const MOUTH = 300;          // the canyon runs from z -MOUTH to +MOUTH in the town's frame
const ZONE = MOUTH + 260;   // dock limits: the no-fire zone reaches this far along the lane
const CLEAR = 620;          // belt rocks and repair gates are kept out of a cylinder this long
const CLEAR_R = 520;        //   and this wide around the lane
const PASS = 700;           // a town stays in place until you are this far past its centre

const hash1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// The cut faces of the canyon: rough, but never inside the canyon's nominal width
const wallNoise = (y, z) => Math.max(0, 4.5 + 2.5 * Math.sin(y * 0.045 + z * 0.013) + 1.6 * Math.sin(z * 0.09 + 1.3) + 1.0 * Math.sin(y * 0.21 + z * 0.05));
const floorNoise = (x, z) => Math.max(0, 3 + 2 * Math.sin(x * 0.05 + z * 0.02) + 1.2 * Math.sin(z * 0.11 + 0.4));

export function createSettlement(config) {
  const S = config.settlement;
  const half = S.canyonWidth / 2;
  const SHIP_R = config.nearMiss.hitRadius;
  const rand = rng(90210);
  const V3 = THREE.Vector3;

  // ---- The rock: two walls and a floor, each a rough ellipsoid with one side sliced flat ----
  const blobs = [
    { kind: 'wall', side: -1, c: new V3(-(half + 150), 20, 0), r: new V3(260, 190, 380) },
    { kind: 'wall', side: 1, c: new V3(half + 150, 20, 0), r: new V3(260, 190, 380) },
    { kind: 'floor', side: 0, c: new V3(0, -160, 0), r: new V3(210, 150, 440) },
  ];
  for (const b of blobs) {
    b.minR = Math.min(b.r.x, b.r.y, b.r.z);
    b.ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
    b.craters = Array.from({ length: 9 }, () => ({
      c: new V3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), r: 0.12 + rand() * 0.2, d: 0.02 + rand() * 0.04,
    }));
  }
  // Radius multiplier of a blob's surface in unit-sphere direction n (the same for mesh and collision)
  function shell(b, n) {
    let h = 1 + 0.07 * Math.sin(n.x * 3.1 + n.y * 1.7 + b.ph[0])
      + 0.04 * Math.sin(n.y * 5.3 - n.z * 2.2 + b.ph[1])
      + 0.02 * Math.sin(n.z * 9.7 + n.x * 4.1 + b.ph[2]);
    for (const k of b.craters) {
      const d = n.distanceTo(k.c);
      if (d < k.r) h -= k.d * Math.cos((d / k.r) * Math.PI * 0.5);
    }
    return h;
  }
  // How far p lies beyond a blob's cut face, on the rock side (negative: in the canyon's air)
  function faceDepth(b, p) {
    if (b.kind === 'wall') return b.side * p.x - (half + wallNoise(p.y, p.z));
    return (FLOOR - floorNoise(p.x, p.z)) - p.y;
  }
  function blobGeometry(b) {
    const g = new THREE.IcosahedronGeometry(1, 44);     // non-indexed: flat facets, like the belt
    const pos = g.attributes.position;
    const v = new V3(), n = new V3();
    for (let i = 0; i < pos.count; i++) {
      n.fromBufferAttribute(pos, i).normalize();
      v.copy(n).multiplyScalar(shell(b, n)).multiply(b.r).add(b.c);
      if (faceDepth(b, v) < 0) {                        // slice: move it onto the canyon face
        if (b.kind === 'wall') v.x = b.side * (half + wallNoise(v.y, v.z));
        else v.y = FLOOR - floorNoise(v.x, v.z);
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  // ---- The town: generated once, from a fixed seed ----
  const boxes = [];      // building colliders, axis-aligned in the town's frame
  const bodies = [];     // [x, y, z, sx, sy, sz] building blocks
  const neon = [];       // [x, y, z, sx, sy, sz, paletteIndex, phase]
  const arches = [];     // [x, y, z, sx, sy, sz] the neon frames at each canyon mouth
  const blinks = [];     // [x, y, z, size, r, g, b, phase] slow warning beacons
  const cables = [];     // [x, y, z, sx, sy, sz]
  // Is (y, z) comfortably on the flat canyon face of a wall?
  const onFace = (y, z) => { const a = (y - 20) / 140, c = z / 280; return a * a + c * c < 1; };

  for (const side of [-1, 1]) {
    for (let z = -275; z < 275; z += 9 + rand() * 16) {
      if (rand() < 0.14) continue;                       // a gap: bare rock
      const w = 7 + rand() * 11;
      let y = FLOOR + 4 + rand() * 12;
      for (let s = 0; s < 5; s++) {
        const h = 7 + rand() * 20, d = 4 + rand() * 8;
        if (y + h > 125 || !onFace(y + h / 2, z)) break;
        const inner = half - d, outer = half + 12;       // buried 12 m into the rock behind
        const x0 = side < 0 ? -outer : inner, x1 = side < 0 ? -inner : outer;
        boxes.push({ min: new V3(x0, y, z - w / 2), max: new V3(x1, y + h, z + w / 2) });
        bodies.push([(x0 + x1) / 2, y + h / 2, z, x1 - x0, h, w]);
        // Neon on the face that looks into the canyon
        const fx = side * (inner - 0.25), pal = Math.floor(rand() * 3), ph = rand() * 6.28, roll = rand();
        if (roll < 0.4) neon.push([fx, y + h * (0.55 + rand() * 0.35), z, 0.3, 0.3, w * 0.85, pal, ph]);
        else if (roll < 0.7) neon.push([fx, y + h / 2, z + (rand() - 0.5) * w * 0.6, 0.3, h * 0.75, 0.3, pal, ph]);
        else if (roll < 0.86) {
          const sw = w * 0.6, sh = Math.min(h * 0.5, 6), cy = y + h * 0.6;
          neon.push(
            [fx, cy + sh / 2, z, 0.25, 0.25, sw, pal, ph], [fx, cy - sh / 2, z, 0.25, 0.25, sw, pal, ph],
            [fx, cy, z - sw / 2, 0.25, sh, 0.25, pal, ph], [fx, cy, z + sw / 2, 0.25, sh, 0.25, pal, ph],
          );
        }
        if (rand() < 0.22) blinks.push([fx, y + h + 0.6, z, 0.7, 3.2, 0.3, 0.2, rand() * 6.28]);
        y += h + (rand() < 0.55 ? 0 : 3 + rand() * 9);
      }
    }
    // Red warning lights along the rim of each wall
    for (let z = -260; z <= 260; z += 40) {
      const top = 20 + 145 * Math.sqrt(Math.max(0, 1 - (z / 300) ** 2));
      blinks.push([side * (half - 1), top - 8, z, 1.4, 3.4, 0.25, 0.2, rand() * 6.28]);
    }
  }
  // Cables strung wall to wall, high above the flight line, with lamps along them
  for (let i = 0; i < 10; i++) {
    const y = 55 + rand() * 80, z = -250 + rand() * 500, pal = Math.floor(rand() * 3);
    cables.push([0, y, z, S.canyonWidth + 24, 0.35, 0.35]);
    for (let x = -half + 4; x < half - 3; x += 7 + rand() * 4) neon.push([x, y - 0.9, z, 0.6, 0.6, 0.6, pal, rand() * 6.28]);
  }
  // Landing pads on the floor
  for (let i = 0; i < 4; i++) {
    const x = (rand() - 0.5) * 36, z = -220 + i * 145 + rand() * 30;
    const y = FLOOR - floorNoise(x, z) + 0.4, pal = Math.floor(rand() * 3), ph = rand() * 6.28;
    boxes.push({ min: new V3(x - 9, y - 1, z - 9), max: new V3(x + 9, y + 0.4, z + 9) });
    bodies.push([x, y - 0.3, z, 18, 1.4, 18]);
    neon.push([x, y + 0.5, z - 9, 18, 0.3, 0.3, pal, ph], [x, y + 0.5, z + 9, 18, 0.3, 0.3, pal, ph],
      [x - 9, y + 0.5, z, 0.3, 0.3, 18, pal, ph], [x + 9, y + 0.5, z, 0.3, 0.3, 18, pal, ph]);
  }
  // A lit frame at each canyon mouth: seen from far off, it shows you the way in
  for (const zs of [-1, 1]) {
    const z = zs * (MOUTH - 5), px = half - 14, top = 95;
    arches.push([-px, (FLOOR + top) / 2, z, 0.9, top - FLOOR, 0.9], [px, (FLOOR + top) / 2, z, 0.9, top - FLOOR, 0.9],
      [0, top, z, px * 2 + 0.9, 0.9, 0.9], [0, top - 6, z, px * 2 - 8, 0.5, 0.5]);
  }
  // Local traffic: slow lights moving along the canyon, well above the flight line
  const traffic = Array.from({ length: 14 }, () => ({
    x: (rand() - 0.5) * 50, y: 35 + rand() * 95, z0: rand() * 640, speed: (12 + rand() * 20) * (rand() < 0.5 ? -1 : 1),
    warm: rand() < 0.6,
  }));

  // ---- Materials ----
  const uGlow = uniform(new THREE.Color(1, 0.3, 0.8));
  const rockMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.86, metalness: 0.04, flatShading: true });
  rockMat.colorNode = Fn(() => {
    const n = mx_noise_float(positionLocal.mul(0.018)).mul(0.5).add(0.5);
    const streak = mx_noise_float(positionLocal.mul(vec3(0.006, 0.05, 0.006))).mul(0.5).add(0.5);
    return mix(vec3(0.07, 0.068, 0.075), vec3(0.36, 0.4, 0.47), saturate(n.mul(1.3).sub(streak.mul(0.45))));
  })();
  // A faint wash of the town's neon on the rock near the canyon
  rockMat.emissiveNode = Fn(() => {
    const near = smoothstep(half + 70, half, abs(positionLocal.x));
    const low = smoothstep(170, -40, positionLocal.y);
    return uGlow.mul(near.mul(low).mul(0.05));
  })();

  // Buildings: dark blocks with lit windows. Window size comes from each block's real size.
  const bodyData = new Float32Array(bodies.length * 4);
  bodies.forEach((b, i) => { bodyData.set([b[5], b[4], rand() * 100, 0], i * 4); });
  const bodyAttr = instancedBufferAttribute(new THREE.InstancedBufferAttribute(bodyData, 4));
  const bodyMat = new THREE.MeshStandardNodeMaterial({ color: 0x232833, roughness: 0.6, metalness: 0.45 });
  bodyMat.emissiveNode = Fn(() => {
    const u = uv().x.mul(bodyAttr.x).div(2.6);
    const v = uv().y.mul(bodyAttr.y).div(3.4);
    const cell = floor(u).add(floor(v).mul(157.0)).add(bodyAttr.z.mul(1000.0));
    const lit = step(0.5, hash(cell));
    const fu = fract(u), fv = fract(v);
    const pane = step(0.2, fu).mul(step(fu, 0.78)).mul(step(0.28, fv)).mul(step(fv, 0.74));
    const tint = mix(vec3(2.4, 1.45, 0.62), vec3(0.62, 1.55, 2.5), step(0.78, hash(cell.add(71.3))));
    return tint.mul(lit).mul(pane);
  })();

  // Neon: per-instance colour (repainted per town) and a slow shimmer
  const neonData = new Float32Array(neon.length * 4);
  const neonBuf = new THREE.InstancedBufferAttribute(neonData, 4);
  const neonAttr = instancedBufferAttribute(neonBuf);
  const neonMat = new THREE.MeshBasicNodeMaterial();
  neonMat.colorNode = neonAttr.xyz.mul(sin(time.mul(1.7).add(neonAttr.w)).mul(0.1).add(0.92));

  const archData = new Float32Array(arches.length * 4);
  const archBuf = new THREE.InstancedBufferAttribute(archData, 4);
  const archAttr = instancedBufferAttribute(archBuf);
  const archMat = new THREE.MeshBasicNodeMaterial({ fog: false });   // visible through the fog: the way in
  archMat.colorNode = archAttr.xyz.mul(sin(time.mul(2.2)).mul(0.08).add(1.0));

  const blinkData = new Float32Array(blinks.length * 4);
  blinks.forEach((b, i) => blinkData.set([b[4], b[5], b[6], b[7]], i * 4));
  const blinkAttr = instancedBufferAttribute(new THREE.InstancedBufferAttribute(blinkData, 4));
  const blinkMat = new THREE.MeshBasicNodeMaterial();
  blinkMat.colorNode = blinkAttr.xyz.mul(sin(time.mul(2.6).add(blinkAttr.w)).max(0).pow(10).mul(1.4).add(0.04));

  const trafficData = new Float32Array(traffic.length * 4);
  traffic.forEach((t, i) => trafficData.set(t.warm ? [2.6, 2.1, 1.5, 0] : [1.1, 2.2, 3.0, 0], i * 4));
  const trafficAttr = instancedBufferAttribute(new THREE.InstancedBufferAttribute(trafficData, 4));
  const trafficMat = new THREE.MeshBasicNodeMaterial();
  trafficMat.colorNode = trafficAttr.xyz;

  const cableMat = new THREE.MeshStandardNodeMaterial({ color: 0x14181f, roughness: 0.7, metalness: 0.6 });

  // ---- Meshes ----
  const group = new THREE.Group();
  for (const b of blobs) group.add(new THREE.Mesh(blobGeometry(b), rockMat));
  const M = new THREE.Matrix4(), P = new V3(), Q0 = new THREE.Quaternion(), Sc = new V3();
  const box = new THREE.BoxGeometry(1, 1, 1);
  function instanced(mat, items) {
    const m = new THREE.InstancedMesh(box, mat, Math.max(1, items.length));
    items.forEach((it, i) => m.setMatrixAt(i, M.compose(P.set(it[0], it[1], it[2]), Q0, Sc.set(it[3], it[4], it[5]))));
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
    return m;
  }
  instanced(bodyMat, bodies);
  instanced(neonMat, neon);
  instanced(archMat, arches);
  instanced(blinkMat, blinks.map((b) => [b[0], b[1], b[2], b[3], b[3], b[3]]));
  instanced(cableMat, cables);
  const trafficMesh = instanced(trafficMat, traffic.map(() => [0, 0, 0, 1.4, 0.7, 4.5]));
  trafficMesh.frustumCulled = false;
  trafficMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Coloured light spilling into the canyon from the neon (off while the town is far away)
  const lights = [[25, -190], [55, 10], [20, 200]].map(([y, z]) => {
    const l = new THREE.PointLight(0xffffff, 0, 340, 2);
    l.position.set(0, y, z);
    group.add(l);
    return l;
  });

  // ---- Where the current town is ----
  const qRot = new THREE.Quaternion(), qInv = new THREE.Quaternion();
  const local = new V3(), tmp = new V3(), nL = new V3(), nW = new V3(), q = new V3(), nn = new V3();
  let index = -1;
  const api = { group, name: '', index: -1 };

  const zAt = (k) => -(S.firstAt + k * S.spacing
    + (k === 0 ? 0 : (hash1(k * 7.31 + 0.5) - 0.5) * 2 * Math.min(S.jitter, S.spacing * 0.45)));
  const toLocal = (p, out) => out.copy(p).sub(group.position).applyQuaternion(qInv);
  const near = (p, extra) => Math.abs(p.z - group.position.z) < CLEAR + extra && Math.hypot(p.x, p.y) < CLEAR_R + extra;

  function setPalette(pal) {
    neon.forEach((n, i) => neonData.set([...pal[n[6]], n[7]], i * 4));
    neonBuf.needsUpdate = true;
    arches.forEach((a, i) => archData.set([...pal[0].map((c) => c * 1.3), 0], i * 4));
    archBuf.needsUpdate = true;
    uGlow.value.setRGB(...pal[0]);
    lights.forEach((l, i) => { const c = pal[i % 3], m = Math.max(...c); l.color.setRGB(c[0] / m, c[1] / m, c[2] / m); });
  }
  function apply(k) {
    index = k;
    api.index = k;
    group.position.set(0, 0, zAt(k));
    group.rotation.set(0, 0, k === 0 ? 0.1 : (hash1(k * 3.7 + 1.1) - 0.5) * 1.8);   // each town tilts its own way
    group.updateMatrixWorld(true);
    qRot.copy(group.quaternion);
    qInv.copy(qRot).invert();
    api.name = NAMES[Math.floor(hash1(k * 5.13 + 2.2) * NAMES.length)];
    setPalette(PALETTES[k % PALETTES.length]);
  }

  // ---- Collision: rock (sliced ellipsoids) and buildings (boxes), in the town's frame ----
  function blobContact(b, p, m, out) {
    q.subVectors(p, b.c).divide(b.r);
    const len = q.length();
    if (len < 1e-6) return 0;
    nn.copy(q).divideScalar(len);
    const reach = shell(b, nn) + m / b.minR;
    if (len >= reach) return 0;
    const dFace = faceDepth(b, p) + m;
    if (dFace <= 0) return 0;
    const dShell = (reach - len) * b.minR;
    if (dFace <= dShell) {                                   // nearest way out is back into the canyon
      if (b.kind === 'wall') out.set(-b.side, 0, 0); else out.set(0, 1, 0);
      return dFace;
    }
    out.set(q.x / b.r.x, q.y / b.r.y, q.z / b.r.z).normalize();
    return dShell;
  }
  function boxContact(bx, p, m, out) {
    const d = [p.x - (bx.min.x - m), (bx.max.x + m) - p.x, p.y - (bx.min.y - m), (bx.max.y + m) - p.y, p.z - (bx.min.z - m), (bx.max.z + m) - p.z];
    let best = Infinity, k = -1;
    for (let i = 0; i < 6; i++) { if (d[i] <= 0) return 0; if (d[i] < best) { best = d[i]; k = i; } }
    out.set(k === 0 ? -1 : k === 1 ? 1 : 0, k === 2 ? -1 : k === 3 ? 1 : 0, k === 4 ? -1 : k === 5 ? 1 : 0);
    return best;
  }
  function deepest(p, m) {
    let best = 0;
    for (const b of blobs) { const d = blobContact(b, p, m, tmp); if (d > best) { best = d; nL.copy(tmp); } }
    if (Math.abs(p.z) < MOUTH + 20) for (const bx of boxes) { const d = boxContact(bx, p, m, tmp); if (d > best) { best = d; nL.copy(tmp); } }
    return best;
  }

  // Push the ship out of anything solid; returns { normal, side } on contact, else null
  api.collide = (ship) => {
    if (index < 0 || !near(ship.pos, 0)) return null;
    let normal = null;
    for (let pass = 0; pass < 3; pass++) {
      const d = deepest(toLocal(ship.pos, local), SHIP_R);
      if (d <= 0) break;
      nW.copy(nL).applyQuaternion(qRot);
      ship.pos.addScaledVector(nW, d + 0.05);
      for (const v of [ship.base, ship.dodge]) { const vn = v.dot(nW); if (vn < 0) v.addScaledVector(nW, -vn * 1.3); }
      normal = normal || nW.clone();
    }
    if (!normal) return null;
    ship.dodge.addScaledVector(normal, 8);                 // a bump off the wall, so it is a scrape, not a grind
    ship.vel.copy(ship.base).add(ship.dodge);
    ship.group.position.copy(ship.pos);
    return { normal, side: -Math.sign(normal.dot(ship.right)) || 1 };
  };
  api.solid = (p) => index >= 0 && near(p, 0) && deepest(toLocal(p, local), 0) > 0;
  api.clears = (p, radius) => index >= 0 && near(p, radius);                 // keep belt rocks out
  api.blocksGate = (p) => index >= 0 && Math.abs(p.z - group.position.z) < CLEAR;
  api.inZone = (p) => index >= 0 && Math.abs(p.z - group.position.z) < ZONE && Math.hypot(p.x, p.y) < CLEAR_R;
  // 0..1: how deep into the town you are (for sound and light)
  api.proximity = (p) => {
    if (index < 0) return 0;
    const dz = Math.abs(p.z - group.position.z), r = Math.hypot(p.x, p.y);
    return clamp01(1 - (dz - MOUTH) / 350) * clamp01(1 - (r - 60) / 260);
  };
  // The canyon mouth on the ship's side of the town, and whether the ship is already in the canyon
  api.mouth = (ship, out) => {
    toLocal(ship.pos, local);
    out.set(0, 0, group.position.z + (local.z >= 0 ? MOUTH : -MOUTH));
    return { distance: ship.pos.distanceTo(out), inside: Math.abs(local.z) < MOUTH && Math.hypot(local.x, local.y) < 200 };
  };
  // Metres to the canyon mouth if the ship is heading for it, else -1
  api.distanceAhead = (ship) => {
    if (index < 0) return -1;
    const dz = ship.pos.z - group.position.z;
    if (dz > MOUTH && ship.vel.z < 0) return dz - MOUTH;
    if (dz < -MOUTH && ship.vel.z > 0) return -dz - MOUTH;
    return -1;
  };

  api.update = (ship, now = 0) => {
    let k = 0;
    while (zAt(k) > ship.pos.z + PASS && k < 100000) k++;
    if (k !== index) apply(k);
    const level = clamp01(1 - (Math.abs(ship.pos.z - group.position.z) - 250) / 700);
    lights.forEach((l) => { l.intensity = level * 6000; });
    const span = MOUTH * 2 + 40;
    traffic.forEach((t, i) => {
      const z = ((((t.z0 + t.speed * now) % span) + span) % span) - span / 2;
      trafficMesh.setMatrixAt(i, M.compose(P.set(t.x, t.y, z), Q0, Sc.set(1.4, 0.7, 4.5)));
    });
    trafficMesh.instanceMatrix.needsUpdate = true;
  };
  api.reset = (ship) => { index = -1; api.update(ship, 0); };
  api.zAt = zAt;
  api.MOUTH = MOUTH;
  api.stats = { buildings: bodies.length, neon: neon.length, colliders: boxes.length };
  return api;
}
