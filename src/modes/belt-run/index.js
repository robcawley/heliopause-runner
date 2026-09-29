import * as THREE from 'three/webgpu';
import { createEmitter } from '../../engine/events.js';
import { createInput } from '../../engine/input.js';
import { createPost } from '../../engine/post.js';
import { makeConfig } from './config.js';
import { createShip } from './ship.js';
import { createCameraRig } from './cameraRig.js';
import { createCockpit } from './cockpit.js';
import { createSky } from './sky.js';
import { createDust } from './dust.js';
import { createRocks } from './rocks.js';
import { createShards } from './shards.js';
import { createLane } from './lane.js';
import { createSfx } from './sfx.js';
import { createHud } from './hud.js';
import musicUrl from './assets/audio/sidewinding.mp3';

// ---------------------------------------------------------------------------
// Belt Run: a self-contained game mode. The cockpit, the belt, the beacon
// lane. A host game creates it, drives it once per frame, listens to its
// events, and disposes of it when the player moves on.
//
//   const run = createBeltRun({ engine, audio, hudParent, overrides });
//   run.on('death', (stats) => ...);          // also: 'gate', 'nearMiss', 'hit', 'request'
//   run.attract();                             // autopilot, for behind a menu
//   run.start();                               // a fresh flight
//   loop: run.frame(realDt, nowSeconds);       // simulates and renders
//   run.pause(true / false);
//   run.dispose();
//
// 'request' events carry host-level asks from the pilot's controls:
// 'pause', 'mute', 'tuning'. The mode never touches the host's UI.
// ---------------------------------------------------------------------------

