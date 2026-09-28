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

  function burst(x, y, z, size, count = 28) {
    for (let i = 0; i < count; i++) {
      if (list.length >= MAX) list.shift();
      const dir = new THREE.Vector3().randomDirection();
      list.push({
        x: x + dir.x * size * 0.6, y: y + dir.y * size * 0.6, z: z - Math.abs(dir.z) * size,
        vx: dir.x * (6 + Math.random() * 14), vy: dir.y * (6 + Math.random() * 14), vz: dir.z * 6,
        s: (0.05 + Math.random() * 0.22) * Math.min(2, size),
        q: new THREE.Quaternion().random(),
        axis: new THREE.Vector3().randomDirection(),
        spin: 4 + Math.random() * 10,
        life: 1.6 + Math.random(),
      });
    }
  }

  function update(dt, ship) {
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.z += (p.vz + ship.speed) * dt;
      if (p.life <= 0 || p.z > 20) { list.splice(i, 1); continue; }
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

  return { mesh, burst, update };
}
