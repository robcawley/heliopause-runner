import { CONFIG } from '../config.js';
import musicUrl from '../assets/audio/sidewinding.mp3';

// All sound effects are synthesised, so they can be tuned alongside the feel
// and there are no asset files to manage yet. Music runs through a low-pass
// filter the phase drive sweeps closed, so phasing sounds like going underwater.
//
//   master
//    ├── music  (Sidewinding) -> musicFilter
//    ├── engine (two detuned saws + rumble) -> engineFilter, opens with speed
//    └── sfx    (whooshes, near-miss ticks, hits, phase)
export function createAudio() {
  let ctx = null;
  let master, musicGain, musicFilter, sfxGain, engineGain, engineFilter, engineOscs, noiseBuf, musicEl;
  let muted = false;

  function noiseBuffer(seconds = 2) {
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function start() {
    if (ctx) return ctx.resume();
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    comp.connect(master);

    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass'; musicFilter.frequency.value = 20000; musicFilter.Q.value = 0.7;
    musicGain = ctx.createGain(); musicGain.gain.value = CONFIG.audio.music;
    musicFilter.connect(musicGain).connect(comp);

    sfxGain = ctx.createGain(); sfxGain.gain.value = CONFIG.audio.sfx;
    sfxGain.connect(comp);

    noiseBuf = noiseBuffer();

    // Engine
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass'; engineFilter.frequency.value = 300; engineFilter.Q.value = 2;
    engineGain = ctx.createGain(); engineGain.gain.value = CONFIG.audio.engine;
    engineFilter.connect(engineGain).connect(comp);
    engineOscs = [41, 61.7].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = i ? 7 : -5;
      const g = ctx.createGain(); g.gain.value = 0.35;
      o.connect(g).connect(engineFilter); o.start();
      return o;
    });
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuf; rumble.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 140;
    const rg = ctx.createGain(); rg.gain.value = 0.5;
    rumble.connect(rf).connect(rg).connect(engineFilter); rumble.start();

    // Music
    musicEl = new Audio(musicUrl);
    musicEl.loop = true;
    musicEl.crossOrigin = 'anonymous';
    ctx.createMediaElementSource(musicEl).connect(musicFilter);
    musicEl.play().catch(() => {});
    return ctx.resume();
  }

  // A pass: band-passed noise that swells as the rock closes, peaks at the
  // crossing, then drops away, panned to the side it passes on. Pitch rises on
  // approach and falls after, a cheap Doppler.
  function whoosh(pan, intensity, lead) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const tp = t0 + lead;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.3;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(380, t0);
    bp.frequency.exponentialRampToValueAtTime(1600 + 1800 * intensity, tp);
    bp.frequency.exponentialRampToValueAtTime(260, tp + 0.45);
    const g = ctx.createGain();
    const peak = 0.25 + intensity * 0.9;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, tp);
    g.gain.exponentialRampToValueAtTime(0.0001, tp + 0.5);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan * 0.35, t0);
    p.pan.linearRampToValueAtTime(pan, tp);
    p.pan.linearRampToValueAtTime(pan * 0.6, tp + 0.5);
    src.connect(bp).connect(g).connect(p).connect(sfxGain);
    src.start(t0); src.stop(tp + 0.6);
  }

  // Near miss confirm: a short bright tick that climbs with the chain
  function tick(chain) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = 740 * Math.pow(2, (Math.min(chain, 6) * 3) / 12);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(sfxGain); o.start(t); o.stop(t + 0.2);
  }

  function daredevil() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.04 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.04 + 0.7);
      o.connect(g).connect(sfxGain); o.start(t + i * 0.04); o.stop(t + 1);
    });
  }

  function hit() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(og).connect(sfxGain); o.start(t); o.stop(t + 0.65);

    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(180, t + 0.4);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.7, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    n.connect(lp).connect(ng).connect(sfxGain); n.start(t); n.stop(t + 0.5);
  }

  function phase(duration) {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicFilter.frequency.cancelScheduledValues(t);
    musicFilter.frequency.setValueAtTime(musicFilter.frequency.value, t);
    musicFilter.frequency.exponentialRampToValueAtTime(520, t + 0.06);
    musicFilter.frequency.setValueAtTime(520, t + duration);
    musicFilter.frequency.exponentialRampToValueAtTime(20000, t + duration + 0.5);

    // Reverse swell: noise rising into the phase
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.setValueAtTime(3000, t); hp.frequency.exponentialRampToValueAtTime(600, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.2);
    n.connect(hp).connect(g).connect(sfxGain); n.start(t); n.stop(t + duration + 0.3);
  }

  // Geiger counter: random clicks whose rate follows radiation exposure (0..1)
  let geigerDebt = 0;
  function geiger(level, dt) {
    if (!ctx || level <= 0) return;
    geigerDebt += (level * level * 55 + level * 6) * dt;
    while (geigerDebt > 0) {
      geigerDebt -= -Math.log(Math.random() + 1e-6);   // Poisson spacing
      const t = ctx.currentTime + Math.random() * dt;
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);
      n.connect(hp).connect(g).connect(sfxGain);
      n.start(t, Math.random()); n.stop(t + 0.01);
    }
  }

  // Two-tone alarm; call once per beat
  function alarm(urgent) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const [a, b] = urgent ? [880, 660] : [660, 520];
    [a, b].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const g = ctx.createGain();
      const s0 = t + i * 0.13;
      g.gain.setValueAtTime(0.0001, s0);
      g.gain.exponentialRampToValueAtTime(0.07, s0 + 0.01);
      g.gain.setValueAtTime(0.07, s0 + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.12);
      o.connect(lp).connect(g).connect(sfxGain); o.start(s0); o.stop(s0 + 0.13);
    });
  }

  function repair() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      const s0 = t + i * 0.055;
      g.gain.setValueAtTime(0.0001, s0);
      g.gain.exponentialRampToValueAtTime(0.14, s0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.9);
      o.connect(g).connect(sfxGain); o.start(s0); o.stop(s0 + 1);
    });
  }

  // The ship's own roll: a quick corkscrew of air noise swept across the stereo field
  function roll(dir, duration) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + duration * 0.5);
    bp.frequency.exponentialRampToValueAtTime(400, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + duration * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.15);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-dir, t);
    p.pan.linearRampToValueAtTime(dir, t + duration);
    n.connect(bp).connect(g).connect(p).connect(sfxGain);
    n.start(t); n.stop(t + duration + 0.2);
  }

  function death() {
    if (!ctx) return;
    hit();
    const t = ctx.currentTime;
    musicFilter.frequency.cancelScheduledValues(t);
    musicFilter.frequency.setValueAtTime(musicFilter.frequency.value, t);
    musicFilter.frequency.exponentialRampToValueAtTime(260, t + 1.2);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(30, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g).connect(sfxGain); o.start(t); o.stop(t + 2.5);
  }

  function revive() {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicFilter.frequency.cancelScheduledValues(t);
    musicFilter.frequency.setValueAtTime(Math.max(200, musicFilter.frequency.value), t);
    musicFilter.frequency.exponentialRampToValueAtTime(20000, t + 1.5);
  }

  function update(speed) {
    if (!ctx) return;
    const f = CONFIG.flight;
    const k = Math.max(0, Math.min(1, (speed - f.cruiseSpeed * 0.5) / (f.boostSpeed - f.cruiseSpeed * 0.5)));
    const t = ctx.currentTime;
    engineFilter.frequency.setTargetAtTime(220 + k * 900, t, 0.1);
    engineOscs.forEach((o, i) => o.detune.setTargetAtTime((i ? 7 : -5) + k * 500, t, 0.15));
    musicGain.gain.setTargetAtTime(muted ? 0 : CONFIG.audio.music, t, 0.05);
    sfxGain.gain.setTargetAtTime(muted ? 0 : CONFIG.audio.sfx, t, 0.05);
    engineGain.gain.setTargetAtTime(muted ? 0 : CONFIG.audio.engine, t, 0.05);
  }

  return {
    start, whoosh, tick, daredevil, hit, phase, update, geiger, alarm, repair, roll, death, revive,
    toggleMute() { muted = !muted; return muted; },
    suspend() { ctx?.suspend(); musicEl?.pause(); },
    resume() { ctx?.resume(); musicEl?.play().catch(() => {}); },
  };
}
