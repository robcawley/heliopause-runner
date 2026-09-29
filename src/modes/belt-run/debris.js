import * as THREE from 'three/webgpu';

// Slow tumbling fragments: hull panels and spars. Two instanced draws keep
// the near-field detail affordable even on the WebGL fallback.
export function createDebris(config) {
  const group = new THREE.Group();
  const count = config.world.debrisCount;
  const sparCount = Math.ceil(count / 4);
  const panelCount = count - sparCount;
  const panelMat = new THREE.MeshStandardNodeMaterial({ color: 0x82939d, metalness: 0.68, roughness: 0.56, side: THREE.DoubleSide });
  const sparMat = new THREE.MeshStandardNodeMaterial({ color: 0x68757b, metalness: 0.72, roughness: 0.48 });
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.055, 0.65), panelMat, panelCount);
  const spars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 1), sparMat, sparCount);
  for (const mesh of [panels, spars]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  let panelIndex = 0, sparIndex = 0;
  const entries = Array.from({ length: count }, (_, i) => {
    const panel = i % 4 !== 0;
    return {
      mesh: panel ? panels : spars,
      index: panel ? panelIndex++ : sparIndex++,
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion().random(),
      axis: new THREE.Vector3().randomDirection(),
      spin: (Math.random() - 0.5) * 0.7,
      size: i % 9 === 0 ? 2.4 + Math.random() * 1.7 : 0.35 + Math.random() * 1.5,
    };
  });
  const direction = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  function place(entry, ship, ahead) {
    direction.randomDirection();
    if (ahead && direction.dot(ship.fwd) < 0) direction.reflect(ship.fwd);
    entry.pos.copy(ship.pos).addScaledVector(direction, ahead ? 220 + Math.random() * 150 : 28 + Math.random() * 280);
  }

  function reset(ship) { for (const e of entries) place(e, ship, false); }
  function update(dt, ship) {
    for (const e of entries) {
      if (e.pos.distanceToSquared(ship.pos) > 400 * 400) place(e, ship, true);
      turn.setFromAxisAngle(e.axis, e.spin * dt);
      e.quat.multiply(turn);
      matrix.compose(e.pos, e.quat, scale.setScalar(e.size));
      e.mesh.setMatrixAt(e.index, matrix);
    }
    panels.instanceMatrix.needsUpdate = true;
    spars.instanceMatrix.needsUpdate = true;
  }
  return { group, reset, update };
}
