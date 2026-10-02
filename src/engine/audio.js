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
  let master, musicGain, musicFade, musicDuck, musicEl = null, musicNode = null;
  let playlist = [], bag = [], lastMusic = null, musicSwitch = null, musicVersion = 0, suspended = false;

  a.start = () => {
    if (a.ctx) return a.resume();
    const ctx = (a.ctx = new AudioContext());
    master = ctx.createGain();
    master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    comp.connect(master);

    a.musicFilter = ctx.createBiquadFilter();
    a.musicFilter.type = 'lowpass'; a.musicFilter.frequency.value = 20000; a.musicFilter.Q.value = 0.7;
    musicGain = ctx.createGain();
    musicFade = ctx.createGain();
    musicDuck = ctx.createGain();
    a.musicFilter.connect(musicFade).connect(musicDuck).connect(musicGain).connect(comp);

    a.sfx = ctx.createGain();
    a.sfx.connect(comp);

    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    a.noise = b;
    a.update();
    return ctx.resume();
  };

  a.playMusic = (urls) => {
    if (!a.ctx) return;
    const tracks = [...new Set((Array.isArray(urls) ? urls : [urls]).map((url) => new URL(url, location.href).href))];
    if (!tracks.length) return;
    if (tracks.length !== playlist.length || tracks.some((url, i) => url !== playlist[i])) {
      playlist = tracks;
      bag = [];
    }
    if (!bag.length) {
      bag = [...playlist];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // A fresh shuffle must not start with the track that just finished.
      if (bag.length > 1 && bag[bag.length - 1] === lastMusic) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    const url = bag.pop();
    if (!musicEl) {
      musicEl = new Audio();
      musicEl.preload = 'auto';
      musicEl.addEventListener('ended', () => a.playMusic(playlist));
      musicNode = a.ctx.createMediaElementSource(musicEl);
      musicNode.connect(a.musicFilter);
    }
    if (musicEl.src === url && !musicEl.ended) return;
    lastMusic = url;
    const version = ++musicVersion;
    clearTimeout(musicSwitch);
    const play = () => {
      musicSwitch = null;
      musicEl.src = url;
      musicEl.loop = playlist.length === 1;
      if (suspended) return;
      musicEl.play().then(() => {
        if (version === musicVersion) musicFade.gain.setTargetAtTime(1, a.ctx.currentTime, 0.15);
      }).catch(() => {});
    };
    // Use a separate fade gain so volume updates and the ending's hush do not fight it.
    const t = a.ctx.currentTime;
    musicFade.gain.cancelScheduledValues(t);
    musicFade.gain.setValueAtTime(musicFade.gain.value, t);
    if (musicEl.src && !musicEl.paused) {
      musicFade.gain.linearRampToValueAtTime(0, t + 0.3);
      musicSwitch = setTimeout(play, 320);
    } else {
      musicFade.gain.setValueAtTime(0, t);
      play();
    }
  };

  a.duckMusic = (level, seconds, attack = 0.04, release = 0.3) => {
    if (!a.ctx) return;
    const t = a.ctx.currentTime, gain = musicDuck.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(level, t + attack);
    gain.setValueAtTime(level, t + Math.max(attack, seconds));
    gain.linearRampToValueAtTime(1, t + Math.max(attack, seconds) + release);
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
  a.suspend = () => { suspended = true; a.ctx?.suspend(); musicEl?.pause(); };
  a.resume = () => {
    suspended = false;
    const resumed = a.ctx?.resume();
    if (musicEl?.src) musicEl.play().then(() => musicFade.gain.setTargetAtTime(1, a.ctx.currentTime, 0.15)).catch(() => {});
    return resumed;
  };
  a.dispose = () => {
    musicVersion++;
    clearTimeout(musicSwitch);
    musicEl?.pause();
    musicNode?.disconnect();
    return a.ctx?.close();
  };
  Object.defineProperty(a, 'music', { get: () => ({ url: lastMusic, tracks: [...playlist], paused: musicEl?.paused ?? true }) });

  return a;
}
