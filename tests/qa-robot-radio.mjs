import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRobotRadio } from '../src/modes/belt-run/robotRadio.js';
import { makeConfig } from '../src/modes/belt-run/config.js';

const manifest = JSON.parse(await readFile(new URL('../public/audio/robot-radio/manifest.json', import.meta.url)));
const nodes = [];
const ctx = { currentTime: 0, state: 'running', decodeAudioData: async () => ({ duration: 0.9 }) };
for (const kind of ['BufferSource', 'Gain', 'StereoPanner']) ctx[`create${kind}`] = () => {
  const node = {
    outputs: 0, gain: {}, pan: {},
    connect(to) { this.outputs++; return to; },
    disconnect() { this.outputs = 0; },
    start() {}, stop() { this.stopped = true; },
  };
  nodes.push(node);
  return node;
};
let fetches = 0, allowed = true;
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  fetches++;
  return { ok: true, json: async () => manifest, arrayBuffer: async () => new ArrayBuffer(1), url };
};
const ducked = [], spoken = [];
const audio = { ctx, sfx: {}, muted: false, duckMusic: (...args) => ducked.push(args) };
const settings = { ...makeConfig().radio, chance: 0 };
const radio = createRobotRadio(audio, settings, {
  canSpeak: () => allowed, onPlay: (clip, speaker) => spoken.push([clip.id, speaker]),
});
const priority = { priority: true };
const finish = () => nodes.at(-3).onended();
try {
  assert.equal(radio.play('raiders-ahead', priority), false, 'no deferred warning before loading');
  assert.equal(await radio.prepare(), 10);
  await radio.prepare();
  assert.equal(fetches, 11, 'decoded assets are cached');
  assert.equal(radio.play('raiders-ahead'), false, 'routine chance can skip a clip');
  for (const blocked of ['muted', 'suspended', 'host']) {
    audio.muted = blocked === 'muted';
    ctx.state = blocked === 'suspended' ? 'suspended' : 'running';
    allowed = blocked !== 'host';
    assert.equal(radio.play('raiders-ahead', priority), false);
  }
  audio.muted = false; ctx.state = 'running'; allowed = true;
  assert(radio.play('raiders-ahead', priority));
  assert.equal(radio.play('hull-critical', priority), false, 'priority does not stack voices');
  finish();
  assert(nodes.every(node => node.outputs === 0), 'natural endings release the graph');
  assert.equal(radio.play('hull-critical', priority), false, 'priority obeys the shared cooldown');
  for (const id of ['hull-critical', 'zone-clear', 'target-down']) {
    ctx.currentTime += settings.cooldown;
    assert(radio.play(id, priority));
    finish();
  }
  ctx.currentTime += settings.cooldown;
  assert.equal(radio.play('watch-the-rocks', priority), false, 'four clips maximum');
  assert.equal(spoken.length, 4);
  assert.equal(ducked.length, 4);
  radio.reset();
  assert.equal(radio.loaded, 10);
  assert.equal(radio.history.length, 0);
  assert(radio.play('on-your-wing', { ...priority, speaker: 'Teo', pan: -0.4 }));
  finish();
  ctx.currentTime += settings.cooldown;
  assert.equal(radio.play('on-your-wing', priority), false, 'each phrase at most once per flight');
  assert(radio.play('hull-patched', priority));
  radio.stop();
  assert(nodes.at(-3).stopped);
  assert(nodes.every(node => node.outputs === 0), 'stop releases every node');
  ctx.currentTime += settings.cooldown;
  assert(radio.play('taking-fire', priority));
  radio.dispose();
  assert.equal(radio.loaded, 0);
  assert.equal(radio.play('zone-clear', priority), false);
  assert(nodes.every(node => node.outputs === 0), 'dispose releases every node');
  globalThis.fetch = async () => { throw new Error('offline'); };
  const offline = createRobotRadio(audio, settings);
  assert.equal(await offline.prepare(), 0, 'offline assets never break flight');
  offline.dispose();
  console.log('Radio loading, shared limits, priority, pause/mute, per-flight reset and node disposal passed.');
} finally {
  globalThis.fetch = originalFetch;
}
