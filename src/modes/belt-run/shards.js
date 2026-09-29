import * as THREE from 'three/webgpu';

// Ice shards thrown off a rock that shatters on the hull. They inherit the
// belt's motion, so they sail past the canopy rather than hanging in the air.
const MAX = 140;

export function createShards() {
  const material = new THREE.MeshStandardNodeMaterial({
    color: 0x9fb8cc, roughness: 0.35, metalness: 0.1, flatShading: true,
    emissive: 0x6fd6ff, emissiveIntensity: 0.9,
  });
  const mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1), material, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;

  const list = [];
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const dq = new THREE.Quaternion();

  // at: world position; carry: velocity the debris inherits (the rock's, or the ship's)
  function burst(at, carry, size, count = 28) {
    for (let i = 0; i < count; i++) {
      if (list.length >= MAX) list.shift();
      const dir = new THREE.Vector3().randomDirection();
      const sp = 6 + Math.random() * 14;
      list.push({
        x: at.x + dir.x * size * 0.6, y: at.y + dir.y * size * 0.6, z: at.z + dir.z * size * 0.6,
        vx: carry.x + dir.x * sp, vy: carry.y + dir.y * sp, vz: carry.z + dir.z * sp,
        s: (0.05 + Math.random() * 0.22) * Math.min(2, size),
        q: new THREE.Quaternion().random(),
        axis: new THREE.Vector3().randomDirection(),
        spin: 4 + Math.random() * 10,
        life: 1.6 + Math.random(),
      });
    }
  }

  function chip(at, normal, carry, size) {
    const count = Math.min(14, 7 + Math.round(size * 2));
    for (let i = 0; i < count; i++) {
      if (list.length >= MAX) list.shift();
      const dir = normal.clone().multiplyScalar(0.65).add(new THREE.Vector3().randomDirection().multiplyScalar(0.65)).normalize();
      const speed = 9 + Math.random() * 24;
      list.push({
        x: at.x, y: at.y, z: at.z,
        vx: carry.x + dir.x * speed, vy: carry.y + dir.y * speed, vz: carry.z + dir.z * speed,
        s: (0.07 + Math.random() * 0.15) * Math.min(1.6, size),
        q: new THREE.Quaternion().random(), axis: new THREE.Vector3().randomDirection(),
        spin: 8 + Math.random() * 12, life: 0.7 + Math.random() * 0.55,
      });
    }
  }

  function update(dt) {
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.life <= 0) list.splice(i, 1);
    }
    for (const p of list) {
      dq.setFromAxisAngle(p.axis, p.spin * dt);
      p.q.premultiply(dq);
      const s = p.s * Math.min(1, p.life * 2);
      m4.compose(pos.set(p.x, p.y, p.z), p.q, scl.set(s, s, s));
      mesh.setMatrixAt(n++, m4);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function clear() { list.length = 0; mesh.count = 0; }
  return { mesh, burst, chip, update, clear };
}
