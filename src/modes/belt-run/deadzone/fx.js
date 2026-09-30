import * as THREE from 'three/webgpu';
import { scrapMaterial } from './geo.js';

// Combat effects for the Dead Zone, all pooled: fireballs, shockwave rings, sparks that
// streak along their motion, tumbling hull junk, smoke, one shared flash light, magnetic
// arcs and the grapple tether. Explosions come in sizes so every kill reads differently:
//   pop (a hit), small (a Needle), medium (Lancer, Hook), large (Bulwark), boss (Carrion).
const V3 = THREE.Vector3;
const MAX_SPARKS = 320, MAX_JUNK = 140, MAX_SMOKE = 80;
const WHITE = new THREE.Color(3, 2.6, 2);
const DARK = new THREE.Color(0.5, 0.08, 0.02);

export function createCombatFx() {
  const group = new THREE.Group();
  const unit = new THREE.IcosahedronGeometry(1, 2);

  const fireballs = Array.from({ length: 20 }, () => {
    const m = new THREE.Mesh(unit, new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.visible = false;
    group.add(m);
    return { mesh: m, life: 0, max: 1, size: 1, color: new THREE.Color(), vel: new V3() };
  });
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  const rings = Array.from({ length: 14 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    m.visible = false;
    group.add(m);
    return { mesh: m, life: 0, max: 1, from: 1, to: 2, face: false };
  });

  const sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1), new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), MAX_SPARKS);
  sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparkMesh.frustumCulled = false;
  sparkMesh.count = 0;
  sparkMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  const junkMat = scrapMaterial({ paint: 0x3b332c, burnt: 0x0c0a08, rim: 0xff6a2a, rimStrength: 0.35, scale: 1.2 });
  const junkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 0.7), junkMat, MAX_JUNK);
  junkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  junkMesh.frustumCulled = false;
  junkMesh.count = 0;
  const smokeMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardNodeMaterial({ color: 0x1c1a19, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }), MAX_SMOKE);
  smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  smokeMesh.frustumCulled = false;
  smokeMesh.count = 0;
  group.add(sparkMesh, junkMesh, smokeMesh);

  // One flash light, always in the scene so switching it on never recompiles anything
  const light = new THREE.PointLight(0xffa060, 0, 220, 1.6);
  group.add(light);

  // Magnetic arcs (short-lived lightning between two points) and the grapple tether
  const lineMat = (c) => new THREE.LineBasicNodeMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const mkLine = (n, c) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const l = new THREE.Line(geo, lineMat(c));
    l.frustumCulled = false;
    l.visible = false;
    group.add(l);
    return l;
  };
  const arcs = Array.from({ length: 8 }, () => ({ line: mkLine(12, new THREE.Color(1, 1, 1)), life: 0, a: new V3(), b: new V3(), amp: 1 }));
  const tetherLines = [mkLine(24, new THREE.Color(2.4, 0.6, 3)), mkLine(24, new THREE.Color(1.2, 0.3, 1.8))];

  const sparks = [], junk = [], smoke = [], queue = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new V3(), p3 = new V3(), dir = new V3();
  const Zp = new V3(0, 0, 1);
  const col = new THREE.Color();

  function fireball(at, vel, size, hex, life = 0.4) {
    const f = fireballs.find((x) => x.life <= 0) || fireballs[0];
    f.life = f.max = life;
    f.size = size;
    f.color.set(hex);
    f.vel.copy(vel).multiplyScalar(0.5);
    f.mesh.position.copy(at);
    f.mesh.visible = true;
  }
  function ring(at, from, to, hex, life, normal = null) {
    const r = rings.find((x) => x.life <= 0) || rings[0];
    r.life = r.max = life;
    r.from = from; r.to = to;
    r.mesh.material.color.set(hex);
    r.mesh.position.copy(at);
    r.face = !normal;
    if (normal) r.mesh.quaternion.setFromUnitVectors(Zp, normal);
    r.mesh.visible = true;
  }
  // Sparks: count of them from at, thrown along dir (or everywhere), tinted
  function spark(at, dirIn, count, hex = 0xffb060, speed = 30, spread = 1, carry = null) {
    col.set(hex).multiplyScalar(2.2);
    for (let i = 0; i < count; i++) {
      if (sparks.length >= MAX_SPARKS) sparks.shift();
      const d = new V3().randomDirection();
      if (dirIn) d.multiplyScalar(spread).add(dirIn).normalize();
      const v = d.multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      if (carry) v.add(carry);
      sparks.push({ p: at.clone(), v, life: 0.25 + Math.random() * 0.45, c: col.clone() });
    }
  }
  function junkBurst(at, vel, count, speed = 14, size = 1) {
    for (let i = 0; i < count; i++) {
      if (junk.length >= MAX_JUNK) junk.shift();
      const d = new V3().randomDirection();
      junk.push({
        p: at.clone().addScaledVector(d, Math.random() * size), v: d.multiplyScalar(speed * (0.3 + Math.random())).add(vel),
        q: new THREE.Quaternion().random(), axis: new V3().randomDirection(), spin: 2 + Math.random() * 8,
        s: (0.3 + Math.random() * 1.1) * size, life: 2.2 + Math.random() * 1.8,
      });
    }
  }
  function puff(at, vel, size = 1) {
    if (smoke.length >= MAX_SMOKE) smoke.shift();
    smoke.push({ p: at.clone().add(new V3().randomDirection().multiplyScalar(size * 0.5)), v: vel.clone().multiplyScalar(0.3).add(new V3().randomDirection().multiplyScalar(2)), s: size, life: 1.2 + Math.random(), max: 2.2 });
  }
  function flash(at, power) {
    light.position.copy(at);
    light.intensity = Math.max(light.intensity, power);
  }
  function later(delay, fn) { queue.push({ t: delay, fn }); }

  // Hit reactions
  function hitArmor(at, normal, vel) {
    spark(at, normal, 9, 0xffa040, 34, 0.9, vel);
    fireball(at, vel, 0.9, 0xffc080, 0.1);
  }
  function hitShield(at, normal, hex) {
    ring(at, 0.4, 3.2, hex, 0.28, normal);
    spark(at, normal, 7, hex, 26, 0.7);
  }
  function hitWreck(at) { spark(at, null, 5, 0xffd8a0, 18); }

  function explode(at, vel, kind, hex = 0xff7a2a) {
    const v = vel || new V3();
    if (kind === 'pop') {
      fireball(at, v, 1.4, hex, 0.18);
      spark(at, null, 8, hex, 28, 1, v);
      return;
    }
    const k = { small: 1, medium: 1.5, large: 2.2, boss: 4.5 }[kind] || 1;
    if (kind === 'boss') {
      for (let i = 0; i < 7; i++) {
        later(i * 0.2, () => {
          const o = at.clone().add(new V3().randomDirection().multiplyScalar(4 + Math.random() * 8));
          fireball(o, v, 4 + Math.random() * 3, i % 2 ? hex : 0xffa040, 0.35);
          spark(o, null, 12, 0xffb060, 45, 1, v);
          junkBurst(o, v, 4, 18, 1.6);
          flash(o, 24000);
        });
      }
      later(1.5, () => {
        fireball(at, v, 30, 0xffffff, 0.9);
        fireball(at, v, 20, hex, 1.3);
        ring(at, 6, 110, 0xff9a60, 0.9);
        ring(at, 4, 70, hex, 0.7);
        spark(at, null, 90, 0xffc070, 90, 1, v);
        junkBurst(at, v, 36, 30, 2.4);
        for (let i = 0; i < 12; i++) puff(at, v, 7);
        flash(at, 90000);
      });
      return;
    }
    fireball(at, v, 3.2 * k, WHITE.getHex(), 0.14);
    fireball(at, v, 4.2 * k, hex, 0.42 + k * 0.08);
    ring(at, 2 * k, 15 * k, hex, 0.42);
    spark(at, null, Math.round(20 * k), 0xffb060, 42 + 10 * k, 1, v);
    junkBurst(at, v, Math.round(7 * k), 14 + 4 * k, k);
    for (let i = 0; i < Math.round(3 * k); i++) puff(at, v, 2 * k);
    flash(at, 9000 * k);
    if (k > 1.2) {
      later(0.12, () => {
        const o = at.clone().add(new V3().randomDirection().multiplyScalar(2 * k));
        fireball(o, v, 3 * k, 0xffa040, 0.3);
        spark(o, null, 14, 0xffd090, 36, 1, v);
      });
    }
    if (k > 2) later(0.26, () => { ring(at, 3, 30, 0xffffff, 0.35); fireball(at, v, 6, hex, 0.35); });
  }

  // A crackle of lightning between two points (magnetic effects)
  function arc(a, b, hex, life = 0.12, amp = 1) {
    const x = arcs.find((y) => y.life <= 0) || arcs[0];
    x.a.copy(a); x.b.copy(b); x.life = life; x.amp = amp;
    x.line.material.color.set(hex).multiplyScalar(2.5);
    x.line.visible = true;
  }
  function bolt(line, a, b, amp, sag = 0) {
    const arr = line.geometry.attributes.position.array;
    const n = arr.length / 3;
    dir.subVectors(b, a);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const env = Math.sin(t * Math.PI);
      arr[i * 3] = a.x + dir.x * t + (Math.random() - 0.5) * amp * env;
      arr[i * 3 + 1] = a.y + dir.y * t + (Math.random() - 0.5) * amp * env - sag * env;
      arr[i * 3 + 2] = a.z + dir.z * t + (Math.random() - 0.5) * amp * env;
    }
    line.geometry.attributes.position.needsUpdate = true;
  }
  // The grapple tether: from the ship to the grappler's claw arm, wobbling with tension
  function tether(a, b, on, tension = 1) {
    tetherLines.forEach((l, i) => {
      l.visible = on;
      if (on) bolt(l, a, b, (0.3 + i * 0.6) * tension, 0);
    });
  }

  function update(dt, camera) {
    for (let i = queue.length - 1; i >= 0; i--) {
      if ((queue[i].t -= dt) <= 0) { const fn = queue[i].fn; queue.splice(i, 1); fn(); }
    }
    for (const f of fireballs) {
      if (f.life <= 0) { f.mesh.visible = false; continue; }
      f.life -= dt;
      const k = 1 - Math.max(0, f.life) / f.max;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.scale.setScalar(f.size * (0.35 + 0.9 * (1 - (1 - k) * (1 - k))));
      const c = f.mesh.material.color;
      if (k < 0.25) c.copy(WHITE).lerp(f.color, k / 0.25);
      else c.copy(f.color).lerp(DARK, (k - 0.25) / 0.75);
      f.mesh.material.opacity = Math.pow(1 - k, 1.4);
    }
    for (const r of rings) {
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      r.life -= dt;
      const k = 1 - Math.max(0, r.life) / r.max;
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * (1 - (1 - k) * (1 - k)));
      r.mesh.material.opacity = (1 - k) * 0.85;
      if (r.face) r.mesh.lookAt(camera.getWorldPosition(p3));
    }
    let n = 0;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.v.multiplyScalar(Math.exp(-2.5 * dt));
      s.p.addScaledVector(s.v, dt);
    }
    for (const s of sparks) {
      const sp = s.v.length();
      q.setFromUnitVectors(Zp, dir.copy(s.v).divideScalar(Math.max(sp, 1e-3)));
      m4.compose(s.p, q, s3.set(1, 1, Math.min(4, 0.3 + sp * 0.05) * Math.min(1, s.life * 4)));
      sparkMesh.setMatrixAt(n, m4);
      sparkMesh.setColorAt(n, s.c);
      n++;
    }
    sparkMesh.count = n;
    sparkMesh.instanceMatrix.needsUpdate = true;
    if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;

    n = 0;
    for (let i = junk.length - 1; i >= 0; i--) {
      const j = junk[i];
      j.life -= dt;
      if (j.life <= 0) { junk.splice(i, 1); continue; }
      j.p.addScaledVector(j.v, dt);
      q.setFromAxisAngle(j.axis, j.spin * dt);
      j.q.premultiply(q);
    }
    for (const j of junk) { m4.compose(j.p, j.q, s3.setScalar(j.s * Math.min(1, j.life * 2))); junkMesh.setMatrixAt(n++, m4); }
    junkMesh.count = n;
    junkMesh.instanceMatrix.needsUpdate = true;

    n = 0;
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.life -= dt;
      if (s.life <= 0) { smoke.splice(i, 1); continue; }
      s.p.addScaledVector(s.v, dt);
    }
    for (const s of smoke) {
      const k = 1 - s.life / s.max;
      m4.compose(s.p, q.identity(), s3.setScalar(s.s * (0.5 + k * 1.2) * Math.min(1, s.life * 1.5)));
      smokeMesh.setMatrixAt(n++, m4);
    }
    smokeMesh.count = n;
    smokeMesh.instanceMatrix.needsUpdate = true;

    light.intensity *= Math.exp(-9 * dt);
    if (light.intensity < 10) light.intensity = 0;

    for (const x of arcs) {
      if (x.life <= 0) { x.line.visible = false; continue; }
      x.life -= dt;
      bolt(x.line, x.a, x.b, x.amp);
    }
  }

  function clear() {
    sparks.length = 0; junk.length = 0; smoke.length = 0; queue.length = 0;
    for (const f of fireballs) { f.life = 0; f.mesh.visible = false; }
    for (const r of rings) { r.life = 0; r.mesh.visible = false; }
    for (const x of arcs) { x.life = 0; x.line.visible = false; }
    tetherLines.forEach((l) => { l.visible = false; });
    sparkMesh.count = 0; junkMesh.count = 0; smokeMesh.count = 0;
    light.intensity = 0;
  }

  return { group, explode, fireball, ring, spark, junkBurst, puff, flash, later, hitArmor, hitShield, hitWreck, arc, tether, update, clear };
}
