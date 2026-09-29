# Heliopause Runner — project brief

Read this first. It is the hand-off for anyone (or any Claude) picking the project up cold.

## What it is

**Heliopause Runner** is a first-person starfighter smuggling and expansion game: arcade
spaceflight, tactical planning, ship management and light tycoon progression. The player starts with
a battered courier near the inner Kuiper Belt and pushes outward past pirates, customs and rival
smugglers toward alien space. Full design: `docs/GAME-DESIGN.md`. Plan: `docs/PRODUCTION-PLAN.md`.

The project began on 28 Sept 2026 as **Kuiper Blast 2**, a first-person rebuild of Rob Cawley's 2D
shooter Kuiper Blast (v1 on robcawley.com; source in `reference/v1/` and
`~/Documents/Website/kuiper-blast/`). The same day it became the flight core of Heliopause Runner.

## Where it stands

Phase 0 of the production plan, the flight prototype, is done in first form:

- A nimble arcade fighter: the stick sets turn rates, the ship flies where it points with a little
  drift, boost and brake, three barrel-roll charges, a phase drive with i-frames.
- A 3D belt: ~650 ambient rocks plus path rocks along your heading, GPU dust streaks, shader sky.
- Near misses with hit-stop, slow motion, chains; hits shatter rocks and damage the hull.
- The beacon lane (safe radius 30 m along -z): radiation outside builds slowly, harmless at first,
  then eats the hull. Guidance arrows, Geiger clicks, alarms, MICA lines. Repair gates inside.
  Death leads to a debrief screen.
- A live tuning panel (T) over every feel number.

Next: Rob plays the fighter build and judges it; then Phase 1, combat.

## How to run

Double-click `Play Prototype.command`, or `npm install` once then `npm run dev`, and open
http://localhost:5173. `?webgl` forces the WebGL2 fallback.

## Tech

Three.js r186 `WebGPURenderer` with TSL shaders (WebGPU, falls back to WebGL2), Vite 8, lil-gui.
Sound effects are synthesised with Web Audio; music is Rob's *Sidewinding*.

Layers: `src/engine/` (shared), `src/modes/belt-run/` (the flight prototype as one module),
`src/shell/` + `src/main.js` (the host). See `docs/INTEGRATION.md`.

## Rob's direction so far, in order

1. Start from a feel prototype with the latest browser rendering.
2. Too hard to dodge: the pilot needs real freedom to fly and a few barrel rolls. Straying from the
   path brings guidance arrows and radiation alarms; staying off too long can kill you, so it makes
   sense to stick near the path and repair.
3. Let pilots stay in radiation longer; even more freedom; it should feel like really flying a
   nimble, responsive, fun star fighter.
4. It will become part of a bigger game.
5. The bigger game is Heliopause Runner (design document supplied by Rob, 28 Sept).

## Open questions

See the end of `docs/PRODUCTION-PLAN.md`: the story spine (does the Orison / MICA story carry
over?), the pilot, tone, launch shape, funding.

## Gotchas

- **Rob's home folder is itself a git repository.** Always run git from inside
  `~/Desktop/Heliopause Runner` (it has its own repo). A `git add -A` from the wrong place would
  try to stage his whole home directory.
- Commit before each change set so there is always a step back.
- Headless browsers in a sandbox run this far too slowly to judge feel, and their WebGPU is flaky.
  Test logic there with `?webgl` and a thinned belt; judge feel only on Rob's Mac.
- The `walrus-deploy` skill is for Rob's other sites. robcawley.com deploys by manual Cyberduck
  upload. `npm run build` makes a portable `dist/`.
