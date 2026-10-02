import * as THREE from 'three/webgpu';
import { glowMaterial } from './deadzone/geo.js';
import { createWingVoice } from './wingVoice.js';

// Your wing: every hired hand flies escort in their own small fighter, out where you can see
// them, ahead and off your shoulders. On the lane they hold formation. In a Dead Zone they
// break to fight: each picks a raider, flies at it and shoots, and they soak up fire meant for
// you. They can be shot down, and that is final (the tycoon layer takes them off the books).
//
// Loyalty (tycoon/crew.js) shapes how they fly: a loyal hand hits harder and, when your hull is
// failing, stays in the fight to cover you instead of falling back. An unhappy one shoots less.
//
// trip.wing: [{ id, name, role, color, voice: { pitch, formant, pan }, loyalty }]
// host: { ship, dz, audio, say(who, text, s), callout(text, side, big), emit(name, data), pipMk2() }

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Formation slots in the ship's frame: x right, y up, z forward (metres). Ahead of you, so you
// can see them through the canopy.
const SLOTS = [[-12, 5, 30], [12, 5, 30], [-24, 7, 48], [24, 7, 48]];

const LINES = {
  form: ['Forming up on your wing.', 'On your wing, boss.', 'Escort in position.', 'With you all the way.'],
  engage: ['Bandits. I am on them.', 'Engaging.', 'Weapons free.', 'Picking one off the pack.'],
  kill: ['Splash one.', 'Got him!', 'Scratch one raider.', 'That one is done.'],
  praise: ['Nice shooting.', 'Good kill, boss.', 'Ha! Clean.'],
  hurt: ['Taking hits!', 'I am hit!', 'They are on me!'],
  retreat: ['Hull is gone. Falling back to you.', 'Breaking off. I need a minute.', 'Pulling out, too hot.'],
  cover: ['Covering you. Get clear!', 'I have your six. Go!', 'Not on my watch.'],
  death: ['I cannot hold her!', 'Going down!', 'Losing it, losing it!'],
  rock: ['Watch the rocks!', 'Are you even looking?', 'That is coming out of our pay.', 'Easy! You will shake us loose.'],
  rockGrumble: ['Again?', 'I did not sign up to crash.', 'Fly or let PIP fly.'],
  back: ['Back on your wing.', 'Patched up. Rejoining.'],
  repaired: ['PIP has us patched.'],
};

function buildFighter(accentHex) {
  const root = new THREE.Group();
  const hull = new THREE.MeshStandardNodeMaterial({ color: 0x8b9097, roughness: 0.5, metalness: 0.65 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x2b2d31, roughness: 0.7, metalness: 0.4 });
  const accent = new THREE.MeshStandardNodeMaterial({ color: accentHex, roughness: 0.45, metalness: 0.3 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); root.add(m); return m; };
  // Built nose-first along -z, like the player's ship
  add(new THREE.CylinderGeometry(0.42, 0.85, 6, 8).rotateX(-Math.PI / 2), hull);
  add(new THREE.ConeGeometry(0.42, 1.8, 8).rotateX(-Math.PI / 2), hull, 0, 0, -3.9);
  add(new THREE.SphereGeometry(0.45, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 2.2), dark, 0, 0.35, -1.6);
  add(new THREE.BoxGeometry(6.4, 0.12, 1.9), hull, 0, -0.1, 0.9);
  add(new THREE.BoxGeometry(1.6, 0.14, 1.95), accent, -2.5, -0.06, 0.9);
  add(new THREE.BoxGeometry(1.6, 0.14, 1.95), accent, 2.5, -0.06, 0.9);
  add(new THREE.BoxGeometry(0.12, 1.5, 1.5), accent, 0, 0.75, 2.2);
  add(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 6).rotateX(-Math.PI / 2), dark, -3.2, -0.1, -0.3);
  add(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 6).rotateX(-Math.PI / 2), dark, 3.2, -0.1, -0.3);
  const flameMat = glowMaterial(0xffa868, 3);
  const flames = [-0.55, 0.55].map((x) => add(new THREE.SphereGeometry(0.34, 10, 8), flameMat, x, 0, 3.15));
  const muzzles = [new V3(-3.2, -0.1, -1.5), new V3(3.2, -0.1, -1.5)];
  return { root, flames, muzzles, mats: [hull, dark, accent, flameMat] };
}

