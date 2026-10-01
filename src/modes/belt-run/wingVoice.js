// Your wing's radio: bleeps, and a vocoder voice that follows the vowels of what they say.
// All synthesised. A buzzy carrier at the speaker's pitch is shaped by three formant filters
// that jump from vowel to vowel, ring-modulated for the robot edge, then squeezed through a
// radio band with a squelch blip in and out. Each crew member has a pitch and a formant shift.
//
// voice: { pitch (Hz), formant (scale), pan (-1..1) }

const VOWELS = { a: [760, 1250, 2500], e: [430, 1900, 2550], i: [300, 2250, 3000], o: [520, 900, 2400], u: [340, 820, 2300], y: [320, 2000, 2800] };

export function createWingVoice(a) {
  let busy = 0;

  function radioChain(ctx, pan, level) {
    const out = ctx.createGain(); out.gain.value = level;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 330;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3300;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    out.connect(hp).connect(lp).connect(p).connect(a.sfx);
    return out;
  }

  function blip(ctx, dest, t, f1, f2, d, level = 0.22) {
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(dest); o.start(t); o.stop(t + d + 0.02);
  }

  function squelch(ctx, dest, t, d) {
    const n = ctx.createBufferSource(); n.buffer = a.noise;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(g).connect(dest); n.start(t, Math.random()); n.stop(t + d + 0.02);
  }

  // Speak a line: one "syllable" per vowel group, at about 11 a second
  function talk(v, text) {
    const ctx = a.ctx;
    if (!ctx || !a.sfx) return;
    const now = ctx.currentTime;
    const t0 = Math.max(now, busy) + 0.03;
    const out = radioChain(ctx, v.pan ?? 0, 0.5);
    blip(ctx, out, t0, 1500, 1900, 0.05);
    blip(ctx, out, t0 + 0.06, 2100, 2100, 0.04, 0.16);
    const sylls = (text.toLowerCase().match(/[^aeiouy\s]*[aeiouy]+/g) ?? ['a']).slice(0, 18);
    const step = 0.085;
    let t = t0 + 0.14;
    // Carrier: saw plus a detuned square, ring-modulated
    const car = ctx.createOscillator(); car.type = 'sawtooth';
    const car2 = ctx.createOscillator(); car2.type = 'square'; car2.detune.value = 9;
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    car.connect(mix); car2.connect(mix);
    const ring = ctx.createGain(); ring.gain.value = 0;
    const ringOsc = ctx.createOscillator(); ringOsc.frequency.value = 46 + (v.pitch % 30);
    const ringDepth = ctx.createGain(); ringDepth.gain.value = 0.6;
    ringOsc.connect(ringDepth).connect(ring.gain);
    const dc = ctx.createConstantSource(); dc.offset.value = 0.4; dc.connect(ring.gain);
    mix.connect(ring);
    const env = ctx.createGain(); env.gain.value = 0.0001;
    const formants = [0, 1, 2].map((k) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [7, 10, 12][k];
      const g = ctx.createGain(); g.gain.value = [1.6, 1.1, 0.6][k];
      ring.connect(f).connect(g).connect(env);
      return f;
    });
    env.connect(out);
    for (const [i, s] of sylls.entries()) {
      const vowel = VOWELS[s.slice(-1)] ?? VOWELS.a;
      const d = step * (0.8 + Math.random() * 0.5) * (s.length > 3 ? 1.3 : 1);
      const contour = 1 + 0.12 * Math.sin(i * 1.7) - (i === sylls.length - 1 ? 0.15 : 0);
      car.frequency.setValueAtTime(v.pitch * contour, t);
      car2.frequency.setValueAtTime(v.pitch * contour, t);
      formants.forEach((f, k) => f.frequency.setTargetAtTime(vowel[k] * v.formant, t, 0.012));
      env.gain.setTargetAtTime(0.9, t, 0.008);
      env.gain.setTargetAtTime(0.0001, t + d * 0.75, 0.012);
      if (/^[^aeiouy]/.test(s)) squelch(ctx, out, t, 0.025);    // a consonant tick
      t += d + (i % 4 === 3 ? 0.05 : 0.012);
    }
    for (const o of [car, car2, ringOsc, dc]) { o.start(t0); o.stop(t + 0.1); }
    squelch(ctx, out, t + 0.02, 0.09);
    blip(ctx, out, t + 0.04, 1300, 1100, 0.05, 0.16);
    busy = t + 0.15;
  }

  // A wing blaster: a short bright zap, quieter than yours
  function pew(pan, gain) {
    const ctx = a.ctx;
    if (!ctx || !a.sfx) return;
    const t = ctx.currentTime;
    const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(a.sfx);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1600 + Math.random() * 300, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.11);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.09 * gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(p); o.start(t); o.stop(t + 0.13);
  }

  // A wing fighter breaking up
  function boom(pan, gain) {
    const ctx = a.ctx;
    if (!ctx || !a.sfx) return;
    const t = ctx.currentTime;
    const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(a.sfx);
    const n = ctx.createBufferSource(); n.buffer = a.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    n.connect(lp).connect(g).connect(p); n.start(t, Math.random()); n.stop(t + 1.55);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.7 * gain, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(og).connect(p); o.start(t); o.stop(t + 0.75);
  }

  return { talk, pew, boom };
}
