# Kuiper Blast 2 — project brief

Read this first. It is the hand-off for anyone (or any Claude) picking the project up cold.

## What it is

A first-person, cockpit-view rebuild of **Kuiper Blast**, Rob Cawley's 2D vertical shooter
(v1 lives on robcawley.com; source in `reference/v1/` and at `~/Documents/Website/kuiper-blast/`).
Same belt, same Orison story (MICA the navigator, the beacon, the Drifters), seen from inside a
star fighter.

Kuiper Blast 2 is planned as **one component of a bigger game**. Keep the belt run a
self-contained mode (see `docs/INTEGRATION.md`).

## Where it stands (28 Sept 2026)

Stage 0, the feel prototype. No enemies or weapons yet. What exists:

- A nimble arcade fighter: the stick sets turn rates, the ship flies where it points with a little
  drift, boost and brake, three barrel-roll charges, a phase drive with i-frames.
- A 3D belt: ~650 ambient rocks plus path rocks along your heading, GPU dust streaks, shader sky.
- Near misses with hit-stop, slow motion, chains, Daredevil bonus; hits shatter rocks and damage
  the hull.
- The beacon lane (safe radius 30 m along -z): outside it radiation builds slowly, harmless at
  first, then eats the hull. Guidance arrows, Geiger clicks, alarms, MICA lines. Repair gates
  inside the lane, slow repair near its centre. Death leads to a debrief screen.
- A live tuning panel (T) over every feel number, with Copy values.

## How to run

Double-click `Play Prototype.command`, or `npm install` once then `npm run dev`, and open
http://localhost:5173. `?webgl` forces the WebGL2 fallback.

## Tech

Three.js r186 `WebGPURenderer` with TSL shaders (WebGPU, falls back to WebGL2), Vite 8, lil-gui.
All sound effects are synthesised with Web Audio; music is Rob's *Sidewinding*.

Layers: `src/engine/` (shared by any mode), `src/modes/belt-run/` (this game as one module),
`src/shell/` + `src/main.js` (title, pause, debrief; becomes the bigger game's host).

## Rob's direction so far, in order

1. Start from a feel prototype with the latest browser rendering.
2. Too hard to dodge: the pilot needs real freedom to fly and a few barrel rolls. Straying from the
   path should bring guidance arrows and radiation alarms; staying off too long can kill you, so it
   makes sense to stick near the path and repair.
3. Let pilots stay in radiation longer; even more freedom; it should feel like really flying a
   nimble, responsive, fun star fighter. (Done 28 Sept: rate-based turning, gentler radiation.)
4. It will become part of a bigger game. (Done 28 Sept: engine / mode / shell split.)

Design pillars and the reasoning are in `docs/DESIGN.md`; the plan is in `docs/ROADMAP.md`;
tuning history in `docs/FEEL-LOG.md`.

## Next up

- Rob to play the fighter build and judge turn rate, lane width and radiation timing.
- Then Stage 1: weapons (auto-fire from the cockpit, bolts with light and sound, breakable rocks).
- For the bigger game: a mission goal that ends a run (emit `complete`), and carry-over state.

## Gotchas

- **Rob's home folder is itself a git repository.** Always run git from inside
  `~/Desktop/Kuiper Blast 2` (it has its own repo). A `git add -A` run from the wrong place would
  try to stage his whole home directory.
- Commit before each change set so there is always a step back. History so far: first prototype;
  free flight and the lane; the fighter and the module split.
- Headless browsers in a sandbox run this far too slowly to judge feel, and their WebGPU is flaky.
  Test logic there with `?webgl` and a thinned belt; judge feel only on Rob's Mac.
- The `walrus-deploy` skill is for Rob's other sites. robcawley.com deploys by manual Cyberduck
  upload. `npm run build` makes a portable `dist/` for when it is time to ship.
