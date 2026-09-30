// The Dead Zone director: one self-contained fight in the wreck field of an old battle.
//
// A trip alternates the lane (rings, radiation) with these encounters. The arc:
//   idle      the zone is planned down the lane; the wrecks are built but far away
//   approach  the beacons ahead flicker and fail
//   explore   the rules change (no radiation, fly anywhere); eerie quiet among the wrecks
//   warning   klaxon: contacts in the wrecks
//   fight     escalating waves from config.raiders.waves, the last one the final threat
//   breather  a short pause between waves (hull patched from salvage)
//   cleared   the victory beat
//   exit      the beacons relight and the lane's rules come back
//
// The host (the belt run) owns the ship, the hull and the score. It talks to the director
// only through the api below and the host callbacks passed in:
//   host: { ship, camera, flying(), invulnerable(), damage(n, cause), trauma(k), flash(k),
//           score(n), callout(text, side, big), say(who, text, s), slowmo(s, scale), emit(name, data) }
import * as THREE from 'three/webgpu';
import { createWrecks } from './wrecks.js';
import { createRaiders } from './raiders.js';
import { createEnemyFire } from './projectiles.js';
import { createCombatFx } from './fx.js';
import { createCombatSfx } from './sfx.js';
import { createDeadZoneHud } from './hud.js';
import { LOOK } from './models.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const SHIP_R = 1.4;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const LINES = {
  approach: ['Beacons ahead are going dark. That is a dead zone.', 'Lane signal is failing ahead. Old battlefield. Stay sharp.'],
  enter: ['No beacons, no radiation shelter needed. Fly where you like. Something is in those wrecks.', 'Radiation is flat in here. The rules are off. So is anyone who could help.'],
  hook: ['Hook throwing a claw. Break line, or shoot it before it lands.'],
  scrap: ['Inside the scrap their guns cannot lock you. It chews the hull, though.'],
  relit: ['Beacons are lit again. Rejoin the lane; the shielding will hold a while.'],
};

