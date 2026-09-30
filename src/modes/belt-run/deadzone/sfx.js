// Dead Zone sounds, synthesised like the rest of the belt run. The zone has its own voice:
// the lane's clean hum drops out, a low beating drone and groaning metal come in, the
// music is smothered. Raider sounds are harsher and lower than the pilot's own guns, and
// every attack has a charge-up sound, panned to where it comes from.
export function createCombatSfx(a) {
  let bus = null, drone = null, rattle = null, tetherNode = null;

  function ensure() {
    if (bus || !a.ctx) return !!bus;
    bus = a.ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(a.sfx);
    return true;
  }
  const now = () => a.ctx.currentTime;
  function out(node, pan = 0) {
    if (!pan) { node.connect(bus); return; }
    const p = a.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p).connect(bus);
  }
  // One enveloped oscillator sweep
  function tone(type, f0, f1, dur, peak, { pan = 0, at = 0, attack = 0.005, filter = 0 } = {}) {
    if (!ensure()) return;
    const t = now() + at;
    const o = a.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o.connect(g);
    if (filter) { const f = a.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; n = g.connect(f); }
    out(n, pan);
    o.start(t); o.stop(t + dur + 0.05);
  }
  // One enveloped noise burst through a filter sweep
  function hiss(type, f0, f1, q, dur, peak, { pan = 0, at = 0, attack = 0.004 } = {}) {
    if (!ensure()) return;
    const t = now() + at;
    const src = a.ctx.createBufferSource(); src.buffer = a.noise;
    const f = a.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out(src.connect(f).connect(g), pan);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  // ---- The zone -----------------------------------------------------------------
  function beaconFail() {
    hiss('bandpass', 2600, 900, 2, 0.35, 0.16);
    tone('square', 880, 220, 0.3, 0.04, { at: 0.05 });
  }
  function zoneEnter() {
    tone('sine', 110, 28, 2.4, 0.9, { attack: 0.05 });
    tone('sawtooth', 220, 55, 1.8, 0.12, { filter: 600 });
    hiss('lowpass', 6000, 200, 0.7, 1.4, 0.35);
    hiss('bandpass', 400, 3000, 3, 1.2, 0.1, { at: 0.9, attack: 1 });
  }
  function ambience(level) {
    if (!ensure()) return;
    if (!drone) {
      const ctx = a.ctx;
      drone = ctx.createGain(); drone.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      for (const f of [43, 45.3, 86.5]) {
        const o = ctx.createOscillator(); o.type = f > 80 ? 'triangle' : 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = f > 80 ? 0.08 : 0.3;
        o.connect(g).connect(lp); o.start();
      }
      const src = ctx.createBufferSource(); src.buffer = a.noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 180; bp.Q.value = 3;
      const ng = ctx.createGain(); ng.gain.value = 0.18;
      src.connect(bp).connect(ng).connect(lp); src.start();
      lp.connect(drone).connect(bus);
    }
    drone.gain.setTargetAtTime(level * 0.55, now(), 0.8);
  }
  function creak(pan = 0) {
    const f = 60 + Math.random() * 90;
    tone('sawtooth', f, f * (0.6 + Math.random() * 0.3), 1.4 + Math.random(), 0.07, { pan, attack: 0.3, filter: 520 });
    hiss('bandpass', 300, 150, 8, 1.2, 0.05, { pan, attack: 0.4 });
  }
  function ping(pan = 0) {
    tone('sine', 1320, 1300, 0.9, 0.12, { pan });
    tone('sine', 1320, 1300, 0.9, 0.04, { pan: -pan, at: 0.3 });
  }
  function klaxon() {
    for (let i = 0; i < 2; i++) {
      tone('sawtooth', 520, 520, 0.34, 0.14, { at: i * 0.8, filter: 1800 });
      tone('sawtooth', 390, 390, 0.34, 0.14, { at: i * 0.8 + 0.38, filter: 1800 });
    }
  }
  function waveClear() { tone('triangle', 660, 660, 0.18, 0.12); tone('triangle', 990, 990, 0.3, 0.12, { at: 0.12 }); }
  function bossHorn() {
    tone('sawtooth', 58, 52, 2.2, 0.35, { attack: 0.25, filter: 400 });
    tone('sawtooth', 87, 78, 2.2, 0.2, { attack: 0.3, filter: 500 });
    hiss('lowpass', 900, 150, 1, 2, 0.2, { attack: 0.5 });
  }
  function victory() {
    [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.9 - i * 0.1, 0.14, { at: i * 0.11 }));
    tone('sine', 262, 262, 1.8, 0.18, { at: 0.44, attack: 0.1 });
  }
  function relight() {
    for (let i = 0; i < 5; i++) tone('sine', 700 + i * 140, 700 + i * 140, 0.25, 0.07, { at: i * 0.16 });
    hiss('highpass', 4000, 9000, 1, 0.8, 0.05, { attack: 0.3 });
  }

  // ---- Raiders ------------------------------------------------------------------
  function emerge(pan, gain = 1, big = false) {
    hiss('bandpass', 1800, 300, 2, 0.5, 0.28 * gain, { pan });
    tone('sawtooth', big ? 180 : 420, big ? 40 : 90, big ? 1.2 : 0.5, 0.12 * gain, { pan, filter: 2400 });
    tone('square', big ? 90 : 160, big ? 60 : 120, 0.35, 0.06 * gain, { pan, at: 0.08, filter: 900 });
  }
  function charge(kind, pan, gain = 1, dur = 1) {
    const g = 0.5 + 0.5 * gain;
    if (kind === 'burst') tone('square', 300, 1700, dur, 0.05 * g, { pan, attack: dur * 0.8, filter: 3000 });
    else if (kind === 'lance') {
      const beeps = Math.max(3, Math.round(dur * 7));
      for (let i = 0; i < beeps; i++) tone('square', 1400, 1400, 0.05, 0.05 * g, { pan, at: dur * Math.pow(i / beeps, 0.7) });
      tone('square', 1900, 1900, 0.28, 0.07 * g, { pan, at: dur - 0.28 });
    } else if (kind === 'orb' || kind === 'volley') {
      tone('sine', 70, 240, dur, 0.22 * g, { pan, attack: dur * 0.9 });
      hiss('bandpass', 200, 1200, 4, dur, 0.08 * g, { pan, attack: dur * 0.9 });
    } else if (kind === 'claw') {
      tone('sawtooth', 120, 600, dur, 0.06 * g, { pan, attack: dur * 0.8, filter: 1400 });
      tone('sine', 9, 30, dur, 0.001, { pan });
      for (let i = 0; i < 4; i++) tone('triangle', 800, 500, 0.12, 0.04 * g, { pan, at: (dur * i) / 4 });
    }
  }
  function enemyShot(kind, pan, gain = 1) {
    if (kind === 'bolt') tone('sawtooth', 980, 180, 0.13, 0.09 * gain, { pan, filter: 2600 });
    else if (kind === 'lance') { tone('square', 1500, 300, 0.1, 0.07 * gain, { pan, filter: 3400 }); hiss('highpass', 3000, 2000, 1, 0.08, 0.05 * gain, { pan }); }
    else if (kind === 'orb') { tone('sine', 160, 45, 0.6, 0.35 * gain, { pan }); hiss('lowpass', 1200, 200, 1, 0.5, 0.15 * gain, { pan }); }
    else if (kind === 'claw') { tone('square', 200, 90, 0.2, 0.1 * gain, { pan, filter: 1200 }); hiss('bandpass', 2400, 600, 3, 0.25, 0.1 * gain, { pan }); }
  }
  function armorHit(pan, gain = 1) { tone('square', 420 + Math.random() * 200, 160, 0.07, 0.07 * gain, { pan, filter: 2600 }); hiss('bandpass', 3200, 1800, 2, 0.06, 0.06 * gain, { pan }); }
  function plate(pan, gain = 1) { tone('triangle', 900, 300, 0.25, 0.1 * gain, { pan }); hiss('highpass', 5000, 2000, 1, 0.3, 0.06 * gain, { pan }); }
  function shieldHit(pan, gain = 1) { tone('sine', 1800 + Math.random() * 400, 900, 0.14, 0.07 * gain, { pan }); }
  function shieldBreak(pan, gain = 1) {
    tone('sine', 2400, 200, 0.5, 0.15 * gain, { pan });
    hiss('highpass', 7000, 1500, 1, 0.6, 0.18 * gain, { pan });
  }
  function shieldUp(pan, gain = 1) { tone('sine', 300, 1600, 0.45, 0.06 * gain, { pan, attack: 0.3 }); }
  // size: 0.8 small .. 3 boss
  function explode(size, pan, gain = 1) {
    const k = Math.min(1, size / 3);
    tone('sine', 120 - k * 70, 24, 0.5 + k * 1.2, (0.4 + k * 0.6) * gain, { pan: pan * 0.7 });
    hiss('lowpass', 5000, 120, 0.8, 0.5 + k * 1.3, (0.3 + k * 0.4) * gain, { pan: pan * 0.7 });
    hiss('bandpass', 1800, 400, 1.5, 0.25, 0.15 * gain, { pan, at: 0.03 });
    if (size > 1.5) hiss('lowpass', 2500, 80, 0.8, 1.6, 0.25 * gain, { pan: pan * 0.5, at: 0.15 });
  }

  // ---- The pilot's side -----------------------------------------------------------
  function grappleLatch() {
    tone('square', 140, 60, 0.25, 0.25, { filter: 900 });
    hiss('bandpass', 1500, 400, 2, 0.3, 0.25);
  }
  function tether(on, strain = 0) {
    if (!ensure()) return;
    if (!tetherNode) {
      const ctx = a.ctx;
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 11;
      const lg = ctx.createGain(); lg.gain.value = 18;
      lfo.connect(lg).connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 6;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(f).connect(g).connect(bus);
      o.start(); lfo.start();
      tetherNode = { g, f, o };
    }
    tetherNode.g.gain.setTargetAtTime(on ? 0.16 : 0, now(), 0.05);
    tetherNode.f.frequency.setTargetAtTime(500 + strain * 1400, now(), 0.05);
    tetherNode.o.frequency.setTargetAtTime(55 + strain * 40, now(), 0.05);
  }
  function tetherSnap() {
    tone('square', 900, 90, 0.3, 0.16, { filter: 3000 });
    hiss('highpass', 6000, 1500, 1, 0.35, 0.2);
  }
  function wreckHit(strength) {
    const k = Math.min(1, strength);
    tone('sine', 80, 30, 0.5, 0.3 + k * 0.5);
    hiss('lowpass', 2200, 200, 1, 0.4, 0.2 + k * 0.3);
    tone('triangle', 240, 160, 0.6, 0.08 * k, { at: 0.05 });
  }
  function scrape(level) {
    if (!ensure()) return;
    if (!rattle) {
      const src = a.ctx.createBufferSource(); src.buffer = a.noise; src.loop = true;
      const f = a.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 2.5;
      rattle = a.ctx.createGain(); rattle.gain.value = 0;
      src.connect(f).connect(rattle).connect(bus); src.start();
    }
    rattle.gain.setTargetAtTime(level * 0.16, now(), 0.08);
  }
  function coilCharge(pan, gain) { tone('sine', 50, 420, 1.7, 0.18 * gain, { pan, attack: 1.5 }); hiss('bandpass', 300, 2600, 6, 1.7, 0.06 * gain, { pan, attack: 1.5 }); }
  function coilPulse(pan, gain) { tone('sine', 220, 30, 0.8, 0.45 * gain, { pan }); hiss('lowpass', 4000, 150, 1, 0.7, 0.3 * gain, { pan }); }
  function arcWarn(pan, gain) { for (let i = 0; i < 4; i++) hiss('highpass', 5000, 3000, 1, 0.05, 0.08 * gain, { pan, at: i * 0.2 + Math.random() * 0.1 }); }
  function arcOn(pan, gain) { hiss('bandpass', 3000, 1200, 1.2, 0.5, 0.14 * gain, { pan }); tone('sawtooth', 120, 118, 0.6, 0.06 * gain, { pan, filter: 1500 }); }
  function zap() { hiss('highpass', 6000, 1200, 1, 0.3, 0.3); tone('square', 1200, 80, 0.3, 0.12); }

  function silence() {
    if (!bus) return;
    drone?.gain.setTargetAtTime(0, now(), 0.3);
    rattle?.gain.setTargetAtTime(0, now(), 0.1);
    tetherNode?.g.gain.setTargetAtTime(0, now(), 0.05);
  }

  return {
    beaconFail, zoneEnter, ambience, creak, ping, klaxon, waveClear, bossHorn, victory, relight,
    emerge, charge, enemyShot, armorHit, plate, shieldHit, shieldBreak, shieldUp, explode,
    grappleLatch, tether, tetherSnap, wreckHit, scrape, coilCharge, coilPulse, arcWarn, arcOn, zap, silence,
  };
}
