// Short recorded callouts share one budget across PIP and the wing. Never queue a warning:
// by the time another voice finishes, the rock or raider that caused it may already be gone.
export function createRobotRadio(audio, settings, host = {}) {
  const base = `${import.meta.env?.BASE_URL ?? '/'}audio/robot-radio/`;
  const clips = new Map(), used = new Set();
  const controller = new AbortController();
  let prepared = null, active = null, nextAt = 0, count = 0, disposed = false;
  let history = [];

  function prepare() {
    if (!audio.ctx || disposed) return Promise.resolve(0);
    if (prepared) return prepared;
    const context = audio.ctx;
    prepared = (async () => {
      const response = await fetch(`${base}manifest.json`, { signal: controller.signal });
      if (!response.ok) throw new Error('Radio manifest unavailable');
      const manifest = await response.json();
      await Promise.all(manifest.clips.map(async (clip) => {
        try {
          const file = await fetch(`${base}${clip.file}`, { signal: controller.signal });
          if (!file.ok) return;
          const buffer = await context.decodeAudioData(await file.arrayBuffer());
          if (!disposed && audio.ctx === context) clips.set(clip.id, { ...clip, buffer });
        } catch { /* a missing clip must never interrupt the flight */ }
      }));
      return clips.size;
    })().catch(() => { prepared = null; return 0; });
    return prepared;
  }

  function stop() {
    if (!active) return;
    const { source, nodes } = active;
    active = null;
    source.onended = null;
    try { source.stop(); } catch { /* already ended */ }
    nodes.forEach((node) => node.disconnect());
    audio.duckMusic?.(1, 0, settings.duckAttack, settings.duckRelease);
  }

  function reset() {
    stop();
    used.clear();
    nextAt = 0; count = 0; history = [];
  }

  function play(id, { speaker = 'PIP', pan = 0, priority = false } = {}) {
    const context = audio.ctx, clip = clips.get(id);
    if (disposed || !clip || !audio.sfx || context?.state !== 'running') return false;
    if (audio.muted || active || used.has(id) || count >= settings.maxPerTrip || context.currentTime < nextAt) return false;
    if (host.canSpeak && !host.canSpeak()) return false;
    if (!priority && Math.random() >= settings.chance) return false;
    const source = context.createBufferSource(); source.buffer = clip.buffer;
    const gain = context.createGain(); gain.gain.value = settings.level;
    const panner = context.createStereoPanner(); panner.pan.value = pan;
    const nodes = [source, gain, panner];
    source.connect(gain).connect(panner).connect(audio.sfx);
    source.onended = () => {
      nodes.forEach((node) => node.disconnect());
      if (active?.source === source) active = null;
    };
    active = { source, nodes };
    source.start();
    count++;
    used.add(id);
    nextAt = context.currentTime + settings.cooldown;
    history.push({ id, speaker, time: context.currentTime });
    audio.duckMusic?.(settings.duck, clip.buffer.duration, settings.duckAttack, settings.duckRelease);
    host.onPlay?.(clip, speaker);
    return clip;
  }

  return {
    prepare, play, reset, stop,
    dispose() { disposed = true; controller.abort(); stop(); clips.clear(); },
    get playing() { return !!active; },
    get loaded() { return clips.size; },
    get history() { return history.slice(); },
  };
}
