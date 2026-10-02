// The belt run's sound effects, built on the engine's audio graph. All
// synthesised, so they tune alongside the feel with no asset files.
export function createSfx(a, config) {
  let bus = null, engineGain, engineFilter, engineOscs, burnGain, throbLfo, throbDepth;
  let wasBoost = false, wasBrake = false, rcsWait = 0, turnSide = 0, rcsPending = false, lastT = null;
  let geigerDebt = 0, amb = null;
  const loops = [], active = new Set();
  const keep = (nodes, node) => { nodes.push(node); return node; };
  function releaseAfter(last, nodes) {
    active.add(nodes);
    last.onended = () => {
      nodes.forEach((node) => node.disconnect());
      active.delete(nodes);
    };
  }
  function dispose() {
    for (const nodes of [loops, ...active]) {
      for (const node of nodes) {
        if (node.stop) { try { node.stop(); } catch { /* already stopped */ } }
        node.disconnect();
      }
    }
    loops.length = 0; active.clear(); bus = null; amb = null;
    wasBoost = false; wasBrake = false; rcsWait = 0; turnSide = 0; rcsPending = false; lastT = null;
  }

  // Called once the engine's audio context exists
  function start() {
    if (bus || !a.ctx) return;
    const ctx = a.ctx;
    bus = keep(loops, ctx.createGain());
    bus.connect(a.sfx);

    // Engine: a starfighter's burn heard through its own hull, not a jet. Nothing tonal climbs
    // in pitch with speed (the old rising saws were what made it sound like a plane). Instead:
    //   sub     a fixed low hum you feel more than hear
    //   burn    rocket noise, soft-clipped for crackle, throbbing like a combustion chamber;
    //           the throttle opens it, roughens it and speeds the throb
    //   hull    a narrow resonance the frame rings at
    // Boost lights with a deep whump; manoeuvring thrusters puff as turns build (see update).
    engineFilter = keep(loops, ctx.createBiquadFilter());
    engineFilter.type = 'lowpass'; engineFilter.frequency.value = 220; engineFilter.Q.value = 0.7;
    engineGain = keep(loops, ctx.createGain()); engineGain.gain.value = 0;
    engineFilter.connect(engineGain).connect(bus);
    engineOscs = [[36, 'sine', 0.6], [54, 'triangle', 0.2]].map(([f, type, level]) => {
      const o = keep(loops, ctx.createOscillator()); o.type = type; o.frequency.value = f;
      const g = keep(loops, ctx.createGain()); g.gain.value = level;
      o.connect(g).connect(engineGain); o.start();
      return o;
    });
    const burn = keep(loops, ctx.createBufferSource()); burn.buffer = a.noise; burn.loop = true;
    const pre = keep(loops, ctx.createBiquadFilter()); pre.type = 'lowpass'; pre.frequency.value = 420;
    const drive = keep(loops, ctx.createGain()); drive.gain.value = 3;
    const clip = keep(loops, ctx.createWaveShaper()); clip.curve = softClip(2.5); clip.oversample = '2x';
    burnGain = keep(loops, ctx.createGain()); burnGain.gain.value = 0.4;
    const throb = keep(loops, ctx.createGain()); throb.gain.value = 1;
    throbLfo = keep(loops, ctx.createOscillator()); throbLfo.frequency.value = 8;
    throbDepth = keep(loops, ctx.createGain()); throbDepth.gain.value = 0.12;
    throbLfo.connect(throbDepth).connect(throb.gain); throbLfo.start();
    burn.connect(pre).connect(drive).connect(clip).connect(burnGain).connect(throb).connect(engineFilter); burn.start();
    const hull = keep(loops, ctx.createBufferSource()); hull.buffer = a.noise; hull.loop = true;
    const hb = keep(loops, ctx.createBiquadFilter()); hb.type = 'bandpass'; hb.frequency.value = 92; hb.Q.value = 6;
    const hg = keep(loops, ctx.createGain()); hg.gain.value = 0.9;
    hull.connect(hb).connect(hg).connect(engineGain); hull.start(0, 1.3);
  }

  function softClip(k) {
    const n = 1024, c = new Float32Array(n), norm = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
    return c;
  }

  // Boost lights: a deep whump that drops in pitch, and a roar that closes down into the burn
  function ignite() {
    const nodes = [];
    const ctx = a.ctx, t = ctx.currentTime;
    const o = keep(nodes, ctx.createOscillator()); o.type = 'sine';
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.4);
    const g = keep(nodes, ctx.createGain());
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.6);
    const n = keep(nodes, ctx.createBufferSource()); n.buffer = a.noise;
    const lp = keep(nodes, ctx.createBiquadFilter()); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(240, t + 0.9);
    const ng = keep(nodes, ctx.createGain());
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.55, t + 0.04); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    n.connect(lp).connect(ng).connect(bus); n.start(t, Math.random()); n.stop(t + 1.05);
    releaseAfter(n, nodes);
  }

  // A manoeuvring thruster: a short hard puff of gas, panned to the side that fires.
  // long: the retro burst when you brake.
  function rcs(pan, level, long = false) {
    if (!bus) return;
    const nodes = [];
    const ctx = a.ctx, t = ctx.currentTime, d = long ? 0.38 : 0.11;
    const n = keep(nodes, ctx.createBufferSource()); n.buffer = a.noise; n.playbackRate.value = 0.85 + Math.random() * 0.3;
    const bp = keep(nodes, ctx.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = long ? 1100 : 2400; bp.Q.value = 0.8;
    const g = keep(nodes, ctx.createGain());
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * level, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const p = keep(nodes, ctx.createStereoPanner()); p.pan.value = pan * 0.6;
    n.connect(bp).connect(g).connect(p).connect(bus); n.start(t, Math.random()); n.stop(t + d + 0.05);
    const k = keep(nodes, ctx.createOscillator()); k.type = 'sine'; k.frequency.setValueAtTime(120, t); k.frequency.exponentialRampToValueAtTime(50, t + 0.05);
    const kg = keep(nodes, ctx.createGain()); kg.gain.setValueAtTime(0.25 * level, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    k.connect(kg).connect(p); k.start(t); k.stop(t + 0.08);
    releaseAfter(n, nodes);
  }

  // A pass: band-passed noise that swells as the rock closes, peaks at the
  // crossing, then drops away, panned to the side it passes on. Pitch rises on
  // approach and falls after, a cheap Doppler.
  function whoosh(pan, intensity, lead) {
    if (!bus) return;
    const ctx = a.ctx;
    const t0 = ctx.currentTime;
    const tp = t0 + lead;
    const src = ctx.createBufferSource(); src.buffer = a.noise;
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
    src.connect(bp).connect(g).connect(p).connect(bus);
    src.start(t0); src.stop(tp + 0.6);
  }

  function flyby(side, distance) {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const level = Math.max(0.08, 0.38 * (1 - distance / 160));
    const n = ctx.createBufferSource(); n.buffer = a.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(1300, t);
    bp.frequency.exponentialRampToValueAtTime(330, t + 0.52);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(side * 0.8, t);
    p.pan.linearRampToValueAtTime(side * 0.25, t + 0.5);
    n.connect(bp).connect(g).connect(p).connect(bus);
    n.start(t); n.stop(t + 0.6);
  }

  // Near miss confirm: a short bright tick that climbs with the chain
  function tick(chain) {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const f = 740 * Math.pow(2, (Math.min(chain, 6) * 3) / 12);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.2);
  }

  function daredevil() {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.04);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.04 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.04 + 0.7);
      o.connect(g).connect(bus); o.start(t + i * 0.04); o.stop(t + 1);
    });
  }

  function hit() {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(og).connect(bus); o.start(t); o.stop(t + 0.65);

    const n = ctx.createBufferSource(); n.buffer = a.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(180, t + 0.4);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.7, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    n.connect(lp).connect(ng).connect(bus); n.start(t); n.stop(t + 0.5);
  }

  function phase(duration) {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const f = a.musicFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(40, f.value), t);
    f.exponentialRampToValueAtTime(520, t + 0.06);
    f.setValueAtTime(520, t + duration);
    f.exponentialRampToValueAtTime(20000, t + duration + 0.5);

    // Reverse swell: noise rising into the phase
    const n = ctx.createBufferSource(); n.buffer = a.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.setValueAtTime(3000, t); hp.frequency.exponentialRampToValueAtTime(600, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.2);
    n.connect(hp).connect(g).connect(bus); n.start(t); n.stop(t + duration + 0.3);
  }

  // Geiger counter: random clicks whose rate follows radiation exposure (0..1)
  function geiger(level, dt) {
    if (!bus || level <= 0) return;
    const ctx = a.ctx;
    geigerDebt += (level * level * 55 + level * 6) * dt;
    while (geigerDebt > 0) {
      geigerDebt -= -Math.log(Math.random() + 1e-6);   // Poisson spacing
      const t = ctx.currentTime + Math.random() * dt;
      const n = ctx.createBufferSource(); n.buffer = a.noise;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);
      n.connect(hp).connect(g).connect(bus);
      n.start(t, Math.random()); n.stop(t + 0.01);
    }
  }

  // Two-tone alarm; call once per beat
  function alarm(urgent) {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const tones = urgent ? [880, 660] : [660, 520];
    tones.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const g = ctx.createGain();
      const s0 = t + i * 0.13;
      g.gain.setValueAtTime(0.0001, s0);
      g.gain.exponentialRampToValueAtTime(0.07, s0 + 0.01);
      g.gain.setValueAtTime(0.07, s0 + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.12);
      o.connect(lp).connect(g).connect(bus); o.start(s0); o.stop(s0 + 0.13);
    });
  }

  function repair() {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      const s0 = t + i * 0.055;
      g.gain.setValueAtTime(0.0001, s0);
      g.gain.exponentialRampToValueAtTime(0.14, s0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.9);
      o.connect(g).connect(bus); o.start(s0); o.stop(s0 + 1);
    });
  }

  // The ship's own roll: a quick corkscrew of air noise swept across the stereo field
  function roll(dir, duration) {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = a.noise;
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
    n.connect(bp).connect(g).connect(p).connect(bus);
    n.start(t); n.stop(t + duration + 0.2);
  }

  function death() {
    if (!bus) return;
    const ctx = a.ctx;
    hit();
    const t = ctx.currentTime;
    a.filterMusic(260, 1.2);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(30, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 2.5);
  }

  function revive() { a.filterMusic(20000, 1.5); }


  // Blaster shot: a bright saw zap with a fast pitch drop, panned to the barrel
  function laser(barrel) {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1500 + Math.random() * 120, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    const p = ctx.createStereoPanner(); p.pan.value = barrel ? 0.35 : -0.35;
    o.connect(lp).connect(g).connect(p).connect(bus);
    o.start(t); o.stop(t + 0.16);
  }

  // A bolt striking ice: short bright crack
  function impact(hard = false) {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = a.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hard ? 480 + Math.random() * 120 : 2400 + Math.random() * 800; bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    n.connect(bp).connect(g).connect(bus);
    n.start(t, Math.random()); n.stop(t + 0.1);
  }

  // A rock breaking up: a thump sized to the rock, plus crumbling grit
  function rockBreak(size) {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const k = Math.min(1, size / 3.5);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140 - k * 70, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.35);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.25 + k * 0.4, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(og).connect(bus); o.start(t); o.stop(t + 0.45);
    const n = ctx.createBufferSource(); n.buffer = a.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2 + k * 0.25, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    n.connect(lp).connect(ng).connect(bus); n.start(t, Math.random()); n.stop(t + 0.6);
  }

  function overheat() {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = a.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    n.connect(hp).connect(g).connect(bus); n.start(t); n.stop(t + 1);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 220;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.06, t); og.gain.setValueAtTime(0.0001, t + 0.08);
    og.gain.setValueAtTime(0.06, t + 0.14); og.gain.setValueAtTime(0.0001, t + 0.22);
    o.connect(og).connect(bus); o.start(t); o.stop(t + 0.25);
  }

  // PIP's voice: a burst of gliding blips. Mood shapes the contour.
  function chirp(mood = 'idle') {
    if (!bus) return;
    const ctx = a.ctx;
    const n = 3 + Math.floor(Math.random() * 3);
    let t = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const dur = 0.05 + Math.random() * 0.07;
      const base = mood === 'warn' ? 900 : mood === 'drive' ? 1300 : 1100;
      const f0 = base * Math.pow(2, (Math.random() * 14 - 7) / 12);
      const f1 = mood === 'warn' ? f0 * 0.7 : mood === 'drive' ? f0 * 1.5 : f0 * (0.8 + Math.random() * 0.6);
      const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const p = ctx.createStereoPanner(); p.pan.value = 0.4;          // PIP sits right of centre on the dash
      o.connect(g).connect(p).connect(bus); o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.015;
    }
  }

  // Throttle shapes the burn; turn onset and hard turns fire bounded thruster pulses
  function update(speed, turn = 0, pitch = 0) {
    if (!bus) return;
    const f = config.flight;
    const k = Math.max(0, Math.min(1, (speed - f.brakeSpeed) / (f.boostSpeed - f.brakeSpeed)));
    const t = a.ctx.currentTime;
    engineFilter.frequency.setTargetAtTime(180 + k * 520, t, 0.12);
    burnGain.gain.setTargetAtTime(0.3 + k * 0.9, t, 0.1);
    throbLfo.frequency.setTargetAtTime(6 + k * 8, t, 0.3);
    throbDepth.gain.setTargetAtTime(0.08 + k * 0.32, t, 0.2);
    engineOscs[0].detune.setTargetAtTime(k * 40, t, 0.4);          // the sub barely moves
    engineGain.gain.setTargetAtTime(config.audio.engine, t, 0.08);
    // Boost lights with a whump; braking fires the retros
    const boost = speed > f.cruiseSpeed + (f.boostSpeed - f.cruiseSpeed) * 0.35;
    const brake = speed < f.cruiseSpeed - (f.cruiseSpeed - f.brakeSpeed) * 0.35;
    if (boost && !wasBoost) ignite();
    if (brake && !wasBrake) rcs(0, 1, true);
    wasBoost = boost; wasBrake = brake;
    // Manoeuvring thrusters puff as a turn builds, and keep puffing in a hard one
    const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    rcsWait -= dt;
    const at = Math.min(1, Math.max(Math.abs(turn), Math.abs(pitch)));
    const side = Math.abs(turn) >= Math.abs(pitch) ? Math.sign(turn) : 2 * Math.sign(pitch);
    // Hysteresis prevents small stick jitter retriggering; remember starts during cooldown.
    if (at < 0.2) { turnSide = 0; rcsPending = false; }
    else if (at > 0.3 && side !== turnSide) { turnSide = side; rcsPending = true; }
    if (rcsWait <= 0 && (rcsPending || (turnSide && at > 0.7))) {
      rcs(-Math.sign(turn), 0.5 + at * 0.5);
      rcsPending = false;
      rcsWait = at > 0.7 ? 0.65 : 0.4;
    }
  }

  // Hull grinding on canyon rock: a low scrape with a metal screech on top
  function scrape() {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = a.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(160, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    n.connect(lp).connect(g).connect(bus); n.start(t, Math.random()); n.stop(t + 0.6);
    const s = ctx.createBufferSource(); s.buffer = a.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.setValueAtTime(2100, t); bp.frequency.exponentialRampToValueAtTime(1300, t + 0.35);
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.35, t); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    s.connect(bp).connect(sg).connect(bus); s.start(t, Math.random()); s.stop(t + 0.45);
  }

  // A dead trigger: the jammer has the guns
  function jammed() {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.09);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + 0.12);
  }

  // Entering a settlement's dock limits: a two-note station chime
  function chime() {
    if (!bus) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    [[987.8, 0], [739.99, 0.32]].forEach(([f, dt]) => {
      for (const [mult, amp] of [[1, 0.14], [2.76, 0.03]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(amp, t + dt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 1.4);
        o.connect(g).connect(bus); o.start(t + dt); o.stop(t + dt + 1.5);
      }
    });
  }

  // The town's hum: air handlers and machinery, rising as you enter the canyon (level 0..1)
  function ambience(level) {
    if (!bus) return;
    const ctx = a.ctx;
    if (!amb) {
      const src = keep(loops, ctx.createBufferSource()); src.buffer = a.noise; src.loop = true;
      const bp = keep(loops, ctx.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = 340; bp.Q.value = 0.9;
      const hum = keep(loops, ctx.createOscillator()); hum.type = 'triangle'; hum.frequency.value = 110;
      const hg = keep(loops, ctx.createGain()); hg.gain.value = 0.12;
      amb = keep(loops, ctx.createGain()); amb.gain.value = 0;
      src.connect(bp).connect(amb); hum.connect(hg).connect(amb); amb.connect(bus);
      src.start(); hum.start();
    }
    amb.gain.setTargetAtTime(level * 0.3, ctx.currentTime, 0.5);
  }

  function silence() {
    if (engineGain) engineGain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.2);
    if (amb) amb.gain.setTargetAtTime(0, a.ctx.currentTime, 0.3);
  }

  return { start, dispose, get activeCount() { return active.size; }, whoosh, flyby, tick, daredevil, hit, phase, geiger, alarm, repair, roll, death, revive, laser, impact, rockBreak, overheat, chirp, update, silence, scrape, jammed, chime, ambience };
}