export function createWing(config, host) {
  const { ship } = host;
  const group = new THREE.Group();
  const voice = createWingVoice(host.audio);
  const tmp = new V3(), tmp2 = new V3(), want = new V3(), aim = new V3(), dir = new V3();
  const accel = new V3();
  const qLook = new THREE.Quaternion(), qBank = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  const Z_AXIS = new V3(0, 0, 1), ORIGIN = new V3();
  const pan = (p) => clamp(tmp2.subVectors(p, ship.pos).normalize().dot(ship.right), -1, 1) * 0.8;
  const gain = (p) => clamp(1.1 - p.distanceTo(ship.pos) / 350, 0.08, 1);

  // Tracers: short-lived line segments for every wing shot
  const TRACERS = 24;
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACERS * 6), 3));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRACERS * 6), 3));
  const tracerLines = new THREE.LineSegments(tracerGeo, new THREE.LineBasicNodeMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  tracerLines.frustumCulled = false;
  group.add(tracerLines);
  const tracers = Array.from({ length: TRACERS }, () => ({ life: 0, a: new V3(), b: new V3(), c: new THREE.Color() }));
  let tracerI = 0;

  let wing = [], chatter = 0, lost = [], kills = 0, flightT = 0, spokeForm = false, rockGrumbles = 0, firing = false;

  function say(m, key, force = false) {
    if (!m || (!force && chatter > 0)) return;
    const text = pick(LINES[key]);
    chatter = force ? 2.5 : 4 + Math.random() * 2;
    host.say(m.name.split(' ')[0], text, 3.5);
    voice.talk(m.voice, text);
  }
  const anyone = (filter = () => true) => pick(wing.filter((w) => w.state !== 'dead' && filter(w)));

  function clearFighters() {
    voice.reset();
    for (const w of wing) {
      group.remove(w.model.root);
      w.model.root.traverse((o) => o.geometry?.dispose());
      w.model.mats.forEach((m) => m.dispose());
    }
    wing = [];
  }

  function reset(trip) {
    clearFighters();
    wing = []; lost = []; kills = 0; flightT = 0; spokeForm = false; chatter = 2; rockGrumbles = 0;
    for (const t of tracers) t.life = 0;
    drawTracers();
    (trip?.wing ?? []).slice(0, SLOTS.length).forEach((m, i) => {
      const model = buildFighter(new THREE.Color(m.color));
      group.add(model.root);
      const slot = new V3(...SLOTS[i]);
      const w = {
        ...m, model, slot, hull: 100, state: 'form', target: null, retarget: 0, cool: 1 + Math.random(), orbit: Math.random() * 6.28,
        pos: model.root.position, prev: new V3(), vel: new V3(), quat: model.root.quaternion, hurtSaid: 0, bob: Math.random() * 6.28,
        loyal: m.loyalty >= 80, sulky: m.loyalty < 30,
      };
      model.root.visible = false;                       // they join you once you are clear of the pad
      wing.push(w);
    });
  }

  function slotWorld(w, out) {
    return out.copy(ship.pos).addScaledVector(ship.right, w.slot.x).addScaledVector(ship.up, w.slot.y + Math.sin(w.bob) * 0.6).addScaledVector(ship.fwd, w.slot.z);
  }

  const fighting = () => { const p = host.dz.phase; return host.dz.rulesOff && (p === 'fight' || p === 'warning' || p === 'breather'); };

  function nearestRaider(from) {
    let best = null, bd = 420;
    for (const r of host.dz.raiders.all) {
      if (!r.alive || r.dying > 0) continue;
      const d = r.pos.distanceTo(from);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  function tracer(a, b, hex) {
    const t = tracers[tracerI++ % TRACERS];
    t.a.copy(a); t.b.copy(b); t.c.set(hex); t.life = 0.12;
  }

  function targetPoint(r, out) {
    if (r.type !== 'boss') return out.copy(r.pos);
    // Carrion's centre is armour: escorts must strip its pods, then shoot the exposed core.
    const part = r.pods[0] > 0 ? 'podL' : r.pods[1] > 0 ? 'podR' : 'core';
    const sphere = r.model.spheres.find((s) => s.part === part);
    r.root.updateMatrixWorld(true);
    return r.root.localToWorld(out.copy(sphere.c));
  }

  function shoot(w) {
    const r = w.target;
    w.model.root.updateMatrixWorld(true);
    const from = w.model.root.localToWorld(tmp.copy(w.model.muzzles[(w.shot = (w.shot ?? 0) + 1) % 2]));
    const hitChance = 0.5 + (w.loyal ? 0.15 : 0) - (w.sulky ? 0.15 : 0);
    targetPoint(r, aim);
    if (Math.random() > hitChance) aim.add(tmp2.randomDirection().multiplyScalar(r.T.radius * 2.5 + 3));
    dir.subVectors(aim, from);
    const len = dir.length();
    dir.divideScalar(len);
    const end = tmp2.copy(from).addScaledVector(dir, len + 15);
    const blocked = host.dz.wrecks.blocked?.(from, aim);
    const h = blocked ? null : host.dz.raiders.raycast(from, end);
    tracer(from, h ? h.point : end, w.color);
    voice.pew(pan(from), gain(from));
    if (h) {
      firing = true;
      const res = host.dz.raiders.damage(h, config.blasters.damage * 0.65 * (w.loyal ? 1.25 : 1), dir);
      firing = false;
      if (res?.killed) { kills++; say(w, 'kill'); }
    }
  }


  function hurt(w, n) {
    if (w.state === 'dead') return;
    w.hull -= n;
    if (w.hull <= 0) return down(w);
    if (w.hurtSaid <= 0 && n > 3) { w.hurtSaid = 6; say(w, 'hurt'); }
  }

  function down(w) {
    w.state = 'dead';
    w.hull = 0;
    host.dz.fx?.explode(w.pos.clone(), w.vel.clone(), 'medium', new THREE.Color(w.color).getHex());
    voice.boom(pan(w.pos), gain(w.pos));
    say(w, 'death', true);
    host.callout(`${w.name} is down`, Math.sign(tmp.subVectors(w.pos, ship.pos).dot(ship.right)) || 1, true);
    w.model.root.visible = false;
    lost.push(w.id);
    for (const other of wing) {
      if (other.state === 'dead') continue;
      other.loyalty = Math.max(0, other.loyalty - 6);
      other.loyal = other.loyalty >= 80;
      other.sulky = other.loyalty < 30;
    }
    host.emit('wingLost', { id: w.id, name: w.name });
  }

  function update(realDt, dt, flying) {
    chatter -= realDt;
    for (const t of tracers) t.life -= realDt;
    drawTracers();
    if (!wing.length) return;
    flightT += dt;
    const fight = flying && fighting();
    const raidersUp = fight && host.dz.raiders.all.some((r) => r.alive);
    const playerLow = (host.hull?.() ?? 1) < 0.3;
    const quiet = !fight || host.dz.phase === 'breather';
    if (flying && !spokeForm && flightT > 3) { spokeForm = true; say(anyone(), 'form'); }

    for (const w of wing) {
      if (w.state === 'dead') continue;
      w.model.root.visible = flying;
      if (!flying) { w.shown = false; continue; }
      if (!w.shown) {                                   // launch a moment behind you and catch up
        w.shown = true;
        slotWorld(w, w.pos).addScaledVector(ship.fwd, -70);
        w.vel.copy(ship.fwd).multiplyScalar(ship.speed);
        w.quat.copy(ship.quat);
      }
      w.bob += dt * 0.9;
      w.hurtSaid -= dt;
      // Repairs: PIP Mk II patches the wing while it is quiet; a breather patches everyone a little
      if ((quiet || w.state === 'retreat') && w.hull < 100) w.hull = Math.min(100, w.hull + dt * ((host.pipMk2?.() ? 4 : 0) + (host.dz.phase === 'breather' ? 3 : 0.4)));
      if (w.state === 'retreat' && w.hull > 70) { w.state = 'form'; say(w, 'back'); }

      // Decide
      if (raidersUp && (w.state !== 'retreat' || (w.loyal && playerLow))) {
        if (w.hull < 35 && !(w.loyal && playerLow)) { w.state = 'retreat'; w.target = null; say(w, 'retreat'); }
        else {
          if ((w.retarget -= dt) <= 0 || !w.target?.alive) {
            const was = w.state;
            w.target = nearestRaider(w.pos) ?? nearestRaider(ship.pos);
            w.retarget = 1.6 + Math.random();
            w.state = w.target ? 'engage' : 'form';
            if (w.state === 'engage' && was !== 'engage') say(w, w.loyal && playerLow ? 'cover' : 'engage');
          }
        }
      } else if (w.state === 'engage') { w.state = 'form'; w.target = null; }

      // Move: a damped chase toward the slot, or an orbit round the target
      if (w.state === 'engage' && w.target) {
        w.orbit += dt * 0.7;
        tmp.set(Math.cos(w.orbit), Math.sin(w.orbit * 0.8) * 0.5, Math.sin(w.orbit)).multiplyScalar(48);
        want.copy(w.target.pos).add(tmp);
      } else slotWorld(w, want);
      // Predict nearby rock crossings, then keep a fighter-sized clearance even on a slow frame.
      host.rocks?.avoid(w.pos, w.vel, config.wing.clearance, config.wing.lookAhead, tmp);
      if (host.rocks) want.add(tmp);
      w.prev.copy(w.pos);
      const k = w.state === 'engage' ? 2.2 : 3.2;
      tmp.subVectors(want, w.pos);
      accel.copy(tmp).multiplyScalar(k * k).addScaledVector(w.vel, -2 * k);
      // Match the moving slot's velocity: damping against zero left the wing behind the canopy.
      if (w.state !== 'engage') accel.addScaledVector(ship.vel, 2 * k);
      w.vel.addScaledVector(accel, dt);
      const maxV = Math.max(90, ship.speed * 1.6);
      if (w.vel.length() > maxV) w.vel.setLength(maxV);
      w.pos.addScaledVector(w.vel, dt);
      host.rocks?.keepClear(w.pos, config.wing.clearance);

      // Face: along the velocity when fighting, otherwise the ship's heading, banked into turns
      if (w.state === 'engage' && w.target) dir.subVectors(targetPoint(w.target, aim), w.pos).normalize();
      else dir.copy(ship.fwd).lerp(tmp.copy(w.vel).normalize(), clamp(w.vel.length() / 200, 0, 0.4)).normalize();
      m4.lookAt(ORIGIN, dir, ship.up);
      qLook.setFromRotationMatrix(m4);
      const lateral = clamp(accel.dot(ship.right) / 40, -1, 1);
      qBank.setFromAxisAngle(Z_AXIS, -lateral * 0.7);
      qLook.multiply(qBank);
      w.quat.slerp(qLook, 1 - Math.exp(-6 * dt));
      const thrust = 0.8 + clamp(w.vel.length() / 120, 0, 1) * 0.9 + Math.random() * 0.15;
      w.model.flames.forEach((f) => f.scale.setScalar(thrust));

      // Fire
      if (w.state === 'engage' && w.target && (w.cool -= dt) <= 0) {
        const facing = tmp.subVectors(targetPoint(w.target, aim), w.pos).normalize().dot(tmp2.set(0, 0, -1).applyQuaternion(w.quat));
        if (facing > 0.8 && w.pos.distanceTo(w.target.pos) < 260) shoot(w);
        w.cool = (0.5 + Math.random() * 0.45) * (w.sulky ? 1.8 : 1);
      }

      // Raider fire: they take shots meant for you, and the raiders shoot at them while they fight
      if (fight) {
        const list = host.dz.fire.list;
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          if (p.kind === 'claw' || !p.pos) continue;
          // Sweep both moving bodies: fast lances can cross an escort between frames.
          tmp.subVectors(p.prev ?? p.pos, w.prev);
          tmp2.subVectors(p.pos, w.pos);
          dir.subVectors(tmp2, tmp);
          const t = clamp(-tmp.dot(dir) / Math.max(1e-9, dir.lengthSq()), 0, 1);
          if (tmp.addScaledVector(dir, t).length() < 3.2 + (p.r ?? 0.35)) {
            hurt(w, p.kind === 'orb' ? 22 : p.kind === 'lance' ? 12 : 6);
            host.dz.fx?.spark(p.pos, tmp.copy(p.vel).normalize().negate(), 8, 0xffb060, 26);
            host.dz.fire.free(p);
            if (w.state === 'dead') break;
          }
        }
        if (w.state === 'engage' && Math.random() < dt * (playerLow && w.loyal ? config.wing.coverAttrition : config.wing.attrition) * (host.dz.aggression ?? 1)) hurt(w, 3 + Math.random() * 2);
      }
    }
  }

  function drawTracers() {
    const pos = tracerGeo.attributes.position.array, col = tracerGeo.attributes.color.array;
    tracers.forEach((t, i) => {
      const k = Math.max(0, t.life / 0.12);
      t.a.toArray(pos, i * 6); t.b.toArray(pos, i * 6 + 3);
      for (const o of [0, 3]) { col[i * 6 + o] = t.c.r * k * 2; col[i * 6 + o + 1] = t.c.g * k * 2; col[i * 6 + o + 2] = t.c.b * k * 2; }
    });
    tracerGeo.attributes.position.needsUpdate = true;
    tracerGeo.attributes.color.needsUpdate = true;
  }

  // The pilot's mistakes and wins, as the wing sees them
  function onPlayerHit() {
    const w = anyone();
    if (!w) return;
    rockGrumbles++;
    if (rockGrumbles >= 3 && (w.sulky || Math.random() < 0.5)) say(w, rockGrumbles > 5 ? 'rockGrumble' : 'rock');
  }
  function onPlayerKill() { if (!firing && Math.random() < 0.35) say(anyone(), 'praise'); }
  function onRepaired() { if (wing.some((w) => w.state !== 'dead' && w.hull < 60)) say(anyone(), 'repaired'); }

  return {
    group, reset, update,
    dispose() { clearFighters(); tracerGeo.dispose(); tracerLines.material.dispose(); },
    get members() { return wing; }, onPlayerHit, onPlayerKill, onRepaired,
    get lost() { return lost; }, get kills() { return kills; }, get firing() { return firing; },
    get flying() { return wing.filter((w) => w.state !== 'dead').length; },
  };
}
