# Design

## Pillars (working assumptions, confirm or overturn)

1. **A lane, not a rail.** The ship always flies down the belt, but sideways it is free: real
   momentum, the nose swinging toward where you are going, barrel rolls to dodge. What keeps you
   near the path is the world, not a wall: the beacon lane shields you, and outside it radiation
   builds and eats the hull. Stray too far for too long and you die. Repair beacons sit inside the
   lane, so staying close is how you heal. (Revised 2026-09-28: the bounded frame was too tight to
   dodge in.)
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

- **Free lateral flight.** The stick asks for a sideways velocity; the ship accelerates toward it
  (`agility`). The nose follows the velocity vector, bank comes from speed plus acceleration.
- **Rolls.** A sideways burst plus a full 360, three charges that recharge.
- **The lane.** Guidance arrows past `warnRadius`; radiation, Geiger clicks, alarms and an amber
  screen bleed past `safeRadius`; hull damage once exposure passes `damageFrom`.
- **Head lag.** The camera is thrown against acceleration on its own spring, so the cockpit frame
  shifts in hard turns.
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
