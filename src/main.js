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
import { createCockpit } from './cockpit/cockpit.js';
import { createPost } from './fx/post.js';
import { createAudio } from './audio/audio.js';
import { createHud } from './ui/hud.js';
import { createTuning } from './ui/tuning.js';

// Stage 0: the feel prototype. No enemies, no weapons. Just the cockpit, the
// belt, and the one question that matters: is flying through it fun for thirty
// seconds? Everything here is in service of that.

const MICA_LINES = [
  'Beacon bearing locked. Hold this line.',
  'Belt density rising. Fly close, it keeps our wake small.',
  'The ice sings when you pass that near. I like it.',
  'Forty years, and the signal has not drifted once.',
  'Phase drive recharged. It will carry us through anything, briefly.',
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
  scene.add(sky.mesh, dust.mesh, rocks.mesh, shards.mesh);
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
  const g = {
    mode: 'title',        // 'title' | 'flying' | 'paused'
    score: 0,
    chain: 0, chainTimer: 0,
    nearMisses: 0, hits: 0, bestChain: 0,
    phaseTime: 0, phaseCooldown: 0,
    hitStop: 0, slowmo: 0, slowmoScale: 1, timeScale: 1,
    aberrationKick: 0, hitFlash: 0, phaseFx: 0,
    micaTimer: 14, micaIndex: 1,
  };

  const clamp = THREE.MathUtils.clamp;

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

  hud.phaseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); tryPhase(); });

  // ---- Launch / pause ----------------------------------------------------

  const title = document.getElementById('title');
  const pauseEl = document.getElementById('pause');
  document.getElementById('backend').textContent = backend;

  async function launch() {
    await audio.start();
    title.classList.add('gone');
    g.mode = 'flying';
    hud.say('MICA', MICA_LINES[0], 5);
    renderer.domElement.focus();
  }
  document.getElementById('launch').addEventListener('click', launch);
  addEventListener('keydown', (e) => { if (g.mode === 'title' && e.key === 'Enter') launch(); });

  function setPaused(p) {
    if (g.mode === 'title') return;
    g.mode = p ? 'paused' : 'flying';
    pauseEl.classList.toggle('on', p);
    p ? audio.suspend() : audio.resume();
  }
  pauseEl.addEventListener('click', () => setPaused(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden && g.mode === 'flying') setPaused(true); });

  // ---- Frame -------------------------------------------------------------

  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0, fps = 0;

  // Title screen: the ship drifts on its own so the belt is alive behind the menu
  const attract = { aimX: 0, aimY: 0, boost: false };

  function frame(now) {
    const realDt = Math.min(0.05, (now - last) / 1000);
    last = now;

    input.update(realDt);
    if (input.consume('pausePressed')) setPaused(g.mode === 'flying');
    if (input.consume('mutePressed')) hud.say('System', audio.toggleMute() ? 'Audio muted' : 'Audio on', 1.5);
    if (input.consume('tuningPressed')) tuning.toggle();
    if (input.consume('phasePressed')) tryPhase();

    if (g.mode === 'paused') { post.render(); return; }

    // Time: hit-stop freezes the world, slow-mo eases back to full speed
    if (g.hitStop > 0) { g.hitStop -= realDt; g.timeScale = 0.02; }
    else if (g.slowmo > 0) { g.slowmo -= realDt; g.timeScale = g.slowmoScale; }
    else g.timeScale += (1 - g.timeScale) * (1 - Math.exp(-8 * realDt));
    const dt = realDt * g.timeScale;

    // The pilot's body runs on real time so controls never feel sluggish in slow-mo
    let steer = input.state;
    if (g.mode === 'title') {
      attract.aimX = Math.sin(now * 0.00031) * CONFIG.flight.boundsX * 0.6;
      attract.aimY = Math.sin(now * 0.00047) * CONFIG.flight.boundsY * 0.4;
      steer = attract;
    }
    ship.update(realDt, dt, steer);
    rocks.update(dt, ship);
    shards.update(dt, ship);

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

    audio.update(ship.speed);

    // MICA, occasionally
    if (g.mode === 'flying' && (g.micaTimer -= realDt) <= 0) {
      hud.say('MICA', MICA_LINES[g.micaIndex++ % MICA_LINES.length], 5);
      g.micaTimer = 22 + Math.random() * 14;
    }

    hud.setScore(g.score);
    hud.update(realDt);

    fpsAcc += realDt; fpsFrames++;
    if (fpsAcc > 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    if (tuning.open) {
      hud.dev(`${backend}  ${fps} fps  speed ${ship.speed.toFixed(0)}  near ${g.nearMisses}  hits ${g.hits}  best chain ${g.bestChain}`);
    } else hud.dev('');

    post.render();
  }

  renderer.setAnimationLoop(frame);
  window.__kb2 = { g, ship, CONFIG, backend };   // for the console and tests
  document.body.classList.add('ready');
}

boot();
