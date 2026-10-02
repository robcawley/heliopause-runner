import assert from 'node:assert/strict';
import { createWingVoice } from '../src/modes/belt-run/wingVoice.js';
import { createSfx } from '../src/modes/belt-run/sfx.js';
import { makeConfig } from '../src/modes/belt-run/config.js';
// Model scheduled source endings and connections to verify the whole graph is released.
const nodes = [];
const param = () => ({ value: 0, setValueAtTime() {
}
, exponentialRampToValueAtTime() {
}
, setTargetAtTime() {
}
});
const ctx = { currentTime: 0 };
for (const name of ['Gain', 'Oscillator', 'BufferSource', 'BiquadFilter', 'StereoPanner', 'ConstantSource', 'WaveShaper'])ctx['create' + name] = () => {
  const n = { outputs: 0, source: ['Oscillator', 'BufferSource', 'ConstantSource'].includes(name), gain: param(), frequency: param(), detune: param(), pan: param(), offset: param(), playbackRate: param(), Q: param(), connect(dest) {
    this.outputs++;
    return dest
  }
  , disconnect() {
    this.outputs = 0
  }
  , start() {
  }
  , stop(t = ctx.currentTime) {
    this.end = t
  }
  };
  nodes.push(n);
  return n;

}
;
function advance(t) {
  ctx.currentTime = t;
  for (const n of nodes) if (n.end <= t && !n.ended) {
    n.ended = true;
    n.onended?.()
  }
}
const a = { ctx, sfx: {}, noise: {} };
const voice = createWingVoice(a);
for (let i = 0; i < 50; i++) {
  voice.pew(0, 1);
  voice.talk({ pitch: 150, formant: 1 }, 'On your wing.');
  voice.boom(0, 1);
  advance(ctx.currentTime + 3)
}
assert.equal(voice.activeCount, 0);
assert(nodes.every(n => n.outputs === 0));
voice.talk({ pitch: 150, formant: 1 }, 'Engaging.');
voice.reset();
assert(nodes.every(n => n.outputs === 0));
const sfx = createSfx(a, makeConfig());
sfx.start();
let before = nodes.length;
sfx.update(70, 0);
sfx.update(70, 0.5);
assert(nodes.length > before, 'turn start fires');
before = nodes.length;
advance(ctx.currentTime + 0.1);
sfx.update(70, 0.5);
assert.equal(nodes.length, before, 'held moderate turn does not machine-gun');
for (let i = 0; i < 5; i++) {
  advance(ctx.currentTime + 0.1);
  sfx.update(70, 0)
}
before = nodes.length;
sfx.update(70, 0, 0.8);
assert(nodes.length > before, 'pitch turn fires');
before = nodes.length;
advance(ctx.currentTime + 0.3);
sfx.update(70, 0, 0.8);
assert.equal(nodes.length, before);
advance(ctx.currentTime + 0.4);
// update caps delta to 0.1: feed the actual frame cadence.
for (let i = 0; i < 8; i++) {
  advance(ctx.currentTime + 0.1);
  sfx.update(70, 0, 0.8)
}
assert(nodes.length > before, 'hard turn repeats');
sfx.ambience(1);
sfx.dispose();
assert(nodes.every(n => n.outputs === 0));
assert(nodes.filter(n => n.source).every(n => n.end !== undefined));
console.log('50 radio/pew/explosion cycles released; RCS onset, cooldown, pitch, repeats and loop disposal passed.');
