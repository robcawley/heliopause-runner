import * as THREE from 'three/webgpu';

// The beacon lane: the shielded corridor MICA plotted through the belt. Its
// centre line runs along -z from the origin.
//   Lane rings   - faint teal hoops the size of the safe radius, fixed in the
//                  world. Visual only: they show where shelter is.
//   Repair gates - warm rings somewhere inside the lane every gateSpacing
//                  metres. Fly through one to patch the hull.
const ss = THREE.MathUtils.smoothstep;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const RINGS = 7;

export function createLane(config) {
  const group = new THREE.Group();
  const L = config.lane;

  const ringGeo = new THREE.TorusGeometry(1, 0.008, 6, 160);
  const rings = Array.from({ length: RINGS }, () => {
    const m = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.25, 0.9, 0.85), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const ring = new THREE.Mesh(ringGeo, m);
    group.add(ring);
    return ring;
  });

  const gateGeo = new THREE.TorusGeometry(1, 0.055, 10, 64);
  const tickGeo = new THREE.BoxGeometry(0.08, 0.5, 0.08);
  const discGeo = new THREE.CircleGeometry(1, 48);
  const gates = Array.from({ length: 3 }, () => {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2.4, 1.7, 0.8), transparent: true, fog: false });
    const discMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.5, 0.32, 0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(gateGeo, ringMat);
    for (let t = 0; t < 4; t++) {
      const tick = new THREE.Mesh(tickGeo, ringMat);
      const a = (t / 4) * Math.PI * 2;
      tick.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0);
      tick.rotation.z = a + Math.PI / 2;
      ring.add(tick);
    }
    g.add(ring, new THREE.Mesh(discGeo, discMat));
    group.add(g);
    return { g, ring, ringMat, discMat };
  });

  const collected = new Set();
  const handlers = { onGate: () => {} };

  // Gate i (i >= 0) sits at z = -(i + 1) * gateSpacing
  const gatePos = (i) => {
    const a = hash(i) * Math.PI * 2;
    const r = Math.sqrt(hash(i + 0.5)) * L.safeRadius * L.gateOffset;
    return { z: -(i + 1) * L.gateSpacing, x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 };
  };

  function update(ship, t) {
    const far = config.world.fogFar;

    // Rings around the ship's position along the lane
    const S = L.ringSpacing;
    const base = Math.round(ship.pos.z / S) - Math.floor(RINGS / 2);
    rings.forEach((ring, k) => {
      const z = (base + k) * S;
      ring.position.set(0, 0, z);
      ring.scale.setScalar(L.safeRadius);
      const d = ship.pos.distanceTo(ring.position);
      ring.material.opacity = 0.9 * (1 - ss(d, far * 0.4, far)) * ss(Math.abs(ship.pos.z - z), 6, 40);
    });

    // Gates nearest the ship
    const gi = Math.max(0, Math.round(-ship.pos.z / L.gateSpacing) - 2);
    gates.forEach((gate, k) => {
      const i = gi + k;
      const p = gatePos(i);
      gate.g.visible = !collected.has(i);
      gate.g.position.set(p.x, p.y, p.z);
      gate.g.scale.setScalar(L.gateRadius);
      gate.ring.rotation.z = t * 0.6;
      const d = ship.pos.distanceTo(gate.g.position);
      const fade = 1 - ss(d, far * 0.5, far * 1.1);
      gate.ringMat.opacity = fade;
      gate.discMat.opacity = fade * (0.75 + Math.sin(t * 4 + i) * 0.25) * 0.6;

      // Fly-through test: the ship crossed the gate's plane this frame, inside the ring
      const crossed = (ship.prevZ - p.z) * (ship.pos.z - p.z) <= 0 && ship.prevZ !== ship.pos.z;
      if (crossed && !collected.has(i) && Math.hypot(ship.pos.x - p.x, ship.pos.y - p.y) < L.gateRadius) {
        collected.add(i);
        handlers.onGate(i, p);
      }
    });
  }

  function reset() { collected.clear(); }

  return { group, update, reset, handlers };
}
