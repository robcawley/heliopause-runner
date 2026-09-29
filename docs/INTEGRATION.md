# Using a mode inside a bigger game

Kuiper Blast 2 is built as layers so the belt run can become one part of a larger game.

**engine/** is shared by the whole game and never knows about any particular mode:
`createEngine` (one WebGPU/WebGL2 renderer, resize, camera tracking), `createAudio` (the audio
context, music bus with a shared filter, sfx bus), `createInput` (stick plus actions, with
`dispose`), `createPost` (bloom, aberration, grade), `createEmitter` (events).

**modes/** holds self-contained game modes. Today there is one, `belt-run`. A mode owns its scene,
camera, input, HUD, sounds and rules, and talks to the outside world only through its API and its
events. Anything it needs from the host is passed in.

**shell/** and `main.js` are the host. In the bigger game this is the part that grows: menus,
saves, a map, story, and switching between modes.

## The Belt Run API

```js
import { createBeltRun } from './modes/belt-run/index.js';

const run = createBeltRun({
  engine,                         // from createEngine
  audio,                          // from createAudio (host calls audio.start() on a user gesture)
  hudParent: document.body,       // where the mode mounts its .belt-hud layer
  overrides: {                    // any part of modes/belt-run/config.js
    lane: { safeRadius: 40 },
    radiation: { riseRate: 3 },
  },
});

run.attract();                    // autopilot, no damage: for behind a menu
run.start();                      // a fresh flight (music on, HUD shown)
run.restart();                    // another flight after a death
run.pause(true);                  // and run.pause(false)
run.frame(realDt, nowSeconds);    // once per animation frame: simulates and renders
run.dispose();                    // tear everything down when leaving the mode

run.on('death', (stats) => {});   // { score, distance, laneProgress, time, nearMisses, bestChain, gates, hits, rolls, cause, laneOffset }
run.on('gate', ({ index, hull }) => {});
run.on('nearMiss', ({ chain, score }) => {});
run.on('hit', ({ hull }) => {});
run.on('request', (what) => {});  // 'pause' | 'mute' | 'tuning': the pilot asked, the host decides

run.config                        // the live config (the tuning panel edits this)
run.state                         // read-only view of the current run
run.stats()                       // the same shape as the death payload, at any time
```

## Things the bigger game will probably want next

- **An exit condition.** Today a run ends only in death. A mission would add a goal (reach the
  beacon at 5 km, survive 3 minutes) and emit `complete`. The lane's distance (`laneProgress`) is
  already tracked.
- **Carry-over state.** Hull, upgrades and score passed in through `overrides` on the way in, and
  read back from `stats()` on the way out.
- **A shared HUD font and palette.** The mode's HUD carries its own CSS variables on `.belt-hud`;
  the host can override them.
- **Floating origin.** The ship flies through a static world. Positions stay precise for tens of
  kilometres; a very long mission would recentre the world now and then.
