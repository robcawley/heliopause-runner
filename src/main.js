import './shell/shell.css';
import { createEngine } from './engine/renderer.js';
import { createAudio } from './engine/audio.js';
import { createBeltRun } from './modes/belt-run/index.js';
import { createTuning } from './shell/tuning.js';

// The host shell: title, pause and debrief screens around one game mode.
// In the bigger game this is the part that changes: it will own the menus,
// the save, the map, and swap modes in and out. The Belt Run mode itself
// knows nothing about any of it; it only talks through events.

async function boot() {
  const stage = document.getElementById('stage');
  let run = null;

  let engine;
  try {
    engine = await createEngine(stage, { resolutionScale: () => run?.config.fx.resolutionScale ?? 1 });
  } catch (err) {
    document.getElementById('launch-note').textContent = 'This browser could not start WebGPU or WebGL2.';
    throw err;
  }
  document.getElementById('backend').textContent = engine.backend;

  const levels = { music: 0.55, sfx: 0.85 };
  const audio = createAudio(levels);

  run = createBeltRun({ engine, audio, hudParent: document.body });
  // Audio levels live in the mode's config so the tuning panel reaches them
  Object.defineProperties(levels, {
    music: { get: () => run.config.audio.music },
    sfx: { get: () => run.config.audio.sfx },
  });
  run.attract();

  const tuning = createTuning(run.config, { onResize: engine.resize });

  // ---- Screens --------------------------------------------------------
  const title = document.getElementById('title');
  const pauseEl = document.getElementById('pause');
  const debrief = document.getElementById('debrief');
  let screen = 'title';               // 'title' | 'flying' | 'paused' | 'debrief'

  async function launch() {
    if (screen !== 'title') return;
    await audio.start();
    title.classList.add('gone');
    screen = 'flying';
    run.start();
    run.setCapture(true);
  }
  document.getElementById('launch').addEventListener('click', launch);

  function setPaused(p) {
    if (screen !== 'flying' && screen !== 'paused') return;
    screen = p ? 'paused' : 'flying';
    pauseEl.classList.toggle('on', p);
    run.pause(p);
    run.setCapture(!p);
  }
  pauseEl.addEventListener('click', () => setPaused(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'flying') setPaused(true); });

  function flyAgain() {
    if (screen !== 'debrief') return;
    debrief.classList.remove('on');
    screen = 'flying';
    run.restart();
    run.setCapture(true);
  }
  document.getElementById('again').addEventListener('click', flyAgain);

  addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (screen === 'title') launch();
    else if (screen === 'debrief' && debrief.classList.contains('on')) flyAgain();
  });

  // ---- Mode events ----------------------------------------------------
  run.on('request', (what) => {
    if (what === 'pause') setPaused(screen === 'flying');
    if ((what === 'escape' || what === 'lockLost') && screen === 'flying') setPaused(true);
    if (what === 'mute') run.hud.say('System', audio.toggleMute() ? 'Audio muted' : 'Audio on', 1.5);
    if (what === 'tuning') tuning.toggle();
  });

  run.on('death', (s) => {
    screen = 'debrief';
    run.setCapture(false);
    debrief.querySelector('.debrief-reason').textContent = s.cause === 'radiation'
      ? `Radiation burned through the hull, ${Math.round(s.laneOffset)} metres outside the beacon lane.`
      : 'The belt broke through the hull.';
    const mins = Math.floor(s.time / 60), secs = Math.floor(s.time % 60).toString().padStart(2, '0');
    debrief.querySelector('.debrief-stats').innerHTML = [
      ['Score', s.score.toLocaleString()], ['Flight time', `${mins}:${secs}`],
      ['Distance flown', `${(s.distance / 1000).toFixed(2)} km`], ['Along the lane', `${(s.laneProgress / 1000).toFixed(2)} km`],
      ['Near misses', s.nearMisses], ['Best chain', s.bestChain], ['Repair beacons', s.gates],
      ['Rocks destroyed', s.rocksDestroyed], ['Blaster accuracy', s.shots ? `${Math.round((s.shotsHit / s.shots) * 100)}%` : '–'],
      ['Rock hits taken', s.hits], ['PIP rescues', s.pipRescues],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    setTimeout(() => { debrief.classList.add('on'); document.getElementById('again').focus(); }, 900);
  });

  // ---- Loop -----------------------------------------------------------
  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0, fps = 0;
  const seenErrors = new Set();

  engine.renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // A bug in one frame must never freeze the game: log it once, keep flying
    try { run.frame(dt, now / 1000); }
    catch (err) {
      const key = String(err);
      if (!seenErrors.has(key)) { seenErrors.add(key); console.error('Frame error (logged once):', err); }
    }

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    if (tuning.open) {
      const s = run.state, p = run.ship;
      run.hud.dev(`${engine.backend}  ${fps} fps  speed ${p.speed.toFixed(0)}  lane ${Math.hypot(p.pos.x, p.pos.y).toFixed(0)}  hull ${s.hull.toFixed(0)}  rad ${s.exposure.toFixed(0)}  near ${s.nearMisses}  hits ${s.hits}`);
    } else run.hud.dev('');
  });

  window.__game = { run, engine };      // for the console and tests
  document.body.classList.add('ready');
}

boot();
