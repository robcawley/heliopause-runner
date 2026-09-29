# Heliopause Runner — production plan

*Version 1, 28 September 2026. Companion to `GAME-DESIGN.md`.*

## Where we start

The project began as Kuiper Blast 2, a first-person rebuild of the 2D Kuiper Blast. That work is
now the flight core of Heliopause Runner. What exists today:

- A nimble first-person fighter: rate-based turning, boost and brake, barrel rolls, phase drive.
- A 3D asteroid belt with near misses, hits, hull damage and death.
- The beacon lane: shelter inside, slowly building radiation outside, guidance arrows, repair gates.
- WebGPU rendering with a WebGL2 fallback, synthesised audio, a live tuning panel.
- An architecture already split for a bigger game: a shared `engine/`, self-contained `modes/`,
  and a host `shell/` that swaps modes in and out (see `INTEGRATION.md`).

That covers a good part of "basic first-person flight" and "one asteroid region" from the design
document's first prototype list.

## Principles

1. **Always playable.** Every phase ends with something you can play start to finish, however
   small. No phase is "systems work" with nothing to fly.
2. **Feel before content.** A mechanic is tuned until it is fun with placeholder art before any
   content is built on it. Content is cheap to add to a good system and expensive to rescue from
   a bad one.
3. **The run is the heart.** The 8–20 minute mission flown in first person is the game. Station,
   hangar, map and tycoon layers exist to give runs meaning. When time is short, the run wins.
4. **Data, not code, for content.** Cargo, ships, upgrades, factions, regions and missions live in
   data files, so a new ship or region is an edit, not a feature.
5. **Cut scope early and on purpose.** Every phase has an explicit "not yet" list.

## Assumptions

- Rob directs design, story, audio and feel; Claude writes most of the code and tooling.
- Estimates are in **weeks of part-time work** (evenings and some weekends). They are rough
  planning figures, not commitments, and will be re-estimated at the end of each phase.
- Placeholder art (greybox cockpit, procedural rocks, simple ship shapes) until Phase 6. Real
  models and cockpit art are the one area likely to need outside help or asset purchases.
- Tech stays as it is: Three.js with WebGPU in the browser. For a PC release the same build can be
  wrapped as a desktop app (Tauri or Electron) for Steam. Controllers work through the browser's
  Gamepad API; HOTAS support varies by device and needs early testing if it matters for launch.

## Milestones at a glance

| Phase | Name | Playable result | Rough size |
|---|---|---|---|
| 0 | Flight feel | Fly the belt, dodge, roll, stay near the lane | Done |
| 1 | Combat | Fight and flee one pirate in the belt | 4–6 weeks |
| 2 | The run | One complete smuggling run: dock, load, fly, get scanned, deliver | 6–8 weeks |
| 3 | The loop | Several runs in a row with credits, upgrades, saves and a small map | 5–7 weeks |
| — | **First Playable** | *The design document's "initial playable prototype"* | *~4–5 months in* |
| 4 | Frontier and belt | Regions 1–2, three ship classes, factions, generated missions | 8–10 weeks |
| 5 | Outer Patrol Zone | Region 3, pursuit, rivals, the full smuggling toolkit | 6–8 weeks |
| 6 | Vertical slice polish | Real cockpit, ships, UI and audio for regions 1–3 | 8–12 weeks |
| — | **Vertical Slice** | *Shows exactly what the finished game feels like* | *~12–15 months in* |
| 7 | Deep Frontier and tycoon | Region 4, fleets, depots, AI captains | 10–14 weeks |
| 8 | Alien Space | Region 5, first contact, endgame | 10–14 weeks |
| 9 | Alpha to launch | Balance, onboarding, performance, platforms, store | 12–16 weeks |

Total to launch is on the order of two and a half to three years at part-time pace. The two
milestones in bold are the natural points to decide whether to continue, change direction, seek
funding or a publisher, or bring in help.

