import * as THREE from 'three/webgpu';

// Twin blasters under the canopy. Hold fire and they alternate barrels; the
// two streams converge `convergence` metres ahead of the nose, on the reticle.
// Firing builds heat; overheat locks the guns until they cool to
// overheatRecover. Bolts are tested every frame as a segment (last position
// to this one), so fast bolts never tunnel through small rocks.
//
// Events (set on handlers): onFire(barrel), onImpact(hit, destroyed), onOverheat().
// Designed so enemy ships can join later as more raycast targets.
const MAX_BOLTS = 96;
const BARRELS = [new THREE.Vector3(-0.95, -0.42, -1.1), new THREE.Vector3(0.95, -0.42, -1.1)];

export function createBlasters(config) {
  const boltMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(4, 1.3, 0.6), fog: false });
  const boltGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1).rotateX(Math.PI / 2);   // along z
  const mesh = new THREE.InstancedMesh(boltGeo, boltMat, MAX_BOLTS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;

  // Impact flashes: small bright discs that face the camera and fade fast
  const flashMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3, 1.6, 0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const flashes = Array.from({ length: 12 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), flashMat.clone());
    m.visible = false;
    return { mesh: m, life: 0 };
  });
  const shockMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.55, 1.8, 2.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const shocks = Array.from({ length: 8 }, () => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32), shockMat.clone());
    ring.visible = false;
    return { mesh: ring, life: 0, size: 1 };
  });
  const group = new THREE.Group();
  group.add(mesh, ...flashes.map((f) => f.mesh), ...shocks.map((s) => s.mesh));

  // Muzzle flashes ride with the ship (added to the cockpit by the mode)
  const muzzleMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3, 1.3, 0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const muzzles = BARRELS.map((b) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), muzzleMat.clone());
    m.position.copy(b).add(new THREE.Vector3(0, 0, -0.04));
    m.scale.set(1, 1, 2.6);
    m.material.opacity = 0;
    return m;
  });
  // Gun barrels, visible at the bottom corners of the canopy
  const barrelMat = new THREE.MeshStandardNodeMaterial({ color: 0x252c36, roughness: 0.4, metalness: 0.6 });
  const barrels = BARRELS.map((b) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.5, 10).rotateX(Math.PI / 2), barrelMat);
    m.position.copy(b).add(new THREE.Vector3(0, 0, 0.25));
    m.renderOrder = 10;
    return m;
  });
  const muzzleGroup = new THREE.Group();
  muzzleGroup.add(...barrels, ...muzzles);

  const bolts = [];
  const handlers = { onFire: () => {}, onImpact: () => {}, onOverheat: () => {}, blocked: () => false };
  const st = { heat: 0, overheated: false, cooldown: 0, barrel: 0, shots: 0, hits: 0 };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const Zp = new THREE.Vector3(0, 0, 1);
  const origin = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const next = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const probeEnd = new THREE.Vector3();
  let aimDist = config.blasters.convergence;

  // Converge on whatever is under the reticle, so the rock you aim at is the rock you hit.
  // The barrels sit about a metre either side of the eye, so a fixed convergence point
  // 160 m out sent both streams either side of small rocks up close.
  function aimDistance(ship, rocks) {
    const b = config.blasters;
    probeEnd.copy(ship.fwd).multiplyScalar(b.aimRange ?? 400).add(ship.pos);
    const hit = rocks.raycast(ship.pos, probeEnd);
    return hit ? Math.max(8, hit.point.distanceTo(ship.pos)) : b.convergence;
  }

  function flash(at, size) {
    const f = flashes.find((x) => x.life <= 0) || flashes[0];
    f.life = 0.12;
    f.size = size;
    f.mesh.position.copy(at);
    f.mesh.visible = true;
  }

  function shock(at, size, ship) {
    const s = shocks.find((x) => x.life <= 0) || shocks[0];
    s.life = 0.34;
    s.size = Math.max(1, size);
    s.mesh.position.copy(at);
    s.mesh.lookAt(ship.pos);
    s.mesh.visible = true;
  }

  function fire(ship) {
    const b = config.blasters;
    const barrel = BARRELS[st.barrel];
    origin.copy(barrel).applyQuaternion(ship.group.quaternion).add(ship.pos);
    aim.copy(ship.fwd).multiplyScalar(aimDist).add(ship.pos);
    dir.subVectors(aim, origin).normalize();
    jitter.randomDirection().multiplyScalar(b.spread);
    dir.add(jitter).normalize();
    if (bolts.length >= MAX_BOLTS) bolts.shift();
    bolts.push({
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(b.boltSpeed).add(ship.vel),
      dir: dir.clone(),
      life: b.boltLife,
    });
    muzzles[st.barrel].material.opacity = 1;
    handlers.onFire(st.barrel);
    st.barrel ^= 1;
    st.shots++;
    st.heat += b.heatPerShot;
    if (st.heat >= 100) { st.heat = 100; st.overheated = true; handlers.onOverheat(); }
  }

  // dt: real time for the trigger and heat; worldDt: world time for bolt flight
  function update(dt, worldDt, ship, trigger, rocks) {
    const b = config.blasters;

    st.heat = Math.max(0, st.heat - b.coolRate * dt);
    if (st.overheated && st.heat <= b.overheatRecover) st.overheated = false;
    st.cooldown -= dt;
    if (trigger && !st.overheated) {
      if (st.cooldown <= 0) aimDist = aimDistance(ship, rocks);
      while (st.cooldown <= 0) { fire(ship); st.cooldown += 1 / b.fireRate; if (st.overheated) break; }
    } else if (st.cooldown < 0) st.cooldown = 0;

    muzzles.forEach((m) => { m.material.opacity *= Math.exp(-30 * dt); });

    let n = 0;
    for (let i = bolts.length - 1; i >= 0; i--) {
      const bolt = bolts[i];
      bolt.life -= worldDt;
      next.copy(bolt.pos).addScaledVector(bolt.vel, worldDt);
      const hit = rocks.raycast(bolt.pos, next);
      if (hit) {
        const destroyed = rocks.damage(hit.rock, b.damage, ship);
        st.hits++;
        flash(hit.point, destroyed ? Math.min(4, destroyed.size * 1.2) : 0.9);
        if (destroyed) shock(hit.point, destroyed.size, ship);
        handlers.onImpact(hit, destroyed);
        bolts.splice(i, 1);
        continue;
      }
      if (handlers.blocked(next)) { flash(next, 1.4); bolts.splice(i, 1); continue; }   // struck settlement rock
      bolt.pos.copy(next);
      if (bolt.life <= 0) bolts.splice(i, 1);
    }

    for (const bolt of bolts) {
      q.setFromUnitVectors(Zp, bolt.dir);
      const len = Math.min(14, 4 + bolt.vel.length() * 0.012);
      m4.compose(bolt.pos, q, scl.set(0.11, 0.11, len));
      mesh.setMatrixAt(n++, m4);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;

    for (const f of flashes) {
      if (f.life <= 0) { f.mesh.visible = false; continue; }
      f.life -= dt;
      const k = Math.max(0, f.life / 0.12);
      f.mesh.scale.setScalar(f.size * (1.4 - k * 0.6));
      f.mesh.material.opacity = k;
    }
    for (const s of shocks) {
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.life -= dt;
      const k = Math.max(0, s.life / 0.34);
      s.mesh.scale.setScalar(s.size * (1 + (1 - k) * 2.2));
      s.mesh.material.opacity = k * 0.7;
    }
  }

  function reset() {
    bolts.length = 0;
    Object.assign(st, { heat: 0, overheated: false, cooldown: 0, barrel: 0, shots: 0, hits: 0 });
    mesh.count = 0;
    for (const s of shocks) { s.life = 0; s.mesh.visible = false; }
  }

  return { group, muzzleGroup, update, reset, handlers, state: st };
}
