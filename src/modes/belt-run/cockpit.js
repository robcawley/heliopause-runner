import * as THREE from 'three/webgpu';
import { uniform, vec3, float, mix, Fn, time, sin } from 'three/tsl';

// A greybox cockpit: canopy bow, spine, side rails and a dash. It is there to
// give the eye a frame of reference, so the ship's bank and the pilot's head
// lag are visible. The dash carries the only instruments this stage needs:
//   left   phase drive readiness (fills, then glows when ready)
//   centre the Orison beacon, a slow pulse
//   right  near-miss chain pips
// Real cockpit art replaces this later; the instrument API stays.

const frameMat = () => new THREE.MeshStandardNodeMaterial({ color: 0x1c222c, roughness: 0.5, metalness: 0.35 });

function beam(a, b, t, material) {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, t * 0.7, len), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.lookAt(b);
  return mesh;
}

function light(colorNode, w, h, d) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = colorNode;
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}

export function createCockpit() {
  const group = new THREE.Group();
  const frame = frameMat();

  // Canopy bow
  const arch = [
    [-1.4, -0.62, -1.0], [-1.12, 0.32, -1.3], [-0.62, 0.8, -1.45],
    [0.62, 0.8, -1.45], [1.12, 0.32, -1.3], [1.4, -0.62, -1.0],
  ].map((p) => new THREE.Vector3(...p));
  for (let i = 0; i < arch.length - 1; i++) group.add(beam(arch[i], arch[i + 1], 0.07, frame));

  // Spine overhead and side rails running back past the pilot
  group.add(beam(new THREE.Vector3(0, 0.8, -1.45), new THREE.Vector3(0, 0.98, 0.6), 0.06, frame));
  group.add(beam(new THREE.Vector3(-1.4, -0.62, -1.0), new THREE.Vector3(-1.45, -0.5, 0.6), 0.09, frame));
  group.add(beam(new THREE.Vector3(1.4, -0.62, -1.0), new THREE.Vector3(1.45, -0.5, 0.6), 0.09, frame));

  // Dash
  const dash = new THREE.Group();
  dash.position.set(0, -0.8, -0.86);
  dash.rotation.x = -0.32;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 0.62), frame);
  dash.add(body);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.035, 0.05), new THREE.MeshStandardNodeMaterial({ color: 0x2b3442, roughness: 0.3, metalness: 0.6 }));
  lip.position.set(0, 0.26, -0.3);
  dash.add(lip);
  group.add(dash);

  const top = 0.255;

  // Phase drive: a bar that fills. Cool teal when ready, dim while charging, white-hot while active.
  const uPhaseFill = uniform(1);
  const uPhaseActive = uniform(0);
  const phaseTrack = light(vec3(0.02, 0.05, 0.06), 0.62, 0.012, 0.07);
  phaseTrack.position.set(-0.62, top, -0.05);
  dash.add(phaseTrack);
  const phaseBar = light(Fn(() => {
    const ready = uPhaseFill.greaterThanEqual(1).select(float(1), float(0));
    const base = mix(vec3(0.05, 0.25, 0.3), vec3(0.2, 1.6, 1.5), ready);
    return mix(base, vec3(3.0, 3.2, 3.4), uPhaseActive);
  })(), 0.6, 0.016, 0.055);
  phaseBar.geometry.translate(0.3, 0, 0);
  phaseBar.position.set(-0.92, top + 0.002, -0.05);
  dash.add(phaseBar);

  // Beacon: slow double pulse, like a heartbeat from beyond Neptune
  const beacon = light(Fn(() => {
    const t = time.mul(1.1);
    const pulse = sin(t.mul(6.2832)).max(0).pow(12).add(sin(t.mul(6.2832).sub(0.9)).max(0).pow(12).mul(0.6));
    return vec3(1.6, 0.35, 0.22).mul(pulse.mul(2.2).add(0.15));
  })(), 0.05, 0.02, 0.05);
  beacon.position.set(0, top + 0.004, -0.08);
  dash.add(beacon);

  // Chain pips
  const pips = [];
  for (let i = 0; i < 3; i++) {
    const u = uniform(0);
    const pip = light(mix(vec3(0.05, 0.04, 0.02), vec3(2.4, 1.6, 0.5), u), 0.09, 0.016, 0.055);
    pip.position.set(0.45 + i * 0.14, top + 0.002, -0.05);
    dash.add(pip);
    pips.push(u);
  }

  // Interior lamp so the frame is never pure black
  const lamp = new THREE.PointLight(0x4fd6c8, 0.6, 3.5, 2);
  lamp.position.set(0, 0.1, -0.25);
  group.add(lamp);

  group.traverse((o) => { if (o.isMesh) o.renderOrder = 10; });

  return {
    group,
    setPhase(readiness, active) {
      uPhaseFill.value = readiness;
      uPhaseActive.value = active ? 1 : 0;
      phaseBar.scale.x = Math.max(0.001, Math.min(1, readiness));
    },
    setChain(n) {
      pips.forEach((u, i) => { u.value += ((i < n ? 1 : 0) - u.value) * 0.35; });
    },
    flashChain() { pips.forEach((u) => { u.value = 2.5; }); },
  };
}
