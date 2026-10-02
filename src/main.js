import './shell/shell.css';
const COARSE = matchMedia('(pointer: coarse)').matches;   // a touch-first device
import { createEngine } from './engine/renderer.js';
import { createAudio } from './engine/audio.js';
import { createBeltRun } from './modes/belt-run/index.js';
import { createBoard } from './tycoon/board.js';
import { playIntro, introSeen } from './shell/intro.js';
import { loadCareer, saveCareer, newCareer, settle, tripOf, applyLoadout, makeOffers } from './tycoon/career.js';
import { loseCrew, crewOnDeath, crewById } from './tycoon/crew.js';

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
  // Phones render at a lower pixel density: twice the screen's resolution is too heavy for this
  // kind of 3D on a phone GPU (the tuning panel's resolution scale still overrides it)
  if (COARSE) { run.config.fx.resolutionScale = 0.7; dispatchEvent(new Event('resize')); }
  // Audio levels live in the mode's config so the tuning panel reaches them
  Object.defineProperties(levels, {
    music: { get: () => run.config.audio.music },
    sfx: { get: () => run.config.audio.sfx },
  });
  run.attract();
  document.body.dataset.controls = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
  if (navigator.getGamepads?.().some((pad) => pad?.connected)) document.body.dataset.controls = 'gamepad';
  run.on('device', (device) => { document.body.dataset.controls = device; });
  window.addEventListener('gamepadconnected', () => { document.body.dataset.controls = 'gamepad'; });
  // Touch: a held thumb must never select text, open a callout menu or pinch-zoom the page