const MICA = {
  start: ['Beacon bearing locked. Hold this line, or don\'t. I will keep the light on.'],
  idle: [
    'Belt density rising. Fly close, it keeps our wake small.',
    'The ice sings when you pass that near. I like it.',
    'Forty years, and the signal has not drifted once.',
    'Phase drive recharged. It will carry us through anything, briefly.',
    'Roll hard when the ice closes in. The frame can take it.',
    'Something is growing out there. Not rocks.',
  ],
  leftLane: ['Off the lane. Shielding will hold a while. Not forever.', 'Out in the open again. I have the arrows up when you want them.'],
  radHigh: ['Hull is starting to cook. Head for the lane.', 'Shielding is failing. Lane, now.'],
  back: ['Back on the line. Good.', 'Shielded. Breathe.'],
  gate: ['Repair beacon. Fly through them when you can.', 'Patched. Keep them coming.'],
  hullLow: ['Hull critical. Find a repair beacon in the lane.'],
  wrongWay: ['The beacon is the other way. Scenic, though.'],
  restart: ['New flight plotted. The lane is where we left it.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = THREE.MathUtils.clamp;

export function createBeltRun({ engine, audio, hudParent = document.body, overrides } = {}) {
  const config = makeConfig(overrides);
  const events = createEmitter();
  const { renderer } = engine;

  // ---- Scene ----------------------------------------------------------
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050a16, config.world.fogNear, config.world.fogFar);
  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.03, 1500);
  const untrack = engine.trackCamera(camera);

  const sunDir = new THREE.Vector3(0.55, 0.38, -0.74).normalize();
  const sun = new THREE.DirectionalLight(0xffe2b8, 3.2);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x324a70, 0x07090f, 0.55));

  const input = createInput(engine.canvas, config.input);
  const ship = createShip(config);
  scene.add(ship.group);
  const rig = createCameraRig(camera, ship, config);
  const cockpit = createCockpit();
  ship.group.add(cockpit.group);

  const sky = createSky(sunDir);
  const dust = createDust(config);
  const rocks = createRocks(config);
  const shards = createShards();
  const lane = createLane(config);
  scene.add(sky.mesh, dust.mesh, rocks.mesh, shards.mesh, lane.group);

  // Keep the lane's sunward side lit: the light follows the ship
  const sunFollow = () => { sun.position.copy(ship.pos).addScaledVector(sunDir, 100); sun.target.position.copy(ship.pos); };

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.7, 64),
    new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.5, 1.4, 1.3), transparent: true, opacity: 0.55, depthTest: false, fog: false }),
  );
  reticle.position.set(0, 0, -40);
  reticle.renderOrder = 20;
  ship.group.add(reticle);

  const post = createPost(renderer, scene, camera, config.fx);
  const sfx = createSfx(audio, config);
  const hud = createHud(hudParent);

  // ---- State ----------------------------------------------------------
  const fresh = (mode) => ({
    mode,                     // 'attract' | 'flying' | 'dead'
    paused: false,
    score: 0, chain: 0, chainTimer: 0,
    nearMisses: 0, hits: 0, bestChain: 0, gates: 0, rolls: 0,
    hull: config.hull.max, exposure: 0, deathCause: '', flightTime: 0,
    wasOutside: false, alarmTimer: 0, micaCooldown: 0, micaTimer: 18, micaIdle: 0, wrongWayTime: 0,
    radFx: 0,
    phaseTime: 0, phaseCooldown: 0,
    hitStop: 0, slowmo: 0, slowmoScale: 1, timeScale: 1,
    aberrationKick: 0, hitFlash: 0, phaseFx: 0,
  });
  let g = fresh('attract');

  const say = (key, force = false) => {
    if (g.mode !== 'flying' || (!force && g.micaCooldown > 0)) return;
    hud.say('MICA', pick(MICA[key]), 5);
    g.micaCooldown = 6;
    g.micaTimer = Math.max(g.micaTimer, 18);
  };

  const stats = () => ({
    score: g.score, distance: ship.distance, laneProgress: ship.laneProgress, time: g.flightTime,
    nearMisses: g.nearMisses, bestChain: g.bestChain, gates: g.gates, hits: g.hits, rolls: g.rolls,
    cause: g.deathCause, laneOffset: Math.max(0, Math.hypot(ship.pos.x, ship.pos.y) - config.lane.safeRadius),
  });

  function damage(amount, cause) {
    const before = g.hull;
    g.hull = Math.max(0, g.hull - amount);
    if (before >= 30 && g.hull < 30 && g.hull > 0) say('hullLow', true);
    if (g.hull <= 0 && g.mode === 'flying') die(cause);
  }

  function die(cause) {
    g.mode = 'dead';
    g.deathCause = cause;
    rig.addTrauma(1);
    g.hitFlash = 1.4;
    g.hitStop = 0.15;
    sfx.death();
    shards.burst(ship.pos.clone().addScaledVector(ship.fwd, 3), ship.vel.clone().multiplyScalar(0.3), 3, 60);
    hud.setWarning('');
    events.emit('death', stats());
  }

  // ---- Feel rules -----------------------------------------------------
  rocks.handlers.onApproach = (r, miss, pan) => {
    if (g.mode !== 'flying') return;
    sfx.whoosh(pan, clamp(1 - miss / (config.nearMiss.radius * 1.6), 0, 1), config.nearMiss.whooshLead);
  };

  rocks.handlers.onHit = (r) => {
    if (g.mode !== 'flying') return 'destroy';      // behind a menu or after death: rocks just vanish
    if (g.phaseTime > 0) {
      if (!r.phased) {
        r.phased = true;
        g.score += 300;
        hud.callout('Phased through +300', 1, true);
        rig.addTrauma(0.25);
        g.aberrationKick += 1.2;
        sfx.tick(6);
      }
      return;
    }
    g.hits++;
    g.chain = 0; g.chainTimer = 0;
    rig.addTrauma(0.9);
    rig.punch(-6);
    g.hitFlash = 1;
    g.aberrationKick += 1.6;
    g.hitStop = 0.09;
    sfx.hit();
    const toRock = r.pos.clone().sub(ship.pos).normalize();
    shards.burst(ship.pos.clone().addScaledVector(toRock, 3), r.vel, r.size);
    hud.callout('Hull hit', 1);
    damage(config.hull.rockDamageBase + r.size * config.hull.rockDamagePerSize, 'rock');
    events.emit('hit', { hull: g.hull });
    return 'destroy';
  };

  rocks.handlers.onNearMiss = (r, clearance, side) => {
    if (g.mode !== 'flying') return;
    const nm = config.nearMiss;
    const intensity = 1 - clearance / nm.radius;
    g.chain = g.chainTimer > 0 ? g.chain + 1 : 1;
    g.chainTimer = nm.chainWindow;
    g.nearMisses++;
    g.bestChain = Math.max(g.bestChain, g.chain);
    const pts = nm.score * g.chain;
    g.score += pts;

    rig.addTrauma(0.12 + intensity * 0.28);
    rig.punch(1.5 + intensity * 3);
    g.aberrationKick += 0.35 + intensity * 0.9;
    g.hitStop = Math.max(g.hitStop, nm.hitStop * intensity);
    g.slowmo = Math.max(g.slowmo, nm.slowmo * intensity);
    g.slowmoScale = nm.slowmoScale;
    sfx.tick(g.chain);
    hud.callout(`Near miss +${pts}`, side, intensity > 0.75);

    if (g.chain % nm.daredevilChain === 0) {
      g.score += nm.daredevilBonus;
      g.slowmo = Math.max(g.slowmo, nm.daredevilSlowmo);
      g.slowmoScale = nm.slowmoScale * 0.7;
      rig.punch(6);
      sfx.daredevil();
      cockpit.flashChain();
      hud.callout(`Daredevil +${nm.daredevilBonus}`, -side, true);
    }
    events.emit('nearMiss', { chain: g.chain, score: g.score });
  };

  lane.handlers.onGate = (i) => {
    if (g.mode !== 'flying') return;
    const before = g.hull;
    g.hull = Math.min(config.hull.max, g.hull + config.lane.gateRepair);
    g.gates++;
    g.score += 150;
    sfx.repair();
    rig.punch(3);
    hud.callout(`Repaired +${Math.round(g.hull - before)}`, 1, true);
    if (g.gates === 1 || Math.random() < 0.3) say('gate');
    events.emit('gate', { index: i, hull: g.hull });
  };

  function tryPhase() {
    if (g.phaseCooldown > 0 || g.mode !== 'flying') return;
    g.phaseTime = config.phase.duration;
    g.phaseCooldown = config.phase.cooldown + config.phase.duration;
    rig.punch(config.phase.fovKick);
    g.aberrationKick += 0.8;
    sfx.phase(config.phase.duration);
  }

  function tryRoll(dir) {
    if (g.mode !== 'flying' || !ship.tryRoll(dir)) return;
    g.rolls++;
    sfx.roll(dir, config.roll.duration);
    rig.addTrauma(0.12);
    g.aberrationKick += 0.25;
  }

  const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
  tap(hud.buttons.phase, tryPhase);
  tap(hud.buttons.rollLeft, () => tryRoll(-1));
  tap(hud.buttons.rollRight, () => tryRoll(1));

  // ---- Lifecycle ------------------------------------------------------
  function resetWorld(mode) {
    g = fresh(mode);
    ship.reset();
    rig.reset();
    shards.clear();
    rocks.init(ship);
    lane.reset();
  }

  const attractStick = { stickX: 0, stickY: 0, boost: false, brake: false };
  const deadStick = { stickX: 0.08, stickY: -0.1, boost: false, brake: true };
  const guideV = new THREE.Vector3();
  const laneFwd = new THREE.Vector3(0, 0, -1);

  function frame(realDt, now) {
    input.update(realDt);
    for (const a of ['pause', 'mute', 'tuning']) if (input.consume(a)) events.emit('request', a);
    if (g.paused) { post.render(); return; }
    if (input.consume('phase')) tryPhase();
    if (input.consume('rollLeft')) tryRoll(-1);
    if (input.consume('rollRight')) tryRoll(1);

    // Time: hit-stop freezes the world, slow-mo eases back
    if (g.hitStop > 0) { g.hitStop -= realDt; g.timeScale = 0.02; }
    else if (g.slowmo > 0) { g.slowmo -= realDt; g.timeScale = g.slowmoScale; }
    else g.timeScale += (1 - g.timeScale) * (1 - Math.exp(-8 * realDt));
    const dt = realDt * g.timeScale;

    let steer = input.state;
    if (g.mode === 'attract') {
      // Autopilot: a lazy weave that drifts back to the lane's centre
      attractStick.stickX = Math.sin(now * 0.31) * 0.35 + clamp(-ship.pos.x * 0.02 + ship.yaw * 0.8, -0.5, 0.5);
      attractStick.stickY = Math.sin(now * 0.47) * 0.25 - clamp(ship.pos.y * 0.02 + ship.pitch * 0.8, -0.5, 0.5);
      steer = attractStick;
    } else if (g.mode === 'dead') steer = deadStick;

    ship.update(realDt, dt, steer);
    rocks.update(realDt, dt, ship);
    shards.update(dt);
    lane.update(ship, now);
    sunFollow();
    if (g.mode === 'flying') g.flightTime += dt;

    // ---- The beacon lane: radiation outside, repair near the centre ----
    const L = config.lane, R = config.radiation;
    const laneDist = Math.hypot(ship.pos.x, ship.pos.y);
    const outside = laneDist - L.safeRadius;
    g.micaCooldown = Math.max(0, g.micaCooldown - realDt);
    if (g.mode === 'flying') {
      if (outside > 0) {
        const before = g.exposure;
        g.exposure = Math.min(100, g.exposure + R.riseRate * (0.3 + outside / 30) * dt);
        if (!g.wasOutside) { say('leftLane'); g.alarmTimer = 0; }
        if (before < R.damageFrom && g.exposure >= R.damageFrom) say('radHigh', true);
      } else {
        g.exposure = Math.max(0, g.exposure - R.fallRate * dt);
        if (g.wasOutside && g.exposure > 25) say('back');
        if (laneDist < L.coreRadius && g.exposure === 0) g.hull = Math.min(config.hull.max, g.hull + L.coreRepair * dt);
      }
      g.wasOutside = outside > 0;
      if (g.exposure > R.damageFrom) damage(R.hullDamage * ((g.exposure - R.damageFrom) / (100 - R.damageFrom)) * dt, 'radiation');

      // Alarms: a slow chirp while exposure is harmless, faster once it bites
      g.alarmTimer -= realDt;
      const hurting = g.exposure > R.damageFrom;
      if (g.alarmTimer <= 0 && ((outside > 0 && g.exposure > R.damageFrom * 0.5) || g.hull < 25)) {
        sfx.alarm(hurting || g.hull < 25);
        g.alarmTimer = hurting ? THREE.MathUtils.lerp(0.9, 0.3, (g.exposure - R.damageFrom) / (100 - R.damageFrom)) : 2.2;
      }
      sfx.geiger(outside > 0 ? Math.min(1, 0.08 + g.exposure / 110) : (g.exposure / 100) * 0.3, realDt);

      if (hurting) hud.setWarning('Radiation burning the hull. Return to the lane', 2);
      else if (outside > 0 && g.exposure > R.damageFrom * 0.5) hud.setWarning('Radiation rising', 1);
      else if (g.hull < 25) hud.setWarning('Hull critical', 2);
      else hud.setWarning('');

      // Heading away from the beacon for a while gets a dry word from MICA
      const along = ship.vel.dot(laneFwd) / Math.max(1, ship.vel.length());
      g.wrongWayTime = along < -0.5 ? g.wrongWayTime + realDt : 0;
      if (g.wrongWayTime > 5) { say('wrongWay'); g.wrongWayTime = -20; }
    }
    g.radFx += ((outside > 0 ? 0.15 : 0) + (g.exposure / 100) * 0.85 - g.radFx) * (1 - Math.exp(-3 * realDt));
    dust.setRadiation(Math.min(1, g.radFx));

    // Phase drive
    g.phaseTime = Math.max(0, g.phaseTime - realDt);
    g.phaseCooldown = Math.max(0, g.phaseCooldown - realDt);
    const phasing = g.phaseTime > 0;
    g.phaseFx += ((phasing ? 1 : 0) - g.phaseFx) * (1 - Math.exp(-(phasing ? 30 : 6) * realDt));
    cockpit.setPhase(1 - g.phaseCooldown / (config.phase.cooldown + config.phase.duration), phasing);

    if (g.chainTimer > 0 && (g.chainTimer -= realDt) <= 0) g.chain = 0;
    cockpit.setChain(Math.min(3, g.chain % config.nearMiss.daredevilChain || (g.chain ? 3 : 0)));

    rig.update(realDt, g.phaseFx * config.phase.fovKick * 0.5);
    sky.update(ship);
    dust.update(ship);
    reticle.material.opacity = g.mode === 'flying' ? 0.55 * (1 - g.phaseFx * 0.7) : 0;

    g.aberrationKick *= Math.exp(-5 * realDt);
    g.hitFlash *= Math.exp(-4 * realDt);
    post.sync();
    post.uniforms.aberration.value = config.fx.aberration + g.aberrationKick + g.phaseFx * 0.6;
    post.uniforms.phase.value = g.phaseFx;
    post.uniforms.hit.value = g.hitFlash;
    post.uniforms.radiation.value = Math.min(1, g.radFx);
    renderer.toneMappingExposure = config.fx.exposure;

    if (g.mode === 'flying') sfx.update(ship.speed, ship.yawRate / config.flight.yawRate);
    else sfx.silence();
    audio.update();

    // MICA, occasionally, when nothing else is going on
    if (g.mode === 'flying' && outside <= 0 && (g.micaTimer -= realDt) <= 0) {
      hud.say('MICA', MICA.idle[g.micaIdle++ % MICA.idle.length], 5);
      g.micaTimer = 24 + Math.random() * 14;
    }

    // ---- HUD ----
    ship.group.updateMatrixWorld(true);
    const showGuide = g.mode === 'flying' && laneDist > L.warnRadius;
    if (showGuide) {
      guideV.set(0, 0, ship.pos.z - 150).project(camera);
      const behind = guideV.z > 1;
      let nx = behind ? -guideV.x : guideV.x, ny = behind ? -guideV.y : guideV.y;
      const w = innerWidth, h = innerHeight;
      const onScreen = !behind && Math.abs(nx) < 0.82 && Math.abs(ny) < 0.78;
      if (!onScreen) {
        if (behind && Math.hypot(nx, ny) < 0.05) ny = -1;       // dead astern: point down, "come about"
        const a = Math.atan2(ny * h, nx * w);
        nx = Math.cos(a) * 0.8; ny = Math.sin(a) * 0.72;
      }
      const px = (nx + 1) * 0.5 * w, py = (1 - ny) * 0.5 * h;
      hud.setGuide({
        show: true, x: px, y: py, onScreen,
        angle: Math.atan2(py - h / 2, px - w / 2),
        danger: g.exposure > R.damageFrom * 0.5,
        label: outside > 0 ? `${Math.ceil(outside)} m to the lane` : 'Lane edge',
      });
    } else hud.setGuide({ show: false });

    hud.setHull(g.hull / config.hull.max);
    hud.setRadiation(g.exposure / 100);
    hud.setRolls(ship.rollCharges, config.roll.charges);
    hud.setStick(g.mode === 'flying' ? input.state.touchStick : null);
    hud.setScore(g.score);
    hud.update(realDt);

    post.render();
  }

  return {
    config,
    scene, camera, ship,
    on: events.on,
    get state() { return g; },
    stats,
    get backend() { return engine.backend; },

    attract() { resetWorld('attract'); hud.setVisible(false); },
    start() {
      resetWorld('flying');
      hud.setVisible(true);
      audio.playMusic(musicUrl);
      sfx.start();
      sfx.revive();
      hud.say('MICA', pick(MICA.start), 5);
      engine.canvas.focus?.();
    },
    restart() {
      resetWorld('flying');
      sfx.revive();
      hud.say('MICA', pick(MICA.restart), 4);
    },
    pause(p) {
      if (g.mode === 'dead') return;
      g.paused = p;
      p ? audio.suspend() : audio.resume();
    },
    frame,
    hud,
    dispose() {
      input.dispose();
      hud.dispose();
      untrack();
      events.clear();
      rocks.dispose();
      post.dispose();
      scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose?.(); } });
    },
  };
}
