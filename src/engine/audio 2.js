// The game's audio graph. The engine owns the context and the buses; each
// mode builds its own sound effects on top (see modes/belt-run/sfx.js).
//
//   master <- compressor <- music (element -> low-pass filter -> gain)
//                        <- sfx bus (modes connect here)
//
// The music filter is shared so any mode can "go underwater".
export function createAudio(levels) {
  const a = {
    ctx: null, sfx: null, musicFilter: null, noise: null,
    muted: false,
  };
  let master, musicGain, musicEl = null, musicNode = null;

  a.start = () => {
    if (a.ctx) return a.ctx.resume();
    const ctx = (a.ctx = new AudioContext());
    master = ctx.createGain();
    master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    comp.connect(master);

    a.musicFilter = ctx.createBiquadFilter();
    a.musicFilter.type = 'lowpass'; a.musicFilter.frequency.value = 20000; a.musicFilter.Q.value = 0.7;
    musicGain = ctx.createGain();
    a.musicFilter.connect(musicGain).connect(comp);

    a.sfx = ctx.createGain();
    a.sfx.connect(comp);

    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    a.noise = b;
    a.update();
    return ctx.resume();
  };

  a.playMusic = (url) => {
    if (!a.ctx) return;
    if (!musicEl) {
      musicEl = new Audio();
      musicEl.loop = true;
      musicNode = a.ctx.createMediaElementSource(musicEl);
      musicNode.connect(a.musicFilter);
    }
    if (musicEl.src !== new URL(url, location.href).href) musicEl.src = url;
    musicEl.play().catch(() => {});
  };

  // Sweep the music filter: to a cutoff over `time` seconds
  a.filterMusic = (hz, time = 0.3) => {
    if (!a.ctx) return;
    const t = a.ctx.currentTime, f = a.musicFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(40, f.value), t);
    f.exponentialRampToValueAtTime(hz, t + time);
  };

  a.update = () => {
    if (!a.ctx) return;
    const t = a.ctx.currentTime;
    musicGain.gain.setTargetAtTime(a.muted ? 0 : levels.music, t, 0.05);
    a.sfx.gain.setTargetAtTime(a.muted ? 0 : levels.sfx, t, 0.05);
  };

  a.toggleMute = () => { a.muted = !a.muted; return a.muted; };
  a.suspend = () => { a.ctx?.suspend(); musicEl?.pause(); };
  a.resume = () => { a.ctx?.resume(); musicEl?.play().catch(() => {}); };

  return a;
}