## Phase 1 — Combat (4–6 weeks)

**Goal:** fighting in first person is as good as flying.

- Target lock and a lead indicator; lasers with heat; hit sparks and damage feedback.
- Shields (front and rear) over hull; shield recharge; engine damage that limits speed.
- One pirate fighter with simple behaviours: approach, attack run, break off, flee when hurt.
- Enemy fire designed for first-person readability (the prototype's biggest known risk).
- Rolls and phase as defensive tools against fire, not just rocks.
- An optional external chase camera, used to judge whether it earns its place.

**Exit test:** a one-on-one fight with a pirate is fun to win and to escape from, with placeholder
art, five times in a row.

**Not yet:** missiles, subsystems, countermeasures, wingmen.

## Phase 2 — The run (6–8 weeks)

**Goal:** one complete smuggling job, start to finish, in 10–15 minutes.

- **Station mode:** dock, a simple station screen, undock. Buy cargo from a short list (legal,
  contraband). Take one contract.
- **The route:** the beacon lane becomes the patrolled shipping route to a destination station.
- **Detection signature:** a live value driven by cargo, speed, boost and surroundings (rock
  shadow and radiation reduce it). Shown on the dash.
- **The authority patrol:** a customs ship that sweeps with a visible scan cone. Options when it
  finds you: submit to inspection, bluff (a short dialogue check), run, or fight.
- **Inspection outcomes:** clean pass, fine, confiscation, pursuit.
- **Delivery and payout** with a results screen: credits earned, risks taken, what was seen.
- **Failure as loss:** destruction becomes an insurance event, not a game over.

**Exit test:** a first-time player understands the choice between the safe patrolled lane and the
dangerous hidden route, and makes it differently on two runs.

**Not yet:** multiple stations, markets that move, factions, crew.

## Phase 3 — The loop (5–7 weeks)

**Goal:** runs connect into a campaign. This completes the design document's first prototype.

- **Save system:** one save slot, autosave at stations. Versioned so later changes do not break it.
- **Credits, repairs, insurance and loans.**
- **Hangar screen:** the courier's stats, five upgrades (engines, shields, cargo hold, concealed
  compartment, sensors) with slot, power and cost limits.
- **Star map:** five to seven nodes with branching routes; each route is a run with its own
  hazards and risk rating.
- **Simple markets:** prices differ by station and drift over time.

**First Playable milestone:** a new player can play an hour, earn enough for two upgrades, and want
to go one node further. Show it to five people outside the project and watch them play.

**Not yet:** multiple ships, factions beyond "law" and "pirates", tycoon.

## Phase 4 — Frontier and belt (8–10 weeks)

**Goal:** the first two regions as real content, built on data.

- Content pipeline: cargo, ships, upgrades, regions and missions defined in data files.
- Regions 1 (Settled Frontier, tutorial) and 2 (Kuiper Belt, hidden routes, small pirate groups).
- A mission generator for delivery, smuggling, salvage and pirate interception.
- Three ship classes: Courier, Interceptor, Freighter. Owning more than one ship.
- Factions (first pass): settlers, system police, smugglers, pirates, with reputation affecting
  prices and inspections.
- Onboarding: the Settled Frontier teaches flying, docking, trading and the first scan.

## Phase 5 — Outer Patrol Zone (6–8 weeks)

**Goal:** the smuggling fantasy at full strength.

- Region 3: heavy customs, contraband scans, police pursuit, rival smugglers.
- The full smuggling toolkit: forged manifests, bribes, transponder off, decoys, signal spoofing.
- Pursuit design: escaping is as satisfying as winning a fight.
- Missiles, countermeasures and targetable subsystems join combat.
- Stealth Runner and Gunship ship classes.

## Phase 6 — Vertical slice polish (8–12 weeks)

**Goal:** regions 1–3 look, sound and read like the finished game.

