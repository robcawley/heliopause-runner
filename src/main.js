import * as THREE from 'three/webgpu';
import './styles.css';
import { CONFIG } from './config.js';
import { createRenderer } from './core/renderer.js';
import { createInput } from './core/input.js';
import { createShip } from './flight/ship.js';
import { createCameraRig } from './flight/cameraRig.js';
import { createSky } from './world/sky.js';
import { createDust } from './world/dust.js';
import { createRocks } from './world/rocks.js';
import { createShards } from './world/shards.js';
import { createLane } from './world/lane.js';
import { createCockpit } from './cockpit/cockpit.js';
import { createPost } from './fx/post.js';
import { createAudio } from './audio/audio.js';
import { createHud } from './ui/hud.js';
import { createTuning } from './ui/tuning.js';

// Stage 0: the feel prototype. No enemies, no weapons. The cockpit, the belt,
// free flight with rolls, and the beacon lane: shelter and repair inside it,
// radiation outside. The question: is flying through it fun on its own?

const MICA = {
  leftLane: ['You are off the lane. Radiation is climbing. Come back to the beacon line.', 'Out of the shield again. Arrows will bring you home.'],
  radHigh: ['Shielding is failing. Turn back now.', 'Hull is cooking. Lane, now.'],
  back: ['Back on the line. Good.', 'Shielded. Breathe.'],
  gate: ['Repair beacon. Fly through them when you can.', 'Patched. Keep them coming.'],
  hullLow: ['Hull critical. Stay in the lane and find a repair beacon.'],
};

const MICA_LINES = [
  'Beacon bearing locked. Hold this line.',
  'Belt density rising. Fly close, it keeps our wake small.',
  'The ice sings when you pass that near. I like it.',
  'Forty years, and the signal has not drifted once.',
  'Phase drive recharged. It will carry us through anything, briefly.',
  'Roll hard when the ice closes in. The frame can take it.',
  'Something is growing out there. Not rocks.',
];