for (const ev of ['selectstart', 'contextmenu', 'gesturestart']) {
  document.addEventListener(ev, (e) => { if (!e.target.closest?.('input, textarea, select, .lil-gui')) e.preventDefault(); }, { passive: false });
}
window.addEventListener('gamepaddisconnected', () => { document.body.dataset.controls = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard'; });

  // The feel-tuning panel (and lil-gui) loads only the first time someone opens it
  let tuning = {
    open: false,
    toggle() {
      import('./shell/tuning.js').then(({ createTuning }) => {
        if (tuning.open !== false || tuning.toggle !== this.toggle) return;
        tuning = createTuning(run.config, { onResize: engine.resize });
        tuning.toggle();
      });
    },
  };

  // ---- Screens --------------------------------------------------------
  const title = document.getElementById('title');
  const pauseEl = document.getElementById('pause');
  const debrief = document.getElementById('debrief');
  let screen = 'title';               // 'title' | 'board' | 'flying' | 'paused' | 'debrief'

  // ---- The career: the settlement board between trips (src/tycoon) ----
  let career = loadCareer();
  saveCareer(career);
  let started = false;                // the mode's first start() also starts the music
  const board = createBoard(document.body, {
    onLaunch(k) {
      career.contract = k;
      saveCareer(career);
      board.hide();
      screen = 'flying';
      applyLoadout(run.config, career);           // what you bought is what you fly
      if (started) run.restart(tripOf(k, career));
      else { run.start(tripOf(k, career)); started = true; }
      run.setCapture(true);
    },
    onChange() { saveCareer(career); },   // a purchase at the market
    onReset() {
      career = newCareer();
      saveCareer(career);
      board.show(career);
    },
  });
  function showBoard(slip = null) {
    screen = 'board';
    run.setCapture(false);
    board.show(career, slip);
  }
  window.__career = () => career;     // for the console

  async function launch() {
    if (screen !== 'title') return;
    // Phones: go fullscreen and hold landscape where the browser allows it (Android does; iPhone
    // Safari mostly does not). Must happen inside the tap, before anything is awaited.
    if (COARSE) {
      document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
        ?.then(() => window.screen.orientation?.lock?.('landscape')).catch(() => {});
    }
    await audio.start();
    title.classList.add('gone');
    if (!introSeen()) { screen = 'intro'; await playIntro(audio); }   // shell/intro.js, once a session
    showBoard(null);
  }
  document.getElementById('launch').addEventListener('click', launch);

  function setPaused(p) {
    if (screen !== 'flying' && screen !== 'paused') return;
    screen = p ? 'paused' : 'flying';
    pauseEl.classList.toggle('on', p);
    document.body.classList.toggle('paused', p);
    run.pause(p);
    run.setCapture(!p);
  }
  pauseEl.addEventListener('click', () => setPaused(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'flying') setPaused(true); });

  function flyAgain() {
    if (screen !== 'debrief') return;
    debrief.classList.remove('on');
    screen = 'flying';
    applyLoadout(run.config, career);
    run.restart(tripOf(career.contract, career));          // the same contract, from the same pad
    run.setCapture(true);
  }
  document.getElementById('again').addEventListener('click', flyAgain);
  // Give up on the contract and pick another from the board where you took off
  function backToBoard() {
    if (screen !== 'debrief') return;
    debrief.classList.remove('on');
    career.contract = null;
    saveCareer(career);
    showBoard(null);
  }
  document.getElementById('to-board').addEventListener('click', backToBoard);

  addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (screen === 'board') { if (!document.activeElement?.closest?.('button')) board.confirm(); return; }
    if (screen === 'title') launch();
    else if (screen === 'debrief' && debrief.classList.contains('on')) flyAgain();
  });

  // ---- Mode events ----------------------------------------------------
  run.on('request', (what) => {
    if (what === 'confirm') {
      if (screen === 'board') board.confirm();
      else if (screen === 'title') launch();
      else if (screen === 'debrief' && debrief.classList.contains('on')) flyAgain();
    }
    if (what === 'pause') {
      if (screen === 'board') { /* the board has its own buttons */ }
      else if (screen === 'title') launch();
      else if (screen === 'debrief' && debrief.classList.contains('on')) flyAgain();
      else setPaused(screen === 'flying');
    }
    if ((what === 'escape' || what === 'lockLost') && screen === 'flying') setPaused(true);
    if (what === 'mute') run.hud.say('System', audio.toggleMute() ? 'Audio muted' : 'Audio on', 1.5);
    if (what === 'tuning') tuning.toggle();
  });

  const showDebrief = (s) => {
    screen = 'debrief';
    run.setCapture(false);
    debrief.querySelector('h2').textContent = s.landed ? `Landed at ${s.destination}` : 'Signal lost';
    debrief.querySelector('.debrief-reason').textContent = s.landed
      ? `Clamps on, engines down. ${s.hull}% of the hull made it.`
      : s.cause === 'radiation'
      ? `Radiation burned through the hull, ${Math.round(s.laneOffset)} metres outside the beacon lane.`
      : s.cause === 'wall' ? 'You tore the hull open on a canyon wall.'
      : s.cause === 'raider' ? 'Raiders picked the hull apart.'
      : s.cause === 'wreck' ? 'You ploughed into a dead ship.'
      : s.cause === 'arc' || s.cause === 'coil' ? 'The old battlefield was still live.'
      : s.cause === 'scrap' ? 'The scrap cloud stripped the hull.' : 'The belt broke through the hull.';
    const mins = Math.floor(s.time / 60), secs = Math.floor(s.time % 60).toString().padStart(2, '0');
    debrief.querySelector('.debrief-stats').innerHTML = [
      ['Score', s.score.toLocaleString()], ...(s.landed ? [['Landing bonus', `+${(s.landingBonus + s.hullBonus).toLocaleString()}`]] : []), ['Flight time', `${mins}:${secs}`],
      ['Distance flown', `${(s.distance / 1000).toFixed(2)} km`], ['Along the lane', `${(s.laneProgress / 1000).toFixed(2)} km`],
      ['Near misses', s.nearMisses], ['Best chain', s.bestChain], ['Repair beacons', s.gates],
      ['Rocks destroyed', s.rocksDestroyed], ['Blaster accuracy', s.shots ? `${Math.round((s.shotsHit / s.shots) * 100)}%` : '–'],
      ['Rock hits taken', s.hits], ['PIP rescues', s.pipRescues], ['Settlements passed', s.settlements ?? 0],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    setTimeout(() => { debrief.classList.add('on'); document.getElementById('again').focus(); }, 900);
  };
      run.on('death', showDebrief);

  // ---- The ending (modes/belt-run/ending.js, docs/PACKAGE.md): the epilogue after the crossing ----
  // Placeholder words for Rob to rewrite.
  const epilogue = document.createElement('section');
  epilogue.id = 'epilogue';
  epilogue.setAttribute('aria-live', 'assertive');
  document.body.append(epilogue);
  const andList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  run.on('ending', () => {
    screen = 'ending';
    run.setCapture(false);
    career.ended = true;
    career.contract = null;
    career.offers = makeOffers(career);
    saveCareer(career);
    const name = (id) => crewById(id)?.name;
    const home = (career.crew ?? []).map(name).filter(Boolean);
    const fallen = (career.fallen ?? []).map(name).filter(Boolean);
    epilogue.innerHTML = `<div class="epi-inner">
      <p class="epi-kicker">Beyond the heliopause</p>
      <h2>The line is kept</h2>
      <p>You turned for home. Nobody at Arrokoth asked what you saw. The Kindred already knew.</p>
      <p>${home.length ? `${andList(home)} flew back with you.` : 'You flew back alone.'}</p>
      ${fallen.length ? `<p class="epi-dim">Lost in the belt: ${andList(fallen)}. Remembered.</p>` : ''}
      <p>The charts end at the heliopause now. Nobody argues with them.</p>
      <p class="epi-credit">Heliopause Runner<br>A game by Rob Cawley</p>
      <div class="epi-actions"><button type="button" id="epi-belt">Back to the belt</button><button type="button" id="epi-new">New career</button></div>
    </div>`;
    requestAnimationFrame(() => epilogue.classList.add('on'));
    const close = () => { epilogue.classList.remove('on'); };
    epilogue.querySelector('#epi-belt').addEventListener('click', () => { close(); showBoard(null); });
    epilogue.querySelector('#epi-new').addEventListener('click', () => { close(); career = newCareer(); saveCareer(career); showBoard(null); });
    setTimeout(() => epilogue.querySelector('#epi-belt')?.focus(), 2500);
  });
  // The wing (modes/belt-run/wing.js): a hand shot down is gone at once, so a retry cannot undo it
  // A fallen hand's perk goes with them, mid-fight: refit the flight config without them
  run.on('wingLost', ({ id }) => {
    const m = crewById(id);
    loseCrew(career, id);
    saveCareer(career);
    applyLoadout(run.config, career);
    if (m) run.hud.say('System', `Lost with ${m.name}: ${m.perk.toLowerCase()}`, 4);
  });
  run.on('death', () => { crewOnDeath(career); saveCareer(career); });
  // Landed: pay the slip, move the pilot, then the board for the next job
  run.on('landed', (s) => {
    screen = 'board';
    run.setCapture(false);
    const slip = career.contract ? settle(career, career.contract, s) : null;
    saveCareer(career);
    setTimeout(() => board.show(career, slip), 1800);
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