- Real cockpit art with interactive displays; ship models for every class in scope.
- Station interiors or a strong 2D station presentation; hangar and map UI in final style.
- Music integration across regions; final sound design.
- Performance targets met on a mid-range PC.

**Vertical Slice milestone:** 60–90 minutes that represent the whole game at final quality. This is
what goes to players, press, publishers or funders.

## Phase 7 — Deep Frontier and tycoon (10–14 weeks)

- Region 4: organised pirate fleets, territorial factions, environmental phenomena, long
  expeditions.
- Tycoon layer, abstract by design: depots, safe houses, trading posts, intelligence networks,
  automated routes and AI captains resolve as events and results on the star map, not simulated
  flights.
- Influence over regions; the Explorer class.

## Phase 8 — Alien Space (10–14 weeks)

- Region 5: alien markets, unknown technology, first-contact decisions, endgame faction warfare.
- Alien cargo and the Alien Hybrid ship.
- The story's resolution (see the open question on the story spine below).

## Phase 9 — Alpha to launch (12–16 weeks)

- Full balance pass on the economy and progression; difficulty options.
- Accessibility: remappable controls, motion comfort settings (the roll-camera setting already
  exists), subtitles, colour-safe HUD.
- Controller and HOTAS support tested on real devices.
- Desktop build, Steam integration (achievements, cloud saves), store page, trailer.
- External playtests at alpha and beta.

## Systems architecture

The prototype's layers extend naturally:

- **engine/** (shared): renderer, input, audio, post-processing, events, plus a save store and a
  data loader.
- **modes/** (one per way of playing): `flight` (grows out of today's `belt-run`: any run in any
  region, configured by mission data), `station`, `hangar`, `starmap`.
- **game/** (new): the campaign state that outlives modes. Credits, ships, cargo, reputation,
  influence, knowledge, the calendar. Modes read it on entry and report results on exit.
- **data/**: cargo, ships, upgrades, factions, regions, missions.
- **shell/**: menus, settings, save slots, mode switching.

A run is `flight` mode started with mission data (region, route, cargo, threats, goal) and ending
with a `complete` or `failed` event carrying what happened. That keeps each piece testable alone.

## Risks and how to manage them

| Risk | Why it matters | Mitigation |
|---|---|---|
| Scope | Five genres in one game | Phases with exit tests and "not yet" lists; the run always wins |
| First-person readability | Depth is hard to judge; enemy fire is harder | Solve in Phase 1 before content; big telegraphed bolts, lead indicators |
| The scan encounter is dull | It is the game's signature moment | Prototype it in Phase 2 with four equal answers: fight, flee, hide, talk |
| Economy balance | Tycoon and trading can break progression | Data-driven values, a simulation script to test earnings curves |
| Art | The biggest gap for a small team | Greybox until Phase 6; budget for bought or commissioned models |
| Browser performance | Large fields, many ships, effects | Profiling from Phase 1; resolution scaling; instancing everywhere |
| Motion sickness | First person, rolls, shake | Comfort settings from the start, tested with sensitive players |
| Save compatibility | Long campaigns, changing systems | Versioned saves with migrations from Phase 3 |

## Open questions for Rob

1. **Story spine.** Does the Kuiper Blast / Orison story (MICA, the beacon, the Drifters) carry
   over as the thread that pulls the player outward, or is this a fresh setting?
2. **The pilot.** Is the player a named character with a voice, or a blank courier?
3. **Tone.** Closer to gritty and grounded, or to the dry, strange warmth of MICA?
4. **Launch shape.** Browser first (robcawley.com, itch.io) and Steam later, or Steam only?
5. **Funding.** Self-funded throughout, or pitch at the Vertical Slice?

## Review rhythm

- At the end of each phase: play it, update this plan, re-estimate the next phase.
- Each tuning session is logged in `FEEL-LOG.md`.
- Every change set is committed, so there is always a step back.
