import * as THREE from 'three/webgpu';
import { CONFIG } from '../config.js';

// The beacon lane: the shielded corridor MICA plotted through the belt.
//   Lane rings  - faint teal hoops the size of the safe radius. Visual only,
//                 they show where shelter is from a long way off.
//   Repair gates - small warm rings somewhere inside the lane. Fly through one
//                 to patch the hull. Missing them costs nothing but the repair.
// Everything is placed by distance along the lane, so it is deterministic.

const ss = THREE.MathUtils.smoothstep;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function createLane() {
  const group = new THREE.Group();
  const L = CONFIG.lane;

  const rings = [];
  const ringGeo = new THREE.TorusGeometry(1, 0.008, 6, 128);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.25, 0.9, 0.85), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const ring = new THREE.Mesh(ringGeo, m);
    group.add(ring);
    rings.push(ring);
  }

  const gates = [];
  const gateGeo = new THREE.TorusGeometry(1, 0.055, 10, 64);
  const discGeo = new THREE.CircleGeometry(1, 48);
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2.4, 1.7, 0.8), transparent: true, fog: false });
    const discMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.5, 0.32, 0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(gateGeo, ringMat);
    const disc = new THREE.Mesh(discGeo, discMat);
    // Four ticks around the rim so the gate reads as a target, not a halo
    for (let t = 0; t < 4; t++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), ringMat);
      const a = (t / 4) * Math.PI * 2;
      tick.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0);
      tick.rotation.z = a + Math.PI / 2;
      ring.add(tick);
    }
    g.add(ring, disc);
    group.add(g);
    gates.push({ g, ring, ringMat, discMat, index: -1 });
  }

  const collected = new Set();
  let lastChecked = 0;   // gate i sits at (i + 1) * gateSpacing along the lane

  const gatePos = (i) => {
    const a = hash(i) * Math.PI * 2;
    const r = Math.sqrt(hash(i + 0.5)) * L.safeRadius * L.gateOffset;
    return { s: (i + 1) * L.gateSpacing, x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 };
  };

  const handlers = { onGate: () => {} };

  function update(ship, t) {
    // Rings
    const S = L.ringSpacing;
    const phase = ship.travelled % S;
    rings.forEach((ring, k) => {
      const z = phase - k * S;
      ring.position.set(0, 0, z);
      ring.scale.setScalar(L.safeRadius);
      const far = 1 - ss(-z, CONFIG.world.fogFar * 0.4, CONFIG.world.fogFar);
      const near = 1 - ss(z, -30, 8);
      ring.material.opacity = 0.9 * far * near;
    });

    // Gates: the next two ahead
    const base = Math.floor(ship.travelled / L.gateSpacing);
    gates.forEach((gate, k) => {
      const i = base + k;
      const p = gatePos(i);
      const z = ship.travelled - p.s;
      gate.index = i;
      gate.g.visible = !collected.has(i) && z > -CONFIG.world.rockSpawnDepth * 1.1;
      gate.g.position.set(p.x, p.y, z);
      gate.g.scale.setScalar(L.gateRadius);
      gate.ring.rotation.z = t * 0.6;
      const pulse = 0.75 + Math.sin(t * 4 + i) * 0.25;
      const fade = 1 - ss(-z, CONFIG.world.fogFar * 0.5, CONFIG.world.fogFar * 1.1);
      gate.ringMat.opacity = fade;
      gate.discMat.opacity = fade * pulse * 0.6;
    });

    // Crossing test: once per gate, as the ship passes its plane
    while (lastChecked < base) {
      const i = lastChecked;
      const p = gatePos(i);
      const d = Math.hypot(ship.x - p.x, ship.y - p.y);
      if (d < L.gateRadius) { collected.add(i); handlers.onGate(i, true, p); }
      lastChecked++;
    }
  }

  function reset(ship) {
    collected.clear();
    lastChecked = Math.floor(ship.travelled / L.gateSpacing);
  }

  function nextGate(ship) {
    const i = Math.floor(ship.travelled / L.gateSpacing);
    return collected.has(i) ? null : { ...gatePos(i), z: ship.travelled - gatePos(i).s };
  }

  return { group, update, reset, handlers, nextGate };
}
