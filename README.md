# Kuiper Blast 2

A first-person rebuild of [Kuiper Blast](https://robcawley.com/kuiper-blast/): the same belt, the same
Orison story, seen from inside the cockpit.

**Current stage: 0, the feel prototype.** No enemies, no weapons. A cockpit, the belt, free flight
with barrel rolls, near misses, the phase drive, the beacon lane (radiation outside it, repair beacons
inside), hull damage and death, and a tuning panel. The only question this stage answers: is flying through the belt
fun for thirty seconds on its own?

## Run it

Double-click **Play Prototype.command**, or in Terminal:

```
cd ~/Desktop/"Kuiper Blast 2"
npm install      # first time only
npm run dev
```

Then open http://localhost:5173. The dev server also prints a Network address: open that on a phone
on the same Wi-Fi to test touch.

Add `?webgl` to the URL to force the WebGL2 fallback and compare it with WebGPU.

`npm run build` makes a static `dist/` folder that can be uploaded anywhere, including a subfolder of
robcawley.com. Not doing that yet.

## Controls

| | |
|---|---|
| Fly | Mouse (distance from centre is the stick), WASD / arrows, gamepad left stick, thumb-stick on touch |
| Barrel roll | Q / E, double-tap a direction key, gamepad LB / RB, Roll buttons (touch). Three charges. |
| Phase drive | Space, second finger, the Phase button (touch), gamepad A |
| Boost | Shift, gamepad right trigger |
| Tuning panel | T |
| Mute / pause | M / P or Esc |

## Where things live

```
index.html              page shell, title and pause screens
src/
  main.js               game loop, the feel rules (near miss, hits, phase, time)
  config.js             every tunable number, one place
  styles.css            HUD and title styling
  core/                 renderer boot (WebGPU with WebGL2 fallback), input
  flight/               ship spring model, camera rig (head lag, trauma, FOV)
  world/                sky shader, GPU dust, asteroid field, hit shards, beacon lane + repair gates
  cockpit/              greybox cockpit and dash instruments
  fx/                   post-processing (bloom, aberration, phase grade, grain)
  audio/                music bus and synthesised sound effects
  ui/                   HUD overlay, tuning panel
  assets/audio/         Sidewinding.mp3
docs/
  DESIGN.md             pillars and the reasoning behind them
  ROADMAP.md            stages from here to a finished game
  FEEL-LOG.md           dated notes from each tuning session
reference/v1/           the original 2D game, read-only, for porting
```

## Tech

Three.js r186 with `WebGPURenderer` and TSL (three's node shading language), built with Vite 8.
All shaders are written in TSL, so the same code runs on WebGPU and WebGL2.
