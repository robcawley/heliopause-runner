# Design

## Pillars (working assumptions, confirm or overturn)

1. **On rails, with freedom in the frame.** The ship always flies forward; the pilot steers within a
   bounded window, Star Fox / Rez / Panzer Dragoon style. This keeps v1's readable threat lane, its
   Director waves and drag-to-fly on phones. Free six-axis flight would be a different game.
2. **Feel first.** If an empty belt is not fun to fly through, nothing added on top will fix it.
3. **Near miss is the core verb.** In v1 it is a scoring bonus. In first person, a rock sliding past
   the canopy with a panned whoosh is the best moment in the game. Design toward it.
4. **Phase is felt from inside, not a barrel roll.** A first-person roll makes people sick. Instead the
   world drains to a cold ghost, sound goes underwater, and rocks pass through you.
5. **The story lives in the cockpit.** MICA on comms, the Orison beacon on the dash, chapter texts as
   transmissions. The Drifters become the garden, drifting past the glass in quiet phases.
6. **Readability over spectacle.** Depth is hard to judge in first person. Threats must be big, lit,
   rimmed, and telegraphed.

## How the feel is built

- **Spring ship.** Input sets an aim point; the ship chases it on a damped spring. Bank, pitch, yaw
  and head lag all derive from that spring's velocity and acceleration.
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
