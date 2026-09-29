import * as THREE from 'three/webgpu';
import { Fn, vec3, positionLocal, normalize, dot, saturate, mix, sin } from 'three/tsl';

// Fixed directions in the far sky. Following the pilot's position removes
// translation parallax, so these read as distant worlds rather than hazards.
export function createPlanets(sunDir) {
  const group = new THREE.Group();
  const world = new THREE.Group();
  world.position.set(330, 55, -720);
  world.rotation.z = -0.16;
  group.add(world);

  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  mat.colorNode = Fn(() => {
    const p = normalize(positionLocal);
    const band = sin(p.y.mul(38).add(sin(p.x.mul(12)).mul(0.4))).mul(0.5).add(0.5);
    const wide = sin(p.y.mul(9)).mul(0.5).add(0.5);
    const light = saturate(dot(p, vec3(-sunDir.x, -sunDir.y, -sunDir.z))).mul(0.45).add(0.45);
    return mix(vec3(0.17, 0.29, 0.44), vec3(0.47, 0.65, 0.71), band.mul(0.5).add(wide.mul(0.5))).mul(light);
  })();
  const planet = new THREE.Mesh(new THREE.SphereGeometry(69, 48, 32), mat);
  world.add(planet);

  const ringMat = new THREE.MeshBasicNodeMaterial({ color: 0x8da5ae, side: THREE.DoubleSide, transparent: true, opacity: 0.27, depthWrite: false, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(86, 137, 96), ringMat);
  ring.rotation.x = -0.88;
  ring.rotation.y = 0.22;
  world.add(ring);

  const moonMat = new THREE.MeshStandardNodeMaterial({ color: 0x8b9cac, roughness: 1, emissive: 0x24384b, emissiveIntensity: 0.35, fog: false });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 16), moonMat);
  moon.position.set(170, -30, -110);
  world.add(moon);

  // A dim rust-coloured world behind the departure bearing rewards a turn
  // around without cluttering the forward shooting lane.
  const farMat = new THREE.MeshBasicNodeMaterial({ color: 0x694854, fog: false });
  const farWorld = new THREE.Mesh(new THREE.SphereGeometry(36, 32, 20), farMat);
  farWorld.position.set(-460, -145, 610);
  group.add(farWorld);

  return { group, update(ship) { group.position.copy(ship.pos); } };
}
