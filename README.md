# Heliopause Runner

A first-person starfighter smuggling and expansion game: arcade spaceflight, tactical planning,
ship management and light tycoon progression, set on the push outward past the heliopause.

- **The game:** `docs/GAME-DESIGN.md`
- **The plan:** `docs/PRODUCTION-PLAN.md`
- **Picking it up cold:** `PROJECT-BRIEF.md`

**Where it stands: Phase 0, the flight prototype.** The project began as Kuiper Blast 2, a
first-person rebuild of [Kuiper Blast](https://robcawley.com/kuiper-blast/), and that work is now
the game's flight core: a nimble fighter with full freedom (loop, roll, turn right round), barrel rolls, near
misses, the phase drive, and the beacon lane (slow radiation outside it, repair beacons inside),
hull damage and death, with a tuning panel over every number.

## Run it

Double-click **Play Prototype.command**, or in Terminal:

```
cd ~/Desktop/"Heliopause Runner"
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
| Turn and pitch | Mouse (click the view to capture it; it eases back to centre on its own), WASD / arrows, gamepad left stick, thumb-stick on touch |
| Fire blasters | Left click, F, gamepad right trigger, Fire button (touch) |
| PIP (fly me home) | R, gamepad Y, PIP button (touch). Press again or push the stick hard to take over. |
| Roll | Hold Q / E, gamepad LB / RB. Let go and the wings ease back to level (tunable). |
| Barrel roll | Double-tap Q, E, A or D; double-tap a bumper; Roll buttons (touch). Three charges. |
| Boost / brake | Shift / X or Ctrl, gamepad X / left trigger |
| Phase drive | Space, second finger, the Phase button (touch), gamepad A |
| Tuning panel | T |
| Mute / pause | M / P or Esc (Esc also releases the mouse) |

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
  DESIGN.md                 flight pillars and how the feel is built
  INTEGRATION.md            how a host game uses a mode
  GAME-DESIGN.md            the whole game
  PRODUCTION-PLAN.md        phases and milestones from here to launch
  FEEL-LOG.md               dated notes from each tuning session
reference/v1/               the original 2D game, read-only, for porting
```

## Tech

Three.js r186 with `WebGPURenderer` and TSL (three's node shading language), built with Vite 8.
All shaders are written in TSL, so the same code runs on WebGPU and WebGL2.
