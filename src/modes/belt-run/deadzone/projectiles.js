import * as THREE from 'three/webgpu';
import { glowMaterial } from './geo.js';

// Raider fire. Everything is slow enough to see and dodge, and nothing homes:
//   bolt   Needle bursts: quick orange darts, fired along a line locked at the burst's start
//   lance  Lancer bolts: faster, sulphur, down the red line you were warned about
//   orb    Bulwark and Carrion: big, slow, bright plasma. Knocks you back. Shootable.
//   claw   Hook and Carrion: a magnetic grapple on a cable. A hit tethers you.
// Wrecks stop everything: hide behind a hull and the fire splashes off it.
//
// handlers.onHitShip(p) is called when a projectile reaches the ship; return true to use it up.
const V3 = THREE.Vector3;
const MAX_BOLTS = 80;
const SHIP_R = 1.4;

export function createEnemyFire(config) {
  const R = config.raiders;
  const group = new THREE.Group();
  const handlers = { onHitShip: () => true, onBlocked: () => {} };

  const boltMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6).rotateX(Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0xffffff, fog: false }), MAX_BOLTS);
  boltMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  boltMesh.frustumCulled = false;
  boltMesh.count = 0;
  boltMesh.setColorAt(0, new THREE.Color());
  group.add(boltMesh);

  const orbGeo = new THREE.IcosahedronGeometry(1, 2);
  const orbs = Array.from({ length: 14 }, () => {
    const core = new THREE.Mesh(orbGeo, glowMaterial(0xffffff, 2.5));
    const halo = new THREE.Mesh(orbGeo, new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.5 }));
    halo.scale.setScalar(1.9);
    core.add(halo);
    core.visible = false;
    group.add(core);
    return { mesh: core, halo, used: false };
  });

  const clawMat = glowMaterial(0xe070ff, 2.6);
  const clawGeo = (() => {
    const g = new THREE.ConeGeometry(0.28, 1.4, 4).rotateX(-Math.PI / 2);
    return g;
  })();
  const claws = Array.from({ length: 4 }, () => {
    const root = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const prong = new THREE.Mesh(clawGeo, clawMat);
      const a = (k / 3) * Math.PI * 2;
      prong.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, -0.3);
      prong.rotation.set(-Math.sin(a) * 0.45, Math.cos(a) * 0.45, 0);
      root.add(prong);
    }
    root.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), clawMat));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    const cable = new THREE.Line(geo, new THREE.LineBasicNodeMaterial({ color: new THREE.Color(1.6, 0.5, 2.2), fog: false }));
    cable.frustumCulled = false;
    root.visible = false; cable.visible = false;
    group.add(root, cable);
    return { root, cable, used: false };
  });

  const list = [];
  const shipPrev = new V3();
  let hasPrev = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new V3(), dir = new V3();
  const relA = new V3(), relB = new V3(), seg = new V3(), tmp = new V3();
  const Zp = new V3(0, 0, 1);
  const col = new THREE.Color();

  // Distance from the origin to the segment a..b
  function segToOrigin(a, b) {
    seg.subVectors(b, a);
    const l2 = seg.lengthSq();
    const t = l2 > 1e-9 ? THREE.MathUtils.clamp(-a.dot(seg) / l2, 0, 1) : 0;
    return tmp.copy(a).addScaledVector(seg, t).length();
  }

  function fire(kind, from, velocity, owner, opts = {}) {
    const p = {
      kind, owner, pos: from.clone(), prev: from.clone(), vel: velocity.clone(), life: opts.life ?? 3, hp: 1,
      r: kind === 'orb' ? (opts.size ?? 1.7) : kind === 'claw' ? 1.3 : 0.35,
      dmg: opts.damage ?? 0, color: new THREE.Color(opts.color ?? 0xff7a2a), state: 'fly', t: 0, passed: false,
    };
    if (kind === 'orb') {
      const o = orbs.find((x) => !x.used);
      if (!o) return null;
      o.used = true; p.slot = o;
      o.mesh.visible = true;
      o.mesh.scale.setScalar(p.r * 0.6);
      o.halo.material.color.copy(p.color).multiplyScalar(2);
    } else if (kind === 'claw') {
      const c = claws.find((x) => !x.used);
      if (!c) return null;
      c.used = true; p.slot = c;
      c.root.visible = true; c.cable.visible = true;
    }
    list.push(p);
    return p;
  }

  function free(p) {
    if (p.slot) {
      p.slot.used = false;
      if (p.kind === 'orb') p.slot.mesh.visible = false;
      else { p.slot.root.visible = false; p.slot.cable.visible = false; }
    }
    const i = list.indexOf(p);
    if (i >= 0) list.splice(i, 1);
  }

  // world: { solid(p) } ; ship: the player's ship ; phasing: bool
  function update(dt, ship, world, anchorOf) {
    if (!hasPrev) { shipPrev.copy(ship.pos); hasPrev = true; }
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt;
      p.life -= dt;
      if (p.kind === 'claw' && p.state === 'reel') {
        // A missed claw winds back to its owner
        const home = anchorOf(p.owner, tmp);
        if (!home || p.owner.dead) { free(p); continue; }
        dir.subVectors(home, p.pos);
        const d = dir.length();
        if (d < 3) { free(p); continue; }
        p.pos.addScaledVector(dir.divideScalar(d), Math.min(d, 140 * dt));
        continue;
      }
      if (p.kind === 'claw' && p.state === 'latched') continue;   // the director holds it on the hull
      p.prev.copy(p.pos);
      p.pos.addScaledVector(p.vel, dt);
      if (p.life <= 0) {
        if (p.kind === 'claw') { p.state = 'reel'; continue; }
        free(p); continue;
      }
      if (world.solid(p.pos)) { handlers.onBlocked(p); if (p.kind === 'claw') p.state = 'reel'; else free(p); continue; }
      // Swept against the ship, in the ship's own frame (both move)
      relA.subVectors(p.prev, shipPrev);
      relB.subVectors(p.pos, ship.pos);
      if (segToOrigin(relA, relB) < p.r + SHIP_R) {
        if (handlers.onHitShip(p)) {
          if (p.kind === 'claw') { if (p.state !== 'latched') p.state = 'reel'; }
          else free(p);
        }
      }
    }
    shipPrev.copy(ship.pos);

    // Draw
    let n = 0;
    for (const p of list) {
      if (p.kind === 'bolt' || p.kind === 'lance') {
        const sp = p.vel.length();
        q.setFromUnitVectors(Zp, dir.copy(p.vel).divideScalar(Math.max(sp, 1e-3)));
        const len = p.kind === 'lance' ? 7 : 4.5;
        m4.compose(p.pos, q, s3.set(p.kind === 'lance' ? 0.3 : 0.24, p.kind === 'lance' ? 0.3 : 0.24, len));
        boltMesh.setMatrixAt(n, m4);
        boltMesh.setColorAt(n, col.copy(p.color).multiplyScalar(3.2));
        n++;
      } else if (p.kind === 'orb') {
        const o = p.slot;
        o.mesh.position.copy(p.pos);
        o.mesh.scale.setScalar(p.r * (0.55 + Math.sin(p.t * 18) * 0.06));
        o.halo.scale.setScalar(1.8 + Math.sin(p.t * 9) * 0.25);
      } else if (p.kind === 'claw') {
        const c = p.slot;
        c.root.position.copy(p.pos);
        if (p.vel.lengthSq() > 1) c.root.quaternion.setFromUnitVectors(new V3(0, 0, -1), dir.copy(p.vel).normalize());
        c.root.rotation.z += dt * 8;
        const home = anchorOf(p.owner, tmp);
        const arr = c.cable.geometry.attributes.position.array;
        if (home) {
          arr[0] = home.x; arr[1] = home.y; arr[2] = home.z;
          arr[3] = p.pos.x; arr[4] = p.pos.y; arr[5] = p.pos.z;
          c.cable.geometry.attributes.position.needsUpdate = true;
        }
      }
    }
    boltMesh.count = n;
    boltMesh.instanceMatrix.needsUpdate = true;
    if (boltMesh.instanceColor) boltMesh.instanceColor.needsUpdate = true;
  }

  // Player bolts can shoot orbs down
  function raycast(a, b) {
    let best = null, bestT = Infinity;
    seg.subVectors(b, a);
    const len = seg.length();
    if (len < 1e-6) return null;
    dir.copy(seg).divideScalar(len);
    for (const p of list) {
      if (p.kind !== 'orb') continue;
      tmp.subVectors(p.pos, a);
      const t = tmp.dot(dir);
      if (t < -p.r || t > len + p.r) continue;
      const d2 = tmp.lengthSq() - t * t;
      if (d2 < (p.r * 1.3) ** 2 && t < bestT) { bestT = t; best = p; }
    }
    return best ? { proj: best, dist: Math.max(0, bestT), point: a.clone().addScaledVector(dir, Math.max(0, bestT)) } : null;
  }

  // For automatic dodge rolls: an orb about to hit within horizon seconds, with its side
  function predictHit(ship, horizon) {
    for (const p of list) {
      if (p.kind !== 'orb') continue;
      relA.subVectors(p.pos, ship.pos);
      seg.subVectors(p.vel, ship.vel);
      const v2 = seg.lengthSq();
      if (v2 < 1e-6) continue;
      const t = -relA.dot(seg) / v2;
      if (t < 0 || t > horizon) continue;
      if (tmp.copy(relA).addScaledVector(seg, t).length() < p.r + SHIP_R + 1) return { side: Math.sign(relA.dot(ship.right)) || 1 };
    }
    return null;
  }

  function clear() { for (let i = list.length - 1; i >= 0; i--) free(list[i]); boltMesh.count = 0; hasPrev = false; }
  function cancelOwner(owner) { for (const p of list) if (p.owner === owner && p.kind === 'claw') p.state = 'reel'; }

  return { group, handlers, fire, free, update, raycast, predictHit, clear, cancelOwner, list, get maxOrbs() { return orbs.length; }, R };
}
