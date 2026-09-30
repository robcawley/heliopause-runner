import * as THREE from 'three/webgpu';
import { buildModel, disposeModel, LOOK } from './models.js';
import { glowMaterial } from './geo.js';

// The raiders: a small pool of pre-built craft, their steering, their attacks and how they
// take damage.
//
// Fairness rules, enforced here:
//   - every attack has a telegraph (glow, sound, a HUD mark), longer when the attacker is off-screen
//   - only config.raiders.maxAttackers raiders may telegraph or fire at once, attackGap apart
//   - a new raider waits firstAttack seconds before it may attack
//   - nobody attacks while you are tethered, except the Hook that holds you
//   - aim is led but locked at the start of a volley, so one juke clears it
//   - nothing homes; wrecks block fire and line of sight; scrap clouds hide you from guns
//
// world (from the director): { ship, fx, fire, sfx, wrecks, pan(pos), gain(pos), grappled(),
//   onKill(r), onPodDown(r, left), onGrappleFire(r, claw), aggression }
const V3 = THREE.Vector3;
const POOL = { skirmisher: 6, gunner: 3, grappler: 2, bulwark: 2, boss: 1 };
const TURN = { skirmisher: 8, gunner: 4, grappler: 5, bulwark: 3, boss: 0.8 };
const EXPLOSION = { skirmisher: 'small', gunner: 'medium', grappler: 'medium', bulwark: 'large', boss: 'boss' };
const clamp = THREE.MathUtils.clamp;

