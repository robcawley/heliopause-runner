# Flight design

How the first-person flight and the belt run feel, and why. For the whole game, see
`GAME-DESIGN.md`; for the plan, `PRODUCTION-PLAN.md`.

## Pillars (working assumptions, confirm or overturn)

1. **Real flight, with a lane to come home to.** The ship is a nimble fighter: the stick turns it,
   it flies where it points, and you can turn right round. What keeps you near the path is the
   world, not a wall: the beacon lane shields you, and outside it radiation builds slowly. A short
   excursion is free; a long one becomes a decision; staying out for good kills you. Repair beacons
   sit inside the lane, so coming home is how you heal.
   (Revised 2026-09-29: the lane is now 160 m wide, an arena rather than a corridor, because attack
   ships are coming and the pilot needs room to turn and fight inside shelter. Revised 2026-09-28 twice: first the bounded frame was too tight to dodge in; then strafing in a
   corridor still did not feel like flying, and radiation was too punishing.)
2. **Feel first.** If an empty belt is not fun to fly through, nothing added on top will fix it.
3. **Near miss is the core verb.** In v1 it is a scoring bonus. In first person, a rock sliding past
   the canopy with a panned whoosh is the best moment in the game. Design toward it.
4. **Phase is felt from inside.** The world drains to a cold ghost, sound goes underwater, and rocks
   pass through you. Barrel rolls are a separate, physical dodge; `roll.cameraFollow` in the tuning
   panel lets the pilot's head stay partly level if full rolls feel queasy.
5. **The story lives in the cockpit.** MICA on comms, the Orison beacon on the dash, chapter texts as
   transmissions. The Drifters become the garden, drifting past the glass in quiet phases.
6. **Readability over spectacle.** Depth is hard to judge in first person. Threats must be big, lit,
   rimmed, and telegraphed.

## How the feel is built

- **Rate-based turning, full freedom.** The stick sets pitch and yaw *rates*, Q / E the roll rate,
  all about the ship's own axes: loop, turn right round, fly inverted. Rates reach their demand in
  ~80 ms (`turnResponse`). Mouse and stick have a response curve (`stickCurve`) so small movements
  aim finely and full deflection turns hard.
- **Auto-level.** Let go of roll and the wings ease back level with the lane's horizon, so you
  never lose your bearings for long. It stands back while you pull hard on pitch (loops stay
  loops) and fades out pointing straight up or down. `autoLevel` 0 turns it off.
- **Grip.** Velocity swings round to the nose at `grip`, so hard turns carry a little drift.
- **Bank and head.** Bank comes from turn rate. The pilot's head is thrown against g-force on a
  spring and glances into the turn (`lookIntoTurn`).
- **Rolls.** A sideways burst in the ship's own frame plus a full 360; three charges.
- **Throttle.** Boost widens the FOV, brake narrows it, and both change the engine note.
- **The belt in 3D.** Ambient rocks fill a sphere around the ship; path rocks respawn along your
  heading, so there is always something to dodge whichever way you fly. Hits, near misses and
  whooshes are all tested in 3D against closest approach.
- **The lane.** Guidance arrows past `warnRadius`. Past `safeRadius` exposure builds; it is harmless
  until `damageFrom`, then eats the hull. Roughly: 10 m out, damage after ~20 s and death at
  ~45 s; 60 m out, damage after ~5 s and death at ~25 s.
- **Trauma.** Events add trauma (0..1); shake is trauma², smooth noise, decaying.
- **Speed.** GPU dust streaks stretch with speed; FOV widens with boost.
- **Time.** Near misses cause a hit-stop, then slow motion. The pilot's controls always run in
  real time, so slow motion never feels like lag.
- **Sound.** Whooshes are scheduled before a close pass so their peak lands on it, panned to the side
  the rock passes. Near-miss ticks climb in pitch with the chain.

## From v1, still to bring over

Director (peace/attack waves, escorts every 4th wave), Scout / Interceptor / Heavy Raider, Drifters,
enemy bolts, spiral missiles, pickups, the 12-module upgrade draft, combo and score milestones,
expedition chapters 01 to 08, flight records.