async function boot() {
  const stage = document.getElementById('stage');
  let gfx;
  try {
    gfx = await createRenderer(stage);
  } catch (err) {
    document.getElementById('launch-note').textContent = 'This browser could not start WebGPU or WebGL2.';
    throw err;
  }
  const { renderer, scene, camera, sunDir, backend, resize } = gfx;

  const input = createInput(renderer.domElement);
  const ship = createShip();
  scene.add(ship.group);
  const rig = createCameraRig(camera, ship);
  const cockpit = createCockpit();
  ship.group.add(cockpit.group);

  const sky = createSky(sunDir);
  const dust = createDust();
  const rocks = createRocks();
  const shards = createShards();
  const lane = createLane();
  scene.add(sky.mesh, dust.mesh, rocks.mesh, shards.mesh, lane.group);
  rocks.init(ship);

  // Reticle: 40 units ahead, riding with the ship, drawn over everything
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.7, 64),
    new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.5, 1.4, 1.3), transparent: true, opacity: 0.55, depthTest: false, fog: false }),
  );
  reticle.position.set(0, 0, -40);
  reticle.renderOrder = 20;
  ship.group.add(reticle);

  const post = createPost(renderer, scene, camera);
  const audio = createAudio();
  const hud = createHud(document.getElementById('hud'));
  const tuning = createTuning({ onResize: resize });

  // Game state
  const fresh = () => ({
    mode: 'title',        // 'title' | 'flying' | 'paused' | 'dead'
    score: 0,
    chain: 0, chainTimer: 0,
    nearMisses: 0, hits: 0, bestChain: 0, gates: 0, startTravelled: ship.travelled,
    hull: CONFIG.hull.max, exposure: 0, deathCause: '', deathTimer: 0,
    wasOutside: false, alarmTimer: 0, micaCooldown: 0, radFx: 0,
    phaseTime: 0, phaseCooldown: 0,
    hitStop: 0, slowmo: 0, slowmoScale: 1, timeScale: 1,
    aberrationKick: 0, hitFlash: 0, phaseFx: 0,
    micaTimer: 16, micaIndex: 1,
  });
  const g = fresh();

  const clamp = THREE.MathUtils.clamp;

  const micaSay = (key, force = false) => {
    if (!force && g.micaCooldown > 0) return;
    const lines = MICA[key];
    hud.say('MICA', lines[Math.floor(Math.random() * lines.length)], 5);
    g.micaCooldown = 6;
    g.micaTimer = Math.max(g.micaTimer, 18);
  };

  function damage(amount, cause) {
    const before = g.hull;
    g.hull = Math.max(0, g.hull - amount);
    if (before >= 30 && g.hull < 30 && g.hull > 0) micaSay('hullLow', true);
    if (g.hull <= 0 && g.mode === 'flying') die(cause);
  }

  // ---- Feel rules -------------------------------------------------------

  rocks.handlers.onApproach = (r, clearance, side) => {
    if (g.mode !== 'flying') return;
    const intensity = clamp(1 - clearance / (CONFIG.nearMiss.radius * 1.6), 0, 1);
    audio.whoosh(side, intensity, CONFIG.nearMiss.whooshLead);
  };

  rocks.handlers.onPass = (r, clearance, side, dx, dy) => {
    if (g.mode !== 'flying') return;
    const nm = CONFIG.nearMiss;

    if (clearance < nm.hitRadius) {
      if (g.phaseTime > 0) {
        // Phased straight through a rock: the best thing you can do
        g.score += 300;
        hud.callout('Phased through +300', side, true);
        rig.addTrauma(0.25);
        g.aberrationKick += 1.2;
        audio.tick(6);
        return;
      }
      g.hits++;
      g.chain = 0; g.chainTimer = 0;
      rig.addTrauma(0.9);
      rig.punch(-6);
      g.hitFlash = 1;
      g.aberrationKick += 1.6;
      g.hitStop = 0.09;
      audio.hit();
      shards.burst(ship.x + dx * 0.4, ship.y + dy * 0.4, -3, r.size);
      hud.callout('Hull hit', side);
      damage(CONFIG.hull.rockDamageBase + r.size * CONFIG.hull.rockDamagePerSize, 'rock');
      return 'destroy';
    }

    if (clearance < nm.radius) {
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
      audio.tick(g.chain);
      hud.callout(`Near miss +${pts}`, side, intensity > 0.75);

      if (g.chain % nm.daredevilChain === 0) {
        g.score += nm.daredevilBonus;
        g.slowmo = Math.max(g.slowmo, nm.daredevilSlowmo);
        g.slowmoScale = nm.slowmoScale * 0.7;
        rig.punch(6);
        audio.daredevil();
        cockpit.flashChain();
        hud.callout(`Daredevil +${nm.daredevilBonus}`, -side, true);
      }
    }
  };

  function tryPhase() {
    if (g.phaseCooldown > 0 || g.mode !== 'flying') return;
    g.phaseTime = CONFIG.phase.duration;
    g.phaseCooldown = CONFIG.phase.cooldown + CONFIG.phase.duration;
    rig.punch(CONFIG.phase.fovKick);
    g.aberrationKick += 0.8;
    audio.phase(CONFIG.phase.duration);
  }

  function tryRoll(dir) {
    if (g.mode !== 'flying' || !ship.tryRoll(dir)) return;
    audio.roll(dir, CONFIG.roll.duration);
    rig.addTrauma(0.12);
    g.aberrationKick += 0.25;
  }

  lane.handlers.onGate = () => {
    if (g.mode !== 'flying') return;
    const before = g.hull;
    g.hull = Math.min(CONFIG.hull.max, g.hull + CONFIG.lane.gateRepair);
    g.gates++;
    g.score += 150;
    audio.repair();
    rig.punch(3);
    hud.callout(`Repaired +${Math.round(g.hull - before)}`, 1, true);
    if (g.gates === 1 || Math.random() < 0.3) micaSay('gate');
  };

  const debrief = document.getElementById('debrief');
  function die(cause) {
    g.mode = 'dead';
    g.deathCause = cause;
    g.deathTimer = 0;
    rig.addTrauma(1);
    g.hitFlash = 1.4;
    g.hitStop = 0.15;
    audio.death();
    shards.burst(ship.x, ship.y - 1, -3, 3, 60);
    hud.setWarning('');
    const km = ((ship.travelled - g.startTravelled) / 1000).toFixed(2);
    const off = Math.max(0, Math.hypot(ship.x, ship.y) - CONFIG.lane.safeRadius);
    debrief.querySelector('.debrief-reason').textContent = cause === 'radiation'
      ? `Radiation burned through the hull, ${Math.round(off)} metres outside the beacon lane.`
      : 'The belt broke through the hull.';
    debrief.querySelector('.debrief-stats').innerHTML = [
      ['Score', g.score.toLocaleString()], ['Distance', `${km} km`], ['Near misses', g.nearMisses],
      ['Best chain', g.bestChain], ['Repair beacons', g.gates], ['Rock hits', g.hits],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    setTimeout(() => { debrief.classList.add('on'); document.getElementById('again').focus(); }, 900);
  }

  function flyAgain() {
    Object.assign(g, fresh(), { mode: 'flying' });
    ship.reset();
    input.state.stickX = input.state.stickY = 0;
    rocks.init(ship);
    lane.reset(ship);
    audio.revive();
    debrief.classList.remove('on');
    hud.say('MICA', 'New flight plotted. Stay on the beacon line.', 4);
    renderer.domElement.focus();
  }
  document.getElementById('again').addEventListener('click', flyAgain);
  addEventListener('keydown', (e) => { if (g.mode === 'dead' && e.key === 'Enter' && debrief.classList.contains('on')) flyAgain(); });

  const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
  tap(hud.buttons.phase, tryPhase);
  tap(hud.buttons.rollLeft, () => tryRoll(-1));
  tap(hud.buttons.rollRight, () => tryRoll(1));

  // ---- Launch / pause ----------------------------------------------------

  const title = document.getElementById('title');
  const pauseEl = document.getElementById('pause');
  document.getElementById('backend').textContent = backend;

  async function launch() {
    await audio.start();
    title.classList.add('gone');
    g.mode = 'flying';
    hud.say('MICA', MICA_LINES[0], 5);
    lane.reset(ship);
    g.startTravelled = ship.travelled;
    renderer.domElement.focus();
  }
  document.getElementById('launch').addEventListener('click', launch);
  addEventListener('keydown', (e) => { if (g.mode === 'title' && e.key === 'Enter') launch(); });

  function setPaused(p) {
    if (g.mode === 'title' || g.mode === 'dead') return;
    g.mode = p ? 'paused' : 'flying';
    pauseEl.classList.toggle('on', p);
    p ? audio.suspend() : audio.resume();
  }
  pauseEl.addEventListener('click', () => setPaused(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden && g.mode === 'flying') setPaused(true); });

  // ---- Frame -------------------------------------------------------------

  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0, fps = 0;
  const guideV = new THREE.Vector3();

  // Title screen: the ship drifts on its own so the belt is alive behind the menu
  const attract = { stickX: 0, stickY: 0, boost: false };
  const dead = { stickX: 0, stickY: -0.15, boost: false };

  function frame(now) {
    const realDt = Math.min(0.05, (now - last) / 1000);
    last = now;

    input.update(realDt);
    if (input.consume('pausePressed')) setPaused(g.mode === 'flying');
    if (input.consume('mutePressed')) hud.say('System', audio.toggleMute() ? 'Audio muted' : 'Audio on', 1.5);
    if (input.consume('tuningPressed')) tuning.toggle();
    if (input.consume('phasePressed')) tryPhase();
    const rollDir = input.consume('rollPressed');
    if (rollDir) tryRoll(rollDir);

    if (g.mode === 'paused') { post.render(); return; }

    // Time: hit-stop freezes the world, slow-mo eases back to full speed
    if (g.hitStop > 0) { g.hitStop -= realDt; g.timeScale = 0.02; }
    else if (g.slowmo > 0) { g.slowmo -= realDt; g.timeScale = g.slowmoScale; }
    else g.timeScale += (1 - g.timeScale) * (1 - Math.exp(-8 * realDt));
    const dt = realDt * g.timeScale;

    // The pilot's body runs on real time so controls never feel sluggish in slow-mo
    let steer = input.state;
    if (g.mode === 'title') {
      attract.stickX = Math.sin(now * 0.00031) * 0.5 - ship.x * 0.03;
      attract.stickY = Math.sin(now * 0.00047) * 0.35 - ship.y * 0.03;
      steer = attract;
    } else if (g.mode === 'dead') {
      steer = dead;
    }
    ship.update(realDt, dt, steer);
    rocks.update(dt, ship);
    shards.update(dt, ship);
    lane.update(ship, now / 1000);

    // ---- The beacon lane: radiation outside, repair near the centre ----
    const L = CONFIG.lane, R = CONFIG.radiation;
    const laneDist = Math.hypot(ship.x, ship.y);
    const outside = laneDist - L.safeRadius;
    g.micaCooldown = Math.max(0, g.micaCooldown - realDt);
    if (g.mode === 'flying') {
      if (outside > 0) {
        g.exposure = Math.min(100, g.exposure + R.riseRate * (0.25 + outside / 10) * dt);
        if (!g.wasOutside) { micaSay('leftLane'); g.alarmTimer = 0; }
        if (g.exposure > 70 && g.exposure - R.riseRate * dt <= 70) micaSay('radHigh', true);
      } else {
        g.exposure = Math.max(0, g.exposure - R.fallRate * dt);
        if (g.wasOutside && g.exposure > 20) micaSay('back');
        if (laneDist < L.coreRadius && g.exposure === 0) g.hull = Math.min(CONFIG.hull.max, g.hull + L.coreRepair * dt);
      }
      g.wasOutside = outside > 0;
      if (g.exposure > R.damageFrom) {
        damage(R.hullDamage * ((g.exposure - R.damageFrom) / (100 - R.damageFrom)) * dt, 'radiation');
      }

      // Alarms: faster as exposure rises; a slow low alarm when the hull is critical
      g.alarmTimer -= realDt;
      if (g.alarmTimer <= 0 && (outside > 0 || g.hull < 25)) {
        audio.alarm(g.exposure > 60 || g.hull < 25);
        g.alarmTimer = outside > 0 ? THREE.MathUtils.lerp(1.1, 0.32, g.exposure / 100) : 1.6;
      }
      audio.geiger(outside > 0 ? Math.min(1, 0.12 + g.exposure / 100) : (g.exposure / 100) * 0.4, realDt);

      if (outside > 0) hud.setWarning(g.exposure > 60 ? 'Radiation critical. Return to the lane' : 'Radiation. Return to the lane', g.exposure > 60 ? 2 : 1);
      else if (g.hull < 25) hud.setWarning('Hull critical', 2);
      else hud.setWarning('');
    }
    if (g.mode === 'dead') g.deathTimer += realDt;
    g.radFx += ((outside > 0 ? 0.35 : 0) + g.exposure / 150 - g.radFx) * (1 - Math.exp(-4 * realDt));
    dust.setRadiation(Math.min(1, g.radFx));

    // Phase drive
    g.phaseTime = Math.max(0, g.phaseTime - realDt);
    g.phaseCooldown = Math.max(0, g.phaseCooldown - realDt);
    const phasing = g.phaseTime > 0;
    g.phaseFx += ((phasing ? 1 : 0) - g.phaseFx) * (1 - Math.exp(-(phasing ? 30 : 6) * realDt));
    const readiness = 1 - g.phaseCooldown / (CONFIG.phase.cooldown + CONFIG.phase.duration);
    cockpit.setPhase(readiness, phasing);

    // Chain decay
    if (g.chainTimer > 0 && (g.chainTimer -= realDt) <= 0) g.chain = 0;
    cockpit.setChain(Math.min(3, g.chain % CONFIG.nearMiss.daredevilChain || (g.chain ? 3 : 0)));

    rig.update(realDt, g.phaseFx * CONFIG.phase.fovKick * 0.5);
    sky.update(ship);
    dust.update(ship);
    reticle.material.opacity = g.mode === 'flying' ? 0.55 * (1 - g.phaseFx * 0.7) : 0;

    // Post uniforms
    g.aberrationKick *= Math.exp(-5 * realDt);
    g.hitFlash *= Math.exp(-4 * realDt);
    post.sync();
    post.uniforms.aberration.value = CONFIG.fx.aberration + g.aberrationKick + g.phaseFx * 0.6;
    post.uniforms.phase.value = g.phaseFx;
    post.uniforms.hit.value = g.hitFlash;
    post.uniforms.radiation.value = Math.min(1, g.radFx);

    audio.update(ship.speed);

    // MICA, occasionally
    if (g.mode === 'flying' && outside <= 0 && (g.micaTimer -= realDt) <= 0) {
      hud.say('MICA', MICA_LINES[g.micaIndex++ % MICA_LINES.length], 5);
      g.micaTimer = 22 + Math.random() * 14;
    }

    // Guidance: when drifting from the lane, point back at its centre line
    ship.group.updateMatrixWorld(true);
    const showGuide = g.mode === 'flying' && laneDist > L.warnRadius;
    if (showGuide) {
      guideV.set(0, 0, -120).project(camera);
      const behind = guideV.z > 1;
      let nx = behind ? -guideV.x : guideV.x, ny = behind ? -guideV.y : guideV.y;
      const w = innerWidth, h = innerHeight;
      const onScreen = !behind && Math.abs(nx) < 0.82 && Math.abs(ny) < 0.78;
      if (!onScreen) {
        if (Math.hypot(nx, ny) < 1e-3) { nx = -ship.x; ny = -ship.y; }
        const a = Math.atan2(ny * h, nx * w);
        nx = Math.cos(a) * 0.8; ny = Math.sin(a) * 0.72;
      }
      const px = (nx + 1) * 0.5 * w, py = (1 - ny) * 0.5 * h;
      hud.setGuide({
        show: true, x: px, y: py, onScreen,
        angle: Math.atan2(py - h / 2, px - w / 2),
        danger: outside > 0,
        label: outside > 0 ? `${Math.ceil(outside)} m to the lane` : 'Lane edge',
      });
    } else hud.setGuide({ show: false });

    hud.setHull(g.hull / CONFIG.hull.max);
    hud.setRadiation(g.exposure / 100);
    hud.setRolls(ship.rollCharges, CONFIG.roll.charges);
    hud.setStick(g.mode === 'flying' ? input.state.touchStick : null);
    hud.setScore(g.score);
    hud.update(realDt);

    fpsAcc += realDt; fpsFrames++;
    if (fpsAcc > 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    if (tuning.open) {
      hud.dev(`${backend}  ${fps} fps  speed ${ship.speed.toFixed(0)}  lane ${laneDist.toFixed(1)}  hull ${g.hull.toFixed(0)}  rad ${g.exposure.toFixed(0)}  near ${g.nearMisses}  hits ${g.hits}`);
    } else hud.dev('');

    post.render();
  }

  renderer.setAnimationLoop(frame);
  window.__kb2 = { g, ship, CONFIG, backend, input };   // for the console and tests
  document.body.classList.add('ready');
}

boot();
