import './intro.css';

// The intro: a short title sequence the first time the game starts in a session. Four lines
// of setting over black, then the belt revealed behind a slammed title with a sub drop and a
// bright stab. Skippable with any key, click, tap or pad button. Resolves when done.
// Placeholder words for Rob to rewrite.

const LINES = [
  'Forty-four AU from the Sun.',
  'The old companies are gone. Their AIs are not.',
  'They hold the lanes, the towns, and the people in them.',
  'Everything that moves between them goes by courier.',
];
const SEEN = 'heliopause.introSeen';

export function introSeen() {
  try { return sessionStorage.getItem(SEEN) === '1'; } catch { return false; }
}

export function playIntro(audio) {
  try { sessionStorage.setItem(SEEN, '1'); } catch { /* private mode */ }
  const el = document.createElement('section');
  el.id = 'intro';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="intro-black"></div><p class="intro-line"></p>
    <div class="intro-title"><h1><span>Heliopause</span><span>Runner</span></h1><p>A courier's life in the Kuiper belt</p></div>
    <div class="intro-flash"></div><p class="intro-skip">Press any key to skip</p>`;
  document.body.append(el);
  const line = el.querySelector('.intro-line');
  const sfx = sounds(audio);
  const timers = [];
  const at = (s, fn) => timers.push(setTimeout(fn, s * 1000));

  return new Promise((resolve) => {
    let done = false;
    const t0 = performance.now();
    let padPoll = 0, skip = null;
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      sfx.stop();
      el.classList.add('out');
      removeEventListener('keydown', skip, true); removeEventListener('pointerdown', skip, true);
      clearInterval(padPoll);
      setTimeout(() => { el.remove(); resolve(); }, 900);
    };
    skip = (e) => { e.preventDefault?.(); e.stopPropagation?.(); finish(); };
    // Skip only after a beat, so the launch key press itself does not skip it
    setTimeout(() => { addEventListener('keydown', skip, true); addEventListener('pointerdown', skip, true); }, 600);
    padPoll = setInterval(() => { for (const p of navigator.getGamepads?.() ?? []) if (p?.buttons.some((b) => b.pressed) && performance.now() > t0 + 800) finish(); }, 100);

    sfx.riser(10);
    LINES.forEach((text, i) => {
      at(0.6 + i * 2.5, () => { line.textContent = text; line.classList.remove('on'); void line.offsetWidth; line.classList.add('on'); });
    });
    at(10.6, () => { line.classList.remove('on'); });
    at(11, () => { el.classList.add('reveal'); sfx.slam(); });
    at(17.5, finish);
  });
}

// Synth for the intro: a slow noise-and-tone riser, then the slam (sub drop, bright stab, echo)
function sounds(a) {
  const ctx = a.ctx, out = a.sfx;
  const nodes = [];
  if (!ctx || !out) return { riser() {}, slam() {}, stop() {} };
  const keep = (n) => { nodes.push(n); return n; };
  return {
    riser(d) {
      const t = ctx.currentTime;
      const n = keep(ctx.createBufferSource()); n.buffer = a.noise; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(200, t); bp.frequency.exponentialRampToValueAtTime(3200, t + d);
      const o = keep(ctx.createOscillator()); o.type = 'sawtooth';
      o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(220, t + d);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(150, t); lp.frequency.exponentialRampToValueAtTime(1600, t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + d); g.gain.setTargetAtTime(0, t + d, 0.05);
      n.connect(bp).connect(g); o.connect(lp).connect(g); g.connect(out);
      n.start(t); o.start(t); n.stop(t + d + 0.5); o.stop(t + d + 0.5);
    },
    slam() {
      const t = ctx.currentTime;
      const echo = ctx.createDelay(1); echo.delayTime.value = 0.32;
      const fb = ctx.createGain(); fb.gain.value = 0.38;
      const eg = ctx.createGain(); eg.gain.value = 0.5;
      echo.connect(fb).connect(echo); echo.connect(eg).connect(out);
      // Sub drop
      const s = keep(ctx.createOscillator()); s.type = 'sine';
      s.frequency.setValueAtTime(110, t); s.frequency.exponentialRampToValueAtTime(28, t + 1.2);
      const sg = ctx.createGain(); sg.gain.setValueAtTime(1.1, t); sg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      s.connect(sg).connect(out); s.start(t); s.stop(t + 2.3);
      // Noise crack
      const n = keep(ctx.createBufferSource()); n.buffer = a.noise;
      const nl = ctx.createBiquadFilter(); nl.type = 'lowpass'; nl.frequency.setValueAtTime(6000, t); nl.frequency.exponentialRampToValueAtTime(200, t + 1.5);
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.7, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      n.connect(nl).connect(ng).connect(out); n.start(t, Math.random()); n.stop(t + 1.7);
      // Bright stab: an open fifth chord of detuned saws, the filter closing down
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 3);
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.16, t + 0.02); cg.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      lp.connect(cg); cg.connect(out); cg.connect(echo);
      for (const f of [110, 164.8, 220, 329.6, 440]) for (const d of [-8, 8]) {
        const o = keep(ctx.createOscillator()); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
        o.connect(lp); o.start(t); o.stop(t + 4.1);
      }
    },
    stop() {
      const t = ctx.currentTime;
      for (const n of nodes) { try { n.stop(t + 0.3); } catch { /* already stopped */ } }
    },
  };
}