export function createRaiders(config, world) {
  const R = config.raiders;
  const group = new THREE.Group();
  const all = [];

  // Pre-built pool: no geometry is made mid-fight
  for (const [type, n] of Object.entries(POOL)) {
    for (let i = 0; i < n; i++) {
      const model = buildModel(type);
      model.root.visible = false;
      group.add(model.root);
      const r = { type, model, root: model.root, alive: false, pos: model.root.position, vel: new V3(), seed: Math.random() * 10 };
      if (type === 'bulwark' || type === 'boss') {
        const count = type === 'boss' ? 3 : 1;
        r.charges = Array.from({ length: count }, (_, k) => {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), glowMaterial(type === 'boss' ? 0xff50d0 : 0x6ab8ff, 2.2));
          m.position.copy(model.muzzle).add(new V3((k - (count - 1) / 2) * 3.2, 0, 0));
          m.visible = false;
          model.root.add(m);
          return m;
        });
      }
      all.push(r);
    }
  }
  // Lancer targeting lines live in the world, from the muzzle to the aim point
  const beams = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), glowMaterial(0xff2a18, 1, { additive: true }));
    m.visible = false;
    group.add(m);
    return { mesh: m, used: false };
  });

  const tmp = new V3(), tmp2 = new V3(), toShip = new V3(), desired = new V3(), steer = new V3(), n3 = new V3();
  const perpA = new V3(), perpB = new V3(), look = new THREE.Matrix4(), qT = new THREE.Quaternion(), up = new V3(0, 1, 0);
  let lastAttack = -99, time = 0;

  const alive = () => all.filter((r) => r.alive);
  const attackers = () => all.filter((r) => r.alive && (r.state === 'tele' || r.state === 'fire')).length;

  function spawn(type, at, normal) {
    const r = all.find((x) => x.type === type && !x.alive && !x.dying);
    if (!r) return null;
    const T = R.types[type];
    Object.assign(r, {
      T, alive: true, dead: false, dying: 0, state: 'emerge', t: 0, age: 0,
      hp: T.hp, maxHp: T.hp, shield: T.shield ?? 0, shieldMax: T.shield ?? 0, shieldDown: 0,
      pods: type === 'boss' ? [T.pods, T.pods] : null, rage: 0, halfCalled: false,
      cooldown: 0.6 + Math.random() * 1.2, tele: 0, lock: 0, burst: 0, burstT: 0, reel: 0,
      orbit: Math.random() * Math.PI * 2, orbitDir: Math.random() < 0.5 ? -1 : 1,
      offYaw: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5), offPitch: (Math.random() - 0.5) * 0.7,
      plates: 0, smokeT: 0, flash: 0, label: 3, attackKind: '', volley: 0, beam: null, claw: null, onScreen: false,
      aimPoint: new V3(), aimDir: new V3(), muzzleW: new V3(),
    });
    r.pos.copy(at).addScaledVector(normal, -2);
    r.vel.copy(normal).multiplyScalar(type === 'boss' ? 16 : 48);
    look.lookAt(r.pos, tmp.copy(r.pos).add(normal), up);
    r.root.quaternion.setFromRotationMatrix(look);
    r.root.visible = true;
    r.model.plates.forEach((p) => { p.visible = true; });
    if (r.model.pods) { r.model.pods.forEach((p) => { p.visible = true; }); }
    if (r.model.shield) r.model.shield.visible = true;
    r.charges?.forEach((c) => { c.visible = false; });
    // The breach: a plate blown out of the hull and the raider through it
    const accent = LOOK[type].accent;
    world.fx.junkBurst(at, tmp.copy(normal).multiplyScalar(12), type === 'boss' ? 18 : 7, 16, type === 'boss' ? 2.5 : 1.2);
    world.fx.spark(at, normal, type === 'boss' ? 40 : 16, accent, 40, 0.8);
    world.fx.fireball(at, n3.set(0, 0, 0), type === 'boss' ? 9 : 3, accent, 0.3);
    world.fx.flash(at, type === 'boss' ? 30000 : 8000);
    world.sfx.emerge(world.pan(at), world.gain(at), type === 'boss');
    return r;
  }

  // Where the raider's gun is, in the world
  function muzzle(r, out) { return r.root.localToWorld(out.copy(r.model.muzzle)); }
  // For claw cables: the arm the claw hangs from
  function anchor(r, out) { return r.alive ? muzzle(r, out) : null; }

  function lead(r, speed, factor = 0.55) {
    const ship = world.ship;
    const d = r.pos.distanceTo(ship.pos);
    return tmp2.copy(ship.pos).addScaledVector(ship.vel, (d / speed) * factor).add(n3.randomDirection().multiplyScalar(1.5));
  }

  function canAttack(r) {
    const ship = world.ship;
    if (r.age < R.firstAttack || r.cooldown > 0 || world.grappled()) return false;
    if (attackers() >= R.maxAttackers || time - lastAttack < R.attackGap) return false;
    const d = r.pos.distanceTo(ship.pos);
    if (d > r.T.range || d < 18) return false;
    if (r.type !== 'grappler' && world.wrecks.inScrap(ship.pos) > 0.35) return false;   // lost in the scrap
    if (world.wrecks.blocked(r.pos, ship.pos)) return false;
    return true;
  }

  function beginAttack(r) {
    lastAttack = time;
    r.state = 'tele';
    r.t = 0;
    const extra = r.onScreen ? 0 : R.offscreenExtra;
    r.teleTime = r.T.telegraph * R.telegraphScale + extra;
    r.lockTime = r.type === 'gunner' ? r.T.lock * R.telegraphScale : 0;
    if (r.type === 'boss') r.attackKind = r.volley++ % 2 ? 'claw' : 'volley';
    else r.attackKind = { skirmisher: 'burst', gunner: 'lance', grappler: 'claw', bulwark: 'orb' }[r.type];
    if (r.attackKind === 'lance') {
      r.beam = beams.find((b) => !b.used) || null;
      if (r.beam) r.beam.used = true;
      r.aimPoint.copy(world.ship.pos);
    }
    world.sfx.charge(r.attackKind, world.pan(r.pos), world.gain(r.pos), r.teleTime + r.lockTime);
  }

  function release(r) {
    if (r.beam) { r.beam.used = false; r.beam.mesh.visible = false; r.beam = null; }
    r.charges?.forEach((c) => { c.visible = false; });
  }

  function fireAttack(r, dt) {
    const F = world.fire;
    const m = muzzle(r, r.muzzleW);
    if (r.attackKind === 'burst') {
      if (r.burst === 0) r.aimDir.subVectors(lead(r, R.boltSpeed), m).normalize();
      r.burstT -= dt;
      while (r.burstT <= 0 && r.burst < 3) {
        tmp.copy(r.aimDir).add(n3.randomDirection().multiplyScalar(0.012)).normalize();
        F.fire('bolt', m, tmp.multiplyScalar(R.boltSpeed), r, { damage: R.boltDamage, color: 0xff6a2a, life: 2 });
        world.sfx.enemyShot('bolt', world.pan(r.pos), world.gain(r.pos));
        world.fx.spark(m, r.aimDir, 3, 0xff8a40, 20, 0.5);
        r.burst++;
        r.burstT += 0.12;
      }
      return r.burst >= 3;
    }
    if (r.attackKind === 'lance') {
      r.burstT -= dt;
      while (r.burstT <= 0 && r.burst < 4) {
        F.fire('lance', m, tmp.copy(r.aimDir).multiplyScalar(R.lanceSpeed), r, { damage: R.lanceDamage, color: 0xffd23a, life: 1.6 });
        world.sfx.enemyShot('lance', world.pan(r.pos), world.gain(r.pos));
        world.fx.spark(m, r.aimDir, 4, 0xffe060, 24, 0.4);
        r.burst++;
        r.burstT += 0.075;
      }
      return r.burst >= 4;
    }
    if (r.attackKind === 'orb' || r.attackKind === 'volley') {
      const n = r.attackKind === 'volley' ? (r.rage ? 5 : 3) : 1;
      const base = tmp.subVectors(lead(r, R.orbSpeed, 0.35), m).normalize();
      perpA.crossVectors(base, up).normalize();
      for (let k = 0; k < n; k++) {
        const a = (k - (n - 1) / 2) * 0.11;
        const d = n3.copy(base).applyAxisAngle(up, a);
        F.fire('orb', m, d.multiplyScalar(R.orbSpeed), r, { damage: R.orbDamage, color: r.type === 'boss' ? 0xff40c0 : 0x4aa8ff, life: 7, size: r.type === 'boss' ? 2.1 : 1.8 });
      }
      world.sfx.enemyShot('orb', world.pan(r.pos), world.gain(r.pos));
      world.fx.ring(m, 1, 7, r.type === 'boss' ? 0xff40c0 : 0x4aa8ff, 0.3);
      return true;
    }
    if (r.attackKind === 'claw') {
      const dir = tmp.subVectors(lead(r, R.clawSpeed, 0.5), m).normalize();
      r.claw = F.fire('claw', m, dir.multiplyScalar(R.clawSpeed), r, { life: Math.min(2.2, r.T.range * 1.3 / R.clawSpeed) });
      world.sfx.enemyShot('claw', world.pan(r.pos), world.gain(r.pos));
      world.onGrappleFire(r, r.claw);
      return true;
    }
    return true;
  }

  // ---- Steering ------------------------------------------------------------------------
  function goal(r, out) {
    const ship = world.ship;
    perpA.set(0, 1, 0); if (Math.abs(ship.fwd.y) > 0.9) perpA.set(1, 0, 0);
    perpA.cross(ship.fwd).normalize();
    perpB.crossVectors(ship.fwd, perpA);
    switch (r.type) {
      case 'skirmisher': {
        // Wasps: circling a point ahead of you, so they stay in view
        const rad = r.state === 'recover' ? 70 : 42;
        return out.copy(ship.pos).addScaledVector(ship.fwd, 75).addScaledVector(perpA, Math.cos(r.orbit) * rad).addScaledVector(perpB, Math.sin(r.orbit) * rad * 0.7);
      }
      case 'gunner':
        return out.copy(ship.fwd).applyAxisAngle(perpB, r.offYaw).applyAxisAngle(perpA, r.offPitch).multiplyScalar(165).add(ship.pos);
      case 'grappler':
        return out.copy(ship.pos).addScaledVector(ship.fwd, 45).addScaledVector(perpA, Math.sign(r.offYaw) * 38).addScaledVector(perpB, r.offPitch * 20);
      case 'bulwark':
        return out.copy(ship.pos).addScaledVector(ship.fwd, 115).addScaledVector(perpA, r.offYaw * 30);
      case 'boss':
        return out.copy(ship.pos).addScaledVector(ship.fwd, 175).addScaledVector(perpA, Math.cos(r.orbit) * 50).addScaledVector(perpB, Math.sin(r.orbit * 0.7) * 25);
      default: return out.copy(ship.pos);
    }
  }

  function steerRaider(r, dt) {
    const T = r.T, ship = world.ship;
    toShip.subVectors(ship.pos, r.pos);
    const d = toShip.length();
    if (r.state === 'emerge') {
      r.vel.multiplyScalar(Math.exp(-1.6 * dt));
    } else {
      r.orbit += r.orbitDir * (r.type === 'boss' ? 0.22 : 0.9) * dt;
      goal(r, desired);
      steer.subVectors(desired, r.pos);
      const dd = steer.length();
      let speed = T.speed * (d > 260 ? (r.type === 'boss' ? 2.6 : 1.7) : 1);
      if (r.state === 'tele' && r.type !== 'skirmisher') speed *= 0.5;
      if (r.state === 'reel') speed *= 0.3;
      steer.multiplyScalar(dd > 1e-3 ? (speed * clamp(dd / 30, 0.15, 1)) / dd : 0);
      // Keep off the wrecks, off each other, and out of your face
      const hit = world.wrecks.collide(tmp.copy(r.pos).addScaledVector(r.vel, 0.9), T.radius + 8, n3);
      if (hit) steer.addScaledVector(n3, T.speed * 1.4);
      for (const o of all) {
        if (o === r || !o.alive) continue;
        tmp.subVectors(r.pos, o.pos);
        const sep = T.radius + o.T.radius + 14;
        const l = tmp.length();
        if (l < sep && l > 1e-3) steer.addScaledVector(tmp, (T.speed * (1 - l / sep)) / l);
      }
      const keep = T.radius + 12;
      if (d < keep) steer.addScaledVector(toShip, -T.speed * 1.5 / Math.max(d, 1));
      steer.sub(r.vel);
      const maxA = T.accel * dt;
      if (steer.length() > maxA) steer.setLength(maxA);
      r.vel.add(steer);
    }
    r.pos.addScaledVector(r.vel, dt);
    // Solid wrecks: never inside one
    const inside = world.wrecks.collide(r.pos, T.radius, n3);
    if (inside) { r.pos.addScaledVector(n3, inside.depth); const vn = r.vel.dot(n3); if (vn < 0) r.vel.addScaledVector(n3, -vn * 1.3); }

    // Face you when it matters, else fly nose-first
    const facePlayer = r.state === 'tele' || r.state === 'fire' || r.state === 'reel' || r.type === 'bulwark' || r.type === 'boss' || d < 60;
    if (facePlayer) tmp.copy(ship.pos); else if (r.vel.lengthSq() > 16) tmp.copy(r.pos).add(r.vel); else tmp.copy(ship.pos);
    look.lookAt(r.pos, tmp, up);
    qT.setFromRotationMatrix(look);
    r.root.quaternion.slerp(qT, 1 - Math.exp(-TURN[r.type] * dt));
    if (r.type === 'skirmisher') r.root.rotateZ(Math.sin(time * 7 + r.seed) * 0.02);   // a nervous twitch
    return d;
  }

  // ---- Per frame -------------------------------------------------------------------------
  function update(dt, camera) {
    time += dt;
    const agg = Math.max(0.2, R.aggression * (world.aggression ?? 1));
    for (const r of all) {
      if (r.dying > 0) { r.dying -= dt; if (r.dying <= 0) { r.dying = 0; r.root.visible = false; } }
      if (!r.alive) continue;
      r.age += dt;
      r.t += dt;
      r.cooldown -= dt * agg;
      r.label = Math.max(0, r.label - dt);
      steerRaider(r, dt);
      if (r.state === 'emerge' && r.t > 0.9) { r.state = 'hunt'; r.t = 0; }
      else if (r.state === 'hunt' && canAttack(r)) beginAttack(r);
      else if (r.state === 'tele') {
        const total = r.teleTime + r.lockTime;
        r.tele = Math.min(1, r.t / r.teleTime);
        r.lock = r.lockTime > 0 ? clamp((r.t - r.teleTime) / r.lockTime, 0, 1) : 0;
        teleVisual(r, dt);
        if (world.grappled() && r.attackKind !== 'claw') { cancel(r); }
        else if (r.t >= total) {
          r.state = 'fire'; r.t = 0; r.burst = 0; r.burstT = 0;
          if (r.attackKind === 'lance') r.aimDir.subVectors(r.aimPoint, muzzle(r, tmp)).normalize();
          release(r);
        }
      } else if (r.state === 'fire') {
        r.tele = 0;
        if (fireAttack(r, dt)) {
          if (r.attackKind === 'claw') { r.state = 'clawOut'; r.t = 0; }
          else { r.state = 'recover'; r.t = 0; r.cooldown = r.T.cooldown * (r.rage ? 0.7 : 1) * (0.85 + Math.random() * 0.3); }
        }
      } else if (r.state === 'clawOut') {
        if (!r.claw || !world.fire.list.includes(r.claw)) { r.claw = null; r.state = 'recover'; r.t = 0; r.cooldown = r.T.cooldown; }
      } else if (r.state === 'recover' && r.t > 1.1) { r.state = 'hunt'; r.t = 0; }

      // Shields regenerate after a while; damage smokes
      if (r.type === 'bulwark' && r.shield <= 0) {
        r.shieldDown -= dt;
        if (r.shieldDown <= 0) { r.shield = r.shieldMax; world.sfx.shieldUp(world.pan(r.pos), world.gain(r.pos)); world.fx.ring(r.pos, 2, 7, 0x4aa8ff, 0.4); }
      }
      if (r.hp < r.maxHp * 0.5 && (r.smokeT -= dt) <= 0) {
        r.smokeT = 0.22;
        world.fx.puff(tmp.copy(r.pos).add(n3.randomDirection().multiplyScalar(r.T.radius * 0.6)), r.vel, r.T.radius * 0.35);
        if (Math.random() < 0.4) world.fx.spark(tmp, null, 3, 0xffa040, 12);
      }
      r.flash *= Math.exp(-12 * dt);
      if (r.model.shieldMat) r.model.shieldMat.userData.flash.value *= Math.exp(-14 * dt);
      r.model.mats.hull.userData.flash.value = r.flash;
      r.model.animate(time, {
        tele: r.state === 'tele' ? r.tele : 0, lock: r.state === 'tele' ? r.lock : 0, seed: r.seed,
        reel: r.state === 'reel' ? 1 : 0, rage: r.rage,
        shieldUp: r.type === 'boss' ? !!r.pods && (r.pods[0] > 0 || r.pods[1] > 0) : r.shield > 0,
      });
      r.root.updateMatrixWorld(true);
    }
    for (const b of beams) if (!b.used) b.mesh.visible = false;
    void camera;
  }

  const beamUp = new V3(0, 1, 0);
  function teleVisual(r, dt) {
    const m = muzzle(r, r.muzzleW);
    if (r.attackKind === 'lance' && r.beam) {
      // The red line: tracks you with a lag, then locks (bright, blinking) just before it fires
      if (r.lock <= 0) r.aimPoint.lerp(lead(r, R.lanceSpeed, 0.35), 1 - Math.exp(-3.2 * dt));
      tmp.subVectors(r.aimPoint, m);
      const len = Math.max(1, tmp.length() + 60);
      tmp.normalize();
      const b = r.beam.mesh;
      b.visible = true;
      b.position.copy(m).addScaledVector(tmp, len / 2);
      b.quaternion.setFromUnitVectors(beamUp, tmp);
      const w = r.lock > 0 ? 0.22 : 0.06 + r.tele * 0.06;
      b.scale.set(w, len, w);
      b.material.userData.level.value = r.lock > 0 ? (Math.sin(time * 60) > 0 ? 3 : 1.4) : 0.5 + r.tele;
    }
    if (r.charges && (r.attackKind === 'orb' || r.attackKind === 'volley')) {
      const n = r.attackKind === 'volley' ? r.charges.length : 1;
      r.charges.forEach((c, k) => {
        c.visible = k < n;
        c.scale.setScalar(0.2 + r.tele * (r.type === 'boss' ? 1.9 : 1.6) + Math.sin(time * 30) * 0.05);
      });
    }
    if (r.attackKind === 'claw' && (r.pulseT = (r.pulseT ?? 0) - dt) <= 0) {
      r.pulseT = 0.22;
      world.fx.ring(m, 0.8, 5 + r.tele * 4, 0xd24cff, 0.3, tmp.subVectors(world.ship.pos, m).normalize());
      if (r.model.arms) {
        const a = r.model.arms[Math.floor(Math.random() * r.model.arms.length)].claw.getWorldPosition(tmp2);
        world.fx.arc(a, m, 0xd24cff, 0.1, 0.8);
      }
    }
    if (r.attackKind === 'burst' && Math.random() < dt * 20) world.fx.spark(m, null, 1, 0xff7a30, 8);
  }

  function cancel(r) {
    release(r);
    r.state = 'recover'; r.t = 0; r.cooldown = 1.2;
  }

  // ---- Being shot ---------------------------------------------------------------------------
  const wc = new V3();
  // Nearest thing a player bolt from a to b hits: { dist, point, normal, raider, part, shield }
  function raycast(a, b) {
    let best = null;
    tmp.subVectors(b, a);
    const len = tmp.length();
    if (len < 1e-6) return null;
    const dir = tmp2.copy(tmp).divideScalar(len);
    const test = (c, rad, r, part, shield) => {
      n3.subVectors(c, a);
      const t = n3.dot(dir);
      const d2 = n3.lengthSq() - t * t;
      if (d2 > rad * rad) return;
      const th = t - Math.sqrt(rad * rad - d2);
      if (th < -rad || th > len) return;
      const at = Math.max(0, th);
      if (!best || at < best.dist) {
        const point = a.clone().addScaledVector(dir, at);
        best = { dist: at, point, normal: point.clone().sub(c).normalize(), raider: r, part, shield };
      }
    };
    for (const r of all) {
      if (!r.alive) continue;
      if (r.pos.distanceTo(a) > len + 40) continue;
      const scale = R.hitRadiusScale;
      if (r.type === 'bulwark' && r.shield > 0) {
        const c = r.root.localToWorld(wc.copy(r.model.shieldCenter));
        // Only the front cap is shielded: flank it
        const before = best;
        test(c, r.model.shieldRadius, r, 'shield', true);
        if (best && best !== before && best.raider === r) {
          const fwd = n3.set(0, 0, -1).applyQuaternion(r.root.quaternion);
          if (best.normal.dot(fwd) < 0.2) best = before;
        }
      }
      if (r.type === 'boss' && (r.pods[0] > 0 || r.pods[1] > 0)) {
        test(r.root.localToWorld(wc.copy(r.model.shieldCenter)), r.model.shieldRadius, r, 'shield', true);
      }
      for (const s of r.model.spheres) {
        if (s.part === 'podL' && r.pods[0] <= 0) continue;
        if (s.part === 'podR' && r.pods[1] <= 0) continue;
        test(r.root.localToWorld(wc.copy(s.c)), s.r * (s.part === 'body' && r.type !== 'boss' ? scale : 1), r, s.part, false);
      }
    }
    return best;
  }

  // Apply a bolt: returns { killed, shield, armored }
  function damage(hit, amount, dir) {
    const r = hit.raider;
    if (!r.alive) return { killed: false };
    const pan = world.pan(r.pos), gain = world.gain(r.pos);
    if (hit.shield) {
      if (r.type === 'bulwark') {
        r.shield -= amount;
        r.model.shieldMat.userData.flash.value = 1;
        world.fx.hitShield(hit.point, hit.normal, 0x4aa8ff);
        if (r.shield <= 0) {
          r.shieldDown = r.T.shieldRegen;
          world.fx.ring(r.pos, 2, 16, 0x6ab8ff, 0.5);
          world.fx.spark(r.pos, null, 26, 0x6ab8ff, 40);
          world.sfx.shieldBreak(pan, gain);
        } else world.sfx.shieldHit(pan, gain);
      } else {
        r.model.shieldMat.userData.flash.value = 1;
        world.fx.hitShield(hit.point, hit.normal, 0xff4fd8);
        world.sfx.shieldHit(pan, gain);
      }
      r.vel.addScaledVector(dir, r.T.knock * 0.3);
      return { killed: false, shield: true };
    }
    if (r.type === 'boss') {
      if (hit.part === 'podL' || hit.part === 'podR') {
        const k = hit.part === 'podL' ? 0 : 1;
        r.pods[k] -= amount;
        r.flash = 0.6;
        world.fx.hitArmor(hit.point, hit.normal, r.vel);
        world.sfx.armorHit(pan, gain);
        if (r.pods[k] <= 0) {
          r.model.pods[k].visible = false;
          world.fx.explode(hit.point, r.vel, 'medium', 0xff40d0);
          world.sfx.explode(1.4, pan, gain);
          const left = (r.pods[0] > 0 ? 1 : 0) + (r.pods[1] > 0 ? 1 : 0);
          if (left === 0) { r.model.shield.visible = false; world.fx.ring(r.pos, 6, 40, 0xff4fd8, 0.6); world.sfx.shieldBreak(pan, gain); }
          world.onPodDown(r, left);
        }
        return { killed: false };
      }
      if (hit.part === 'body') {
        world.fx.hitArmor(hit.point, hit.normal, r.vel);
        world.sfx.armorHit(pan, gain * 0.6);
        return { killed: false, armored: true };
      }
    }
    r.hp -= amount;
    r.flash = 1;
    r.vel.addScaledVector(dir, r.T.knock * amount);
    world.fx.hitArmor(hit.point, hit.normal, r.vel);
    world.sfx.armorHit(pan, gain);
    // Armour comes away in plates as it weakens
    const plates = r.model.plates;
    while (r.plates < plates.length && r.hp / r.maxHp < 1 - (r.plates + 1) / (plates.length + 1)) {
      const p = plates[r.plates++];
      p.visible = false;
      const at = p.getWorldPosition(tmp);
      world.fx.junkBurst(at, r.vel, 3, 12, r.type === 'boss' ? 2.4 : 1);
      world.fx.spark(at, null, 10, 0xffb060, 30);
      world.sfx.plate(pan, gain);
    }
    if (r.type === 'boss' && !r.halfCalled && r.hp < r.maxHp * 0.5) { r.halfCalled = true; r.rage = 1; world.onBossHalf?.(r); }
    if (r.hp <= 0) { kill(r, dir); return { killed: true }; }
    return { killed: false };
  }

  function kill(r, dir = null) {
    r.alive = false;
    r.dead = true;
    release(r);
    world.fire.cancelOwner(r);
    const vel = r.vel.clone();
    if (dir) vel.addScaledVector(dir, 6);
    world.fx.explode(r.pos.clone(), vel, EXPLOSION[r.type], LOOK[r.type].accent);
    world.sfx.explode({ small: 0.8, medium: 1.2, large: 1.8, boss: 3 }[EXPLOSION[r.type]], world.pan(r.pos), world.gain(r.pos));
    // The hull hangs on a moment inside the fireball (the boss for its whole death)
    r.dying = r.type === 'boss' ? 1.55 : 0.08;
    world.onKill(r);
  }

  // Environmental damage: mag pulses, arcs, rams
  function hurt(r, amount, push) {
    if (!r.alive) return;
    r.vel.add(push);
    if (r.type === 'boss') return;
    r.hp -= amount;
    r.flash = 1;
    if (r.hp <= 0) kill(r, push.clone().normalize());
  }

  // A raider the ship has flown into (sphere overlap), or null
  function touching(p, radius) {
    for (const r of all) {
      if (!r.alive) continue;
      if (r.pos.distanceTo(p) < r.T.radius * 0.9 + radius) return r;
    }
    return null;
  }

  function clear() {
    for (const r of all) { r.alive = false; r.dying = 0; r.root.visible = false; release(r); r.claw = null; }
    for (const b of beams) { b.used = false; b.mesh.visible = false; }
    lastAttack = -99;
  }

  // Compile every pipeline up front (called while the zone is still being approached)
  function warm(at) { for (const r of all) { r.root.visible = true; r.root.position.copy(at); r.root.updateMatrixWorld(true); } }
  function unwarm() { for (const r of all) if (!r.alive) r.root.visible = false; }

  function dispose() { for (const r of all) disposeModel(r.model); }

  return { group, all, alive, spawn, update, raycast, damage, hurt, kill, touching, anchor, muzzle, clear, warm, unwarm, dispose, cancel };
}