export function createDeadZone({ config, audio, hudParent, host }) {
  const Z = config.deadZone, R = config.raiders;
  const ship = host.ship;
  const group = new THREE.Group();
  const center = new V3();
  const tmp = new V3(), tmp2 = new V3(), dir = new V3(), rel = new V3(), n3 = new V3(), proj = new V3();
  const qStep = new THREE.Quaternion(), qId = new THREE.Quaternion();

  const wrecks = createWrecks(config);
  const fx = createCombatFx();
  const fire = createEnemyFire(config);
  const sfx = createCombatSfx(audio);
  const hud = createDeadZoneHud(hudParent);

  const pan = (p) => clamp(tmp2.subVectors(p, ship.pos).normalize().dot(ship.right), -1, 1) * 0.8;
  const gain = (p) => clamp(1.15 - p.distanceTo(ship.pos) / 450, 0.12, 1);
  const sideOf = (p) => (tmp2.subVectors(p, ship.pos).dot(ship.right) >= 0 ? 1 : -1);

  const world = {
    ship, fx, fire, sfx, wrecks, pan, gain, aggression: 1,
    grappled: () => !!tether,
    solid: (p) => wrecks.solid(p),
    onKill, onPodDown, onGrappleFire, onBossHalf,
  };
  const raiders = createRaiders(config, world);
  group.add(wrecks.group, raiders.group, fire.group, fx.group);

  let zones = [], zi = 0;
  let phase = 'idle', t = 0, wave = -1, mood = 0, dim = 0, flicker = 0;
  let spawnQueue = [];
  let tether = null, tetherGrace = 0, ramCd = 0, arcCd = 0, bumpCd = 0, creakT = 2;
  let kills = 0, hookSaid = false, scrapSaid = false, bossRef = null;
  let warning = '', hint = '', lastKilled = false, relitPulse = false;
  let lastStick = { x: 0, y: 0, boost: false };

  const fighting = () => phase === 'warning' || phase === 'fight' || phase === 'breather';
  const rulesOff = () => phase === 'explore' || fighting() || phase === 'cleared';
  const aliveCount = () => raiders.all.reduce((n, r) => n + (r.alive ? 1 : 0), 0);

  // ---- Planning and reset ------------------------------------------------------------
  // distance: metres from take-off to the destination pad (0 = no zones this run)
  function reset(distance = 0, aggression = 1) {
    clearCombat();
    hud.clear(); hud.setVisible(false);
    phase = 'idle'; t = 0; wave = -1; mood = 0; dim = 0; kills = 0;
    hookSaid = false; scrapSaid = false; warning = ''; hint = '';
    world.aggression = clamp(aggression, 0.75, 1.35);
    zones = []; zi = 0;
    if (Z.enabled && distance > 0) {
      for (let d = Z.firstAt; distance - d >= Z.minToDest; d += Z.spacing) zones.push(-d);
    }
    if (zones.length) build(zones[0]); else wrecks.clear();
  }
  function build(z) {
    center.set(0, 0, z);
    wrecks.clear();
    wrecks.build(center, (Math.random() * 1e9) | 0);
  }
  function clearCombat() {
    raiders.clear(); fire.clear(); fx.clear(); spawnQueue = [];
    if (tether) { tether = null; hud.setTether(false); }
    sfx.silence();
    bossRef = null;
  }

  // ---- The beats ---------------------------------------------------------------------
  function enter() {
    phase = 'explore'; t = 0;
    raiders.unwarm();
    sfx.zoneEnter();
    hud.setVisible(true);
    hud.glitch();
    hud.banner('Dead Zone', 'Beacons dark · no radiation · fly anywhere', 'dead', 5);
    host.say('MICA', pick(LINES.enter), 6);
    host.trauma(0.25);
    host.emit('deadZone', { phase: 'enter' });
  }
  function warn() {
    phase = 'warning'; t = 0;
    sfx.klaxon();
    hud.glitch();
    hud.banner('Raiders', 'Contacts in the wrecks', 'warn', 3);
  }
  function startWave(i) {
    wave = i; t = 0; phase = 'fight';
    const W = R.waves[i];
    if (W.final) {
      hud.banner('Carrion', 'Break its two shield pods, then hit the core', 'boss', 4);
      sfx.bossHorn();
      host.trauma(0.3);
    } else hud.banner(`Wave ${i + 1}`, waveName(W), 'small', 2.2);
    queueGroups(W.groups, W.final ? 1.2 : 0.3);
  }
  const waveName = (W) => W.groups.map(([type, n]) => `${n} ${LOOK[type].name}${n > 1 ? 's' : ''}`).join(' · ');
  function queueGroups(groups, delay) {
    // Each group bursts from its own hatch, members a beat apart: a small swarm you can read
    let at = delay;
    for (const [type, n] of groups) {
      const h = pickHatch(type === 'boss' ? 180 : 110, type === 'boss' ? 380 : 320);
      for (let k = 0; k < n; k++) spawnQueue.push({ type, at: at + k * 0.35, pos: h.pos.clone(), normal: h.normal.clone(), k });
      at += 0.9;
    }
  }
  function pickHatch(near, far) {
    let best = null, bestScore = -1e9;
    for (const h of wrecks.hatches) {
      const d = h.pos.distanceTo(ship.pos);
      if (d < near * 0.7 || d > far * 1.6) continue;
      const ahead = tmp.subVectors(h.pos, ship.pos).normalize().dot(ship.fwd);
      const score = ahead * 2 - Math.abs(d - (near + far) / 2) / 120 + Math.random() * 0.8 - (d < near ? 2 : 0);
      if (score > bestScore) { bestScore = score; best = h; }
    }
    if (best) return best;
    // No wreck in range (you have wandered): they come out of the dark ahead of you
    const p = ship.pos.clone().addScaledVector(ship.fwd, (near + far) / 2).add(n3.randomDirection().multiplyScalar(60));
    return { pos: p, normal: ship.fwd.clone().negate() };
  }
  function runSpawns(dt) {
    for (let i = spawnQueue.length - 1; i >= 0; i--) {
      const s = spawnQueue[i];
      if ((s.at -= dt) > 0) continue;
      spawnQueue.splice(i, 1);
      const offset = n3.randomDirection().multiplyScalar(s.k * 3);
      const at = s.pos.clone().addScaledVector(s.normal, 6).add(offset);
      const r = raiders.spawn(s.type, at, s.normal);
      if (!r) continue;
      if (s.type === 'boss') bossRef = r;
      const big = s.type === 'boss' || s.type === 'bulwark';
      fx.ring(at, 1, big ? 26 : 9, LOOK[s.type].accent, 0.45, s.normal);
      fx.spark(at, s.normal, big ? 30 : 12, LOOK[s.type].accent, 30);
      sfx.emerge(pan(at), gain(at), big);
    }
  }
  function waveCleared() {
    const last = wave >= R.waves.length - 1;
    if (last) {
      phase = 'cleared'; t = 0;
      sfx.victory();
      hud.banner('Cleared', `+${Z.clearBonus.toLocaleString()} · salvage rights are yours`, 'clear', 4);
      hud.setWave(null); hud.setBoss(false);
      host.score(Z.clearBonus);
      host.slowmo(0.7, 0.35);
      host.heal(Z.waveRepair * 2);
      host.emit('deadZone', { phase: 'cleared', kills });
      return;
    }
    phase = 'breather'; t = 0;
    sfx.waveClear();
    host.heal(Z.waveRepair);
    host.callout(`Wave clear · hull patched +${Z.waveRepair}`, 1, true);
  }
  function relight() {
    phase = 'exit'; t = 0;
    sfx.relight();
    hud.banner('Beacons relit', 'Rings and radiation are back · rejoin the lane', 'clear', 4);
    host.say('MICA', pick(LINES.relit), 5);
    relitPulse = true;
    host.emit('deadZone', { phase: 'exit' });
  }

  // ---- Raider callbacks --------------------------------------------------------------
  function onKill(r) {
    kills++;
    const T = r.T;
    host.score(T.score);
    host.callout(`${LOOK[r.type].name} down +${T.score}`, sideOf(r.pos), true);
    const close = clamp(1 - r.pos.distanceTo(ship.pos) / 150, 0, 1);
    host.trauma(r.type === 'boss' ? 0.9 : 0.12 + close * 0.3);
    if (r.type === 'boss') { host.slowmo(1.3, 0.3); host.flash(0.5); bossRef = null; }
    if (tether && tether.owner === r) breakFree('Hook destroyed · tether cut');
    host.emit('raiderKilled', { type: r.type });
  }
  function onPodDown(r, left) {
    host.callout(left ? 'Shield pod down' : 'Shield down · hit the core', 1, true);
    host.trauma(0.35);
  }
  function onGrappleFire() {
    if (!hookSaid) { hookSaid = true; host.say('MICA', pick(LINES.hook), 4); }
  }
  function onBossHalf() {
    const W = R.waves[R.waves.length - 1];
    if (!W.reinforce) return;
    sfx.klaxon();
    hud.banner('Reinforcements', 'Carrion is calling the swarm', 'warn', 2.5);
    queueGroups(W.reinforce, 0.8);
  }

  // ---- Enemy fire reaching the ship ------------------------------------------------------
  fire.handlers.onHitShip = (p) => {
    if (!host.flying()) return false;
    if (host.invulnerable()) return false;              // the phase drive passes through it all
    if (p.kind === 'claw') {
      if (tether || tetherGrace > 0) return true;       // one tether at a time: the claw reels in
      p.state = 'latched';
      tether = { claw: p, owner: p.owner, t: 0, shake: 0 };
      sfx.grappleLatch();
      host.trauma(0.4);
      host.flash(0.3);
      host.callout('Grappled!', sideOf(p.pos), true);
      return true;
    }
    const dmg = p.dmg || (p.kind === 'orb' ? R.orbDamage : p.kind === 'lance' ? R.lanceDamage : R.boltDamage);
    host.damage(dmg, 'raider');
    dir.copy(p.vel).normalize();
    if (p.kind === 'orb') {
      ship.dodge.addScaledVector(dir, R.orbKnock);
      fx.explode(p.pos, ship.vel, 'pop', 0xff60d0);
      fx.ring(p.pos, 1, 10, 0x80c8ff, 0.3, dir);
      sfx.explode(1, pan(p.pos), 1);
      host.trauma(0.6); host.flash(0.8);
    } else {
      ship.dodge.addScaledVector(dir, 3);
      fx.spark(p.pos, n3.copy(dir).negate(), 8, 0xffb060, 26);
      sfx.armorHit(pan(p.pos), 1);
      host.trauma(0.22); host.flash(0.4);
    }
    host.callout('Hull hit', sideOf(p.pos));
    return true;
  };
  fire.handlers.onBlocked = (p) => { if (p.pos.distanceTo(ship.pos) < 400) fx.hitWreck(p.pos); };

  // ---- Hazards -------------------------------------------------------------------------
  wrecks.handlers.onCoilCharge = (c) => sfx.coilCharge(pan(c.pos), gain(c.pos));
  wrecks.handlers.onCoilPulse = (c) => {
    fx.ring(c.pos, 4, c.radius, 0x7ad8ff, 0.55);
    for (let k = 0; k < 4; k++) fx.arc(c.pos, tmp.copy(c.pos).add(n3.randomDirection().multiplyScalar(c.radius * 0.5)), 0x9ae0ff, 0.2, 3);
    sfx.coilPulse(pan(c.pos), gain(c.pos));
    if (!rulesOff()) return;
    // The magnetic field throws ships away; close in it hurts, and it snaps a tether
    const d = ship.pos.distanceTo(c.pos);
    if (d < c.radius && host.flying()) {
      const k = 1 - d / c.radius;
      dir.subVectors(ship.pos, c.pos).normalize();
      ship.dodge.addScaledVector(dir, 16 + 30 * k);
      host.trauma(0.2 + 0.4 * k);
      if (k > 0.35 && !host.invulnerable()) { host.damage(Z.coilDamage * k, 'coil'); host.flash(0.3); }
      if (tether) breakFree('The mag pulse snapped the tether');
      else host.callout('Mag pulse', sideOf(c.pos));
    }
    for (const r of raiders.all) {
      if (!r.alive) continue;
      const dr = r.pos.distanceTo(c.pos);
      if (dr >= c.radius) continue;
      const k = 1 - dr / c.radius;
      raiders.hurt(r, Z.coilDamage * k, tmp.subVectors(r.pos, c.pos).normalize().multiplyScalar(30 * k));
    }
  };
  const segMid = (a) => tmp.addVectors(a.a, a.b).multiplyScalar(0.5);
  wrecks.handlers.onArcWarn = (a) => { const m = segMid(a); if (m.distanceTo(ship.pos) < 500) sfx.arcWarn(pan(m), gain(m)); };
  wrecks.handlers.onArcOn = (a) => { const m = segMid(a); if (m.distanceTo(ship.pos) < 500) sfx.arcOn(pan(m), gain(m)); };

  function closestOnSeg(a, b, p, out) {
    rel.subVectors(b, a);
    const k = clamp(n3.subVectors(p, a).dot(rel) / Math.max(rel.lengthSq(), 1e-6), 0, 1);
    return out.copy(a).addScaledVector(rel, k);
  }

  function shipContacts(dt, realDt) {
    let rattle = 0;
    // Wrecks: solid and heavy. You slide off them; only a hard hit costs hull.
    const hit = wrecks.collide(ship.pos, SHIP_R + 0.6, n3);
    if (hit) {
      ship.pos.addScaledVector(hit.normal, hit.depth);
      rel.copy(ship.vel);
      if (hit.vel) rel.sub(hit.vel);
      const vn = -rel.dot(hit.normal);
      if (vn > 0) {
        ship.dodge.addScaledVector(hit.normal, vn * (1 + Z.bounce));
        ship.base.addScaledVector(hit.normal, vn);
        ship.speed *= vn > Z.collideSoft ? 0.75 : 0.95;
        if (bumpCd <= 0 && host.flying()) {
          bumpCd = 0.35;
          sfx.wreckHit(vn / 40);
          host.trauma(clamp(vn / 55, 0.1, 0.8));
          fx.spark(tmp.copy(ship.pos).addScaledVector(hit.normal, -SHIP_R), hit.normal, 10, 0xffd8a0, 22);
          if (vn > Z.collideSoft && !host.invulnerable()) {
            host.damage(Math.min(Z.collideMax, (vn - Z.collideSoft) * Z.collideDamage + 2), 'wreck');
            host.flash(0.45);
            host.callout('Hit the wreck', sideOf(tmp), false);
          }
        }
      }
      rattle = 1;
    }
    // Rams: flying into a raider hurts you both and shoves you apart
    const r = raiders.touching(ship.pos, SHIP_R);
    if (r && ramCd <= 0 && host.flying()) {
      ramCd = 0.9;
      dir.subVectors(ship.pos, r.pos).normalize();
      ship.dodge.addScaledVector(dir, 12);
      raiders.hurt(r, 2.5, tmp.copy(dir).multiplyScalar(-14));
      if (!host.invulnerable()) host.damage(R.ramDamage, 'raider');
      fx.spark(tmp.addVectors(ship.pos, r.pos).multiplyScalar(0.5), dir, 14, 0xffb060, 30);
      sfx.wreckHit(0.6);
      host.trauma(0.5); host.flash(0.35);
      host.callout('Rammed', sideOf(r.pos), false);
    }
    // Scrap clouds: a rattle and a slow nibble, but raider guns lose you
    const s = wrecks.inScrap(ship.pos);
    if (s > 0 && host.flying()) {
      rattle = Math.max(rattle, s);
      if (!host.invulnerable()) host.damage(Z.scrapDamage * s * dt, 'scrap');
      host.trauma(0.04 * s);
      if (!scrapSaid && fighting()) { scrapSaid = true; host.say('MICA', pick(LINES.scrap), 4); }
    }
    sfx.scrape(rattle);
    // Live arcs: flicker first (the warning), then arc
    const a = wrecks.arcAt(ship.pos, SHIP_R);
    if (a && arcCd <= 0 && host.flying() && !host.invulnerable()) {
      arcCd = 0.8;
      host.damage(Z.arcDamage, 'arc');
      fx.arc(closestOnSeg(a.a, a.b, ship.pos, tmp), ship.pos, 0xbfe8ff, 0.25, 2);
      ship.dodge.add(n3.randomDirection().multiplyScalar(8));
      sfx.zap();
      host.trauma(0.45); host.flash(0.5);
      host.callout('Arced!', 1, false);
    }
    for (const x of raiders.all) if (x.alive && wrecks.arcAt(x.pos, x.T.radius)) raiders.hurt(x, Z.arcDamage * realDt * 1.5, tmp.set(0, 0, 0));
  }

  // ---- The tether ------------------------------------------------------------------------
  function breakFree(text) {
    const p = tether.claw;
    if (fire.list.includes(p)) p.state = 'reel';
    const home = raiders.anchor(tether.owner, tmp);
    if (home) ship.dodge.addScaledVector(dir.subVectors(ship.pos, home).normalize(), 10);
    fx.ring(ship.pos, 1, 9, 0xd24cff, 0.35);
    fx.tether(ship.pos, ship.pos, false);
    sfx.tetherSnap(); sfx.tether(false);
    hud.setTether(false);
    host.callout(text, 1, true);
    tether = null;
    tetherGrace = 1.6;
  }
  function runTether(dt, realDt, input) {
    const p = tether.claw;
    tether.t += realDt;
    const home = tether.owner.alive ? raiders.anchor(tether.owner, tmp) : null;
    if (!home || !fire.list.includes(p)) return breakFree('Tether snapped');
    p.pos.copy(ship.pos).addScaledVector(ship.up, -0.6);
    dir.subVectors(home, ship.pos);
    const span = dir.length();
    dir.divideScalar(Math.max(span, 1e-3));
    ship.dodge.addScaledVector(dir, R.grapplePull * dt * (span > 25 ? 1 : 0.3));
    if (!host.invulnerable()) host.damage(R.grappleDrain * dt, 'raider');
    // Escape: shake the stick hard, or tap Boost. Either way it never lasts long.
    const shake = Math.abs(input.stickX - lastStick.x) + Math.abs(input.stickY - lastStick.y);
    tether.shake += Math.min(shake, 0.5) + (!!input.boost !== lastStick.boost ? 0.55 : 0);
    const frac = Math.max(tether.shake / R.grappleShake, tether.t / R.grappleHold * 0.6);
    fx.tether(home, ship.pos, true, 1 - frac);
    sfx.tether(true, frac);
    host.trauma(0.06);
    const how = input.device === 'touch' ? 'Wiggle the stick or tap Boost' : input.device === 'gamepad' ? 'Waggle the left stick or tap B' : 'Shake the mouse or tap Boost';
    hud.setTether(true, frac, `${how} · or shoot the Hook`);
    if (tether.shake >= R.grappleShake) breakFree('Broke free');
    else if (tether.t >= R.grappleHold) breakFree('Tether snapped');
  }

  // ---- HUD brackets ------------------------------------------------------------------------
  const marks = [], edges = [];
  function updateMarks() {
    const cam = host.camera;
    marks.length = 0; edges.length = 0;
    const W = innerWidth, H = innerHeight;
    const pxPerRad = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    for (const r of raiders.all) {
      if (!r.alive) continue;
      const danger = r.state === 'tele' || r.state === 'fire' || r.state === 'clawOut';
      const color = LOOK[r.type].css;
      proj.copy(r.pos).project(cam);
      const inView = proj.z < 1 && Math.abs(proj.x) < 0.96 && Math.abs(proj.y) < 0.94;
      if (inView && marks.length < 10) {
        const d = r.pos.distanceTo(cam.position);
        const size = clamp((r.T.radius / Math.max(d, 1)) * pxPerRad * 2.6, 22, 140);
        marks.push({
          x: (proj.x + 1) * 0.5 * W, y: (1 - proj.y) * 0.5 * H, size, color, danger,
          locked: danger && (r.lock ?? 0) > 0.5,
          name: r.label > 0 || r.type === 'boss' ? LOOK[r.type].name : '',
          hp: r.type === 'boss' ? null : r.hp / r.maxHp,
        });
      } else if (!inView && edges.length < 8) {
        tmp.subVectors(r.pos, cam.position).applyQuaternion(qStep.copy(cam.quaternion).invert());
        const ang = Math.atan2(-tmp.y, tmp.x);
        edges.push({ x: W / 2 + Math.cos(ang) * W * 0.44, y: H / 2 + Math.sin(ang) * H * 0.4, angle: ang, color, danger });
      }
    }
    hud.setMarks(marks);
    hud.setEdges(edges);
    const W2 = R.waves[wave];
    const left = aliveCount() + spawnQueue.length;
    if (phase === 'fight' || phase === 'breather') hud.setWave(W2?.final ? 'Final threat' : `Wave ${wave + 1} of ${R.waves.length}`, left);
    if (bossRef?.alive) {
      const pods = (bossRef.pods[0] > 0 ? 1 : 0) + (bossRef.pods[1] > 0 ? 1 : 0);
      hud.setBoss(true, pods, bossRef.hp / bossRef.maxHp, pods ? 'Shoot the glowing shield pods' : 'Core exposed · shoot the core');
    } else hud.setBoss(false);
  }

  // ---- Frame -----------------------------------------------------------------------------
  function update(realDt, dt, input) {
    relitPulse = false;
    if (!wrecks.built) { idleFade(realDt); return; }
    const d = ship.pos.distanceTo(center);
    const near = d < Z.radius + Z.approach + 1400;
    if (near) wrecks.update(dt);
    t += realDt;
    bumpCd -= realDt; ramCd -= realDt; arcCd -= realDt; tetherGrace -= realDt;

    switch (phase) {
      case 'idle':
        if (zi < zones.length && host.flying() && d < Z.radius + Z.approach) {
          phase = 'approach'; t = 0;
          sfx.beaconFail();
          host.say('MICA', pick(LINES.approach), 5);
          raiders.warm(center);   // compile the raider pipelines now, out in the fog
        }
        break;
      case 'approach':
        if (d < Z.radius) enter();
        break;
      case 'explore':
        if (t > Z.exploreTime) warn();
        break;
      case 'warning':
        if (t > Z.warningTime) startWave(0);
        break;
      case 'fight':
        if (!spawnQueue.length && aliveCount() === 0 && t > 1) waveCleared();
        break;
      case 'breather':
        if (t > Z.breather) startWave(wave + 1);
        break;
      case 'cleared':
        if (t > Z.clearedHold) relight();
        break;
      case 'exit':
        if (t > 2.5) {
          phase = 'idle'; t = 0; zi++;
          hud.setVisible(false); hud.clear();
          sfx.silence();
        }
        break;
    }

    // Beacons: flicker and fail on the way in, relight on the way out
    const wantDim = phase === 'approach' ? clamp(1 - (d - Z.radius) / Z.approach, 0, 1) : rulesOff() ? 1 : phase === 'exit' ? 1 - t / 2.5 : 0;
    flicker = phase === 'approach' && Math.random() < 0.12 ? 0.5 : 0;
    dim = clamp(wantDim + (Math.random() < 0.5 ? flicker : -flicker), 0, 1);
    mood += ((rulesOff() ? 1 : phase === 'approach' ? wantDim * 0.5 : 0) - mood) * (1 - Math.exp(-1.6 * realDt));
    sfx.ambience(near ? mood : 0);

    if (phase === 'explore' && (creakT -= realDt) <= 0) {
      creakT = 1.4 + Math.random() * 2.2;
      if (Math.random() < 0.7) sfx.creak((Math.random() * 2 - 1) * 0.8); else sfx.ping((Math.random() * 2 - 1) * 0.8);
    }

    // Combat and hazards run while the zone's rules are on
    if (near) {
      runSpawns(dt);
      raiders.update(dt, host.camera);
      fire.update(dt, ship, world, (o, out) => raiders.anchor(o, out));
      fx.update(dt, host.camera);
      if (rulesOff() || phase === 'exit') shipContacts(dt, realDt);
      if (tether) {
        if (host.flying()) runTether(dt, realDt, input); else breakFree('');
      }
    }
    lastStick.x = input.stickX; lastStick.y = input.stickY; lastStick.boost = !!input.boost;

    // Soft edge while the fight is on: the field turns you back rather than letting you leave
    warning = '';
    if (host.flying() && (phase === 'explore' || fighting())) {
      const over = d - Z.radius * 0.94;
      if (over > 0) {
        dir.subVectors(center, ship.pos).normalize();
        qStep.setFromUnitVectors(ship.fwd, dir);
        const k = 1 - Math.exp(-(1.2 + over / 40) * realDt);
        ship.quat.premultiply(qId.identity().slerp(qStep, k)).normalize();
        warning = 'Edge of the wreck field · turning you back';
      }
    }

    // What the pilot needs to know right now
    hint = '';
    if (phase === 'explore') hint = 'Dead Zone: no radiation, no rings. Fly anywhere, use the wrecks as cover.';
    else if (phase === 'warning' || (phase === 'fight' && wave === 0 && t < 6)) hint = 'Red ! = winding up to fire at you. Dodge sideways or break line of sight.';

    if (rulesOff() || phase === 'exit' || phase === 'approach') updateMarks();
    else if (phase === 'idle') { hud.setMarks([]); hud.setEdges([]); }
    hud.update(realDt);

    // After the fight, build the next zone once this one is well behind
    if (phase === 'idle' && zi > 0 && zi < zones.length && d > Z.radius + 2500 && Math.abs(center.z - zones[zi]) > 1) build(zones[zi]);
  }
  function idleFade(realDt) {
    mood *= Math.exp(-2 * realDt);
    dim = 0;
  }

  // ---- Player bolts ----------------------------------------------------------------------
  // Returns a hit the blasters can use: { rock: { zoneHit | zoneOrb }, point, normal, dist }
  function raycast(a, b) {
    if (!(rulesOff() || phase === 'exit')) return null;
    let best = null;
    const h = raiders.raycast(a, b);
    if (h) best = { rock: { zoneHit: h }, point: h.point, normal: h.normal, dist: h.dist };
    const o = fire.raycast(a, b);
    if (o && o.proj.kind === 'orb' && (!best || o.dist < best.dist)) {
      best = { rock: { zoneOrb: o.proj }, point: o.point, normal: o.point.clone().sub(o.proj.pos).normalize(), dist: o.dist };
    }
    if (best) return best;
    // Aim assist: a bolt that passes close to a raider (by angle from the ship) bends onto it
    const assist = R.aimAssist * (host.device() === 'keyboard' ? 1 : 2.2);
    rel.subVectors(b, a);
    const len = rel.length();
    if (len < 1e-6) return null;
    dir.copy(rel).divideScalar(len);
    for (const r of raiders.all) {
      if (!r.alive || r.type === 'boss' || (r.type === 'bulwark' && r.shield > 0)) continue;
      const along = n3.subVectors(r.pos, a).dot(dir);
      if (along < -r.T.radius || along > len + r.T.radius) continue;
      const off = n3.addScaledVector(dir, -along).length();
      const allow = Math.min(r.T.radius * 3, r.T.radius * R.hitRadiusScale + r.pos.distanceTo(ship.pos) * assist);
      if (off < allow && (!best || along < best.dist)) {
        const point = r.pos.clone().addScaledVector(dir, -r.T.radius * 0.8);
        const hit = { dist: Math.max(0, along), point, normal: dir.clone().negate(), raider: r, part: 'body', shield: false };
        best = { rock: { zoneHit: hit }, point, normal: hit.normal, dist: hit.dist };
      }
    }
    return best;
  }
  function damage(target, amount) {
    lastKilled = false;
    if (target.zoneOrb) {
      const p = target.zoneOrb;
      fx.explode(p.pos, p.vel, 'pop', 0xff60d0);
      sfx.explode(0.6, pan(p.pos), gain(p.pos));
      fire.free(p);
      host.score(50);
      host.callout('Orb popped +50', sideOf(p.pos), false);
      return null;
    }
    const h = target.zoneHit;
    const res = raiders.damage(h, amount, dir.subVectors(h.point, ship.pos).normalize());
    lastKilled = !!res.killed;
    return null;
  }

  return {
    group, hud, raiders, wrecks, reset, update, raycast, damage,
    // Rocks, gates and traffic stay out of the wreck field
    clears: (p, r = 0) => wrecks.built && p.distanceTo(center) < Z.radius + r + 60,
    blocksGate: (p) => wrecks.built && p.distanceTo(center) < Z.radius + 40,
    solid: (p) => wrecks.built && (rulesOff() || phase === 'exit' || p.distanceTo(center) < Z.radius + 80) && wrecks.solid(p),
    predictHit: (s, horizon) => (R.autoRollOrbs && fighting() ? fire.predictHit(s, horizon) : null),
    hitWreck: (p) => fx.hitWreck(p),
    get rulesOff() { return rulesOff(); },
    get phase() { return phase; },
    get mood() { return mood; },
    get dim() { return dim; },
    get warning() { return warning; },
    get hint() { return hint; },
    get kills() { return kills; },
    get lastKilled() { return lastKilled; },
    get relit() { return relitPulse; },
    get tethered() { return !!tether; },
    dispose() { clearCombat(); raiders.dispose(); wrecks.dispose(); hud.dispose(); },
  };
}
