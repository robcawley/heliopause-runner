# Kuiper Blast 2

A first-person rebuild of [Kuiper Blast](https://robcawley.com/kuiper-blast/): the same belt, the same
Orison story, seen from inside the cockpit.

**Current stage: 0, the feel prototype.** No enemies, no weapons. A cockpit, a nimble fighter that
turns and flies where it points, barrel rolls, near misses, the phase drive, the beacon lane (slow
radiation outside it, repair beacons inside), hull damage and death, and a tuning panel. The only question this stage answers: is flying through the belt
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
| Turn and pitch | Mouse (distance from centre is how hard you turn), WASD / arrows, gamepad left stick, thumb-stick on touch |
| Barrel roll | Q / E, double-tap A or D, gamepad LB / RB, Roll buttons (touch). Three charges. |
| Boost / brake | Shift / X or Ctrl, gamepad right / left trigger |
| Phase drive | Space, second finger, the Phase button (touch), gamepad A |
| Tuning panel | T |
| Mute / pause | M / P or Esc |

Pitch is not inverted by default. Flight-sim players can flip it in the tuning panel (Flight, invert pitch).

## Where things live

The code is split so the belt run can drop into a bigger game as one piece. See
`docs/INTEGRATION.md`.

```
index.html                  page shell: title, pause and debrief screens
src/
  main.js                   the host shell: screens, loop, and one mode
  shell/                    host-only UI: shell.css, tuning panel
  engine/                   shared by every mode: renderer, input, audio graph, post-processing, events
  modes/belt-run/           the belt run, self-contained
    index.js                the mode: createBeltRun() and all the rules
    config.js               every tunable number for this mode
    ship.js                 the fighter's flight model
    cameraRig.js            head lag, look-into-turn, trauma, FOV
    cockpit.js              greybox cockpit and dash instruments
    sky.js dust.js rocks.js shards.js lane.js   the world
    sfx.js                  synthesised sound effects
    hud.js hud.css          the mode's HUD, scoped to .belt-hud
    assets/audio/           Sidewinding.mp3
docs/
  DESIGN.md                 pillars and how the feel is built
  INTEGRATION.md            how a host game uses a mode
  ROADMAP.md                stages from here to a finished game
  FEEL-LOG.md               dated notes from each tuning session
reference/v1/               the original 2D game, read-only, for porting
```

## Tech

Three.js r186 with `WebGPURenderer` and TSL (three's node shading language), built with Vite 8.
All shaders are written in TSL, so the same code runs on WebGPU and WebGL2.
