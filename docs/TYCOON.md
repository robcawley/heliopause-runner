# Heliopause Runner — the tycoon layer and the world

Status 2026-09-30: the pay slip and contract board are in the game (src/tycoon: career.js is
the logic and the save, board.js and board.css the screen). Start → board → launch → trip →
landed → pay slip and a new board at the town you landed in. Death offers the same contract again
or the board. Difficulty sets the trip's distance and how thick the rocks are on your line.
Credits and standing save in the browser. The market and chart are still design only.

Design canvas (Contracts, Market, phone board, Navigation chart — clickable):
https://claude.ai/artifact/JCuyxxxfACF6GsMkAGiDjk

## The reveal

Heliopause Runner is a strategy tycoon game at heart. Every run is a 2–3 minute trip between two
settlements (take-off, fly the belt, docking-control landing). After each landing:

1. **Pay slip.** Contract fee, then bonuses (hull left, on time, salvage from broken rocks, a
   flying bonus from clearance points), less docking fee and hull repair. Balance before → after.
   Standing with the town, and what the next rank opens.
2. **Contract board.** Always three offers: one of each pay tier (low, standard, premium) and one
   of each difficulty (easy, moderate, hard) — but **pay and difficulty are independent**: an easy
   job can be premium, a hard one can pay little and reward you in standing instead. Each card:
   destination and distance, cargo and its weight, lane conditions, time or deadline, standing earned.
3. **Shipwright's market.** Upgrades bought with credits, fitted before the next launch.
   Draft stock: ablative plating (hull 100 → 125), phase capacitor (recharge −25%), reflex
   thrusters (auto-rolls 3 → 4), coolant loop (blaster heat −20%), cargo frame (hold 2 t → 6 t,
   opens freight), jammer bypass licence (guns work inside settlement no-fire zones; needs standing).
4. **Navigation chart.** Towns, the powers that hold them, routes: on offer, open, locked by
   standing, uncharted.

Rules Rob set:
- Cargo weight does not change handling (it's space). Heavy cargo makes the ship **shudder when
  close to a big asteroid**.
- **Standing unlocks more story, upgrades and the map** (new routes).
- Blasters are jammed in settlements unless a later upgrade allows them.

## The world (Rob's premise)

Humanity is broken into factions. Each is governed by an AI that an old corporation once created;
now the AI *is* the corporation. There are also free humans, AI-merged humans, genetically modified
humans and alien-hybrid humans.

Draft powers (names are placeholders):

| Power | Origin | Its people | Colour / mark |
|---|---|---|---|
| Meridian | AI of a dead freight firm; owns the beacon lanes and sells passage | Free humans on contract | sand #d4b98a, square |
| Halcyon | Built to cure, now it breeds | The Tailored (gene-modified) | verdigris #6fa58f, circle |
| Sable | A mining AI that bought its miners' minds | The Threaded (AI-merged) | steel #8f9aa6, triangle |
| Free Holdings | No AI, little law; remembers favours | Free humans | bone #efe4d0, diamond |
| The Kindred | Something past the heliopause answered | Alien-hybrid humans | violet #b9acd6, ring |

Draft towns: Salacia Cut and Haumea Reach (Meridian); Orcus Ward and Makemake Drift (Halcyon,
Makemake locked: Respected); Quaoar Landing and Ixion Row (Sable); Sedna Lanterns, Varda Steps and
Gonggong Narrows (Free; Gonggong locked: Trusted with Sedna Lanterns); Arrokoth, past the
heliopause (Kindred, uncharted). Standing ranks: Stranger, Known, Trusted, Respected, Honoured, Kin.

## Art direction

From Rob's reference image (a lone suited figure walking toward smoking refineries across a
dust plain under a hazy sun): bone-and-ochre haze, white-hot sun, smoke drifting on the wind,
soot-dark ground under the UI panels. Type: Big Shoulders Display (titles), Barlow (body),
IBM Plex Mono (credits and numbers). One accent, hazard orange #e58a3a (money and commitment).

## Open questions

- Faction and town names: Rob to confirm or rename.
- Standing: per town, per power, or both? (The canvas shows both.)
- Prices and pay are placeholders pitched so one premium run buys roughly one or two parts.
- Next build step: pay slip + contract board in the game after landing, then the market.

## Crew and raider clans (built 1 Oct 2026)

Art direction from the two sheets in reference images/: a crew sheet (officers, a pilot, a
mechanic, a navigator at the charts, a gun-hand with a metal arm, an old engineer) and a raider
sheet (warlords with mechanical tentacles, a shield-bearer, a hooded gunner). Cropped to
portraits in public/portraits/. Rules: src/tycoon/crew.js; screens: src/tycoon/board-crew.js.

Crew. Two berths (four with Crew quarters, 7,500 cr in the market). Three different people are
for hire in each town. Hiring costs a fee; every landing pays wages; if a landing cannot cover
them, the best-paid hand walks off unpaid. Each crew member has one perk wired into the game:
Varga (Quartermaster) fees +10%; Teo (Pilot) one more auto-roll, phase 15% faster; Okafor
(Broker) +1 standing per delivery; Sparks (Mechanic) half-price repairs, +10 hull; Brennan
(Navigator) exact raider intel, deadlines +10%; Osei (Correspondent) flying bonus doubled;
Tanaka (Signals) raider telegraphs 35% longer; Krug (Gunner) blasters +30%, bounties +25%;
Old Mags (Engineer) blaster heat -20%, double salvage patches in a fight. Crew speak in the
cockpit: on the way out, entering a Dead Zone, and after clearing one.

Raider clans. Four warlords hold the lanes into each power's towns: Queen Rust (Rust Court,
Meridian), the Coil Mother (the Coil, Halcyon and Kindred), Bastion (Bastion's Wall, Free
Holdings), the Hollow (Hollow Guns, Sable). Each contract shows the clan on its lane and the
threat (0-4; a rumoured range without a navigator). Threat 0 is a clear lane with no fight.
Otherwise the trip has a Dead Zone: harder with threat, with one of the clan's signature craft
in each middle wave, and its pay slip carries raider bounties (110 + 40 per threat level a
raider) and a clear bonus (1,200 per threat level). Clearing a zone knocks the clan back 1.3;
every landing, every clan regrows 0.3. The Wanted board shows them all.

The choice on every board: pay, difficulty, cargo, and now risk. Safe lanes are quiet and pay
the fee; raided lanes pay in bounties if you can win; and your fights change which lanes are
dangerous next.

## The wing: crew fly escort (built 1 Oct 2026)

Rob: hired crew should be seen outside, flying with you on contracts, protecting you and
attacking raiders. They can be killed, they can abandon you over repeated mistakes, and they
grow loyal if you make them money. PIP should be upgradable. Crew should have audio: bleeps
and vocoder-style voices.

- **Escort** (src/modes/belt-run/wing.js). Every hand aboard flies their own small fighter,
  striped in their colour, in formation ahead and off your shoulders so you see them through
  the canopy. They join a few seconds after take-off.
- **Fighting.** In a Dead Zone fight each picks the nearest raider, orbits it and shoots
  (tracers, about two-thirds of your bolt damage). Their kills count toward your bounties.
  They take raider shots that pass near them (they shield you) and draw fire while engaged.
- **Damage and death.** Hull 100 each. Below 35 they fall back to formation and patch up
  (slowly, faster in a breather, much faster with PIP Mk II). Shot down is final: the career
  drops them at once (so a retry cannot undo it), the rest lose loyalty, and a fallen hand
  never appears for hire again.
- **Loyalty** (tycoon/crew.js, 0 to 100, starts 55). Each landing: profit (up to +8),
  on time +2 or late -4, a cleared zone +4, rock hits beyond two cost up to -8, a hull under
  40% -3. Your death: -10 each. Wingmate shot down: -6. Loyal (80+) hands hit 25% harder,
  aim better and, when your hull is under 30%, stay in the fight to cover you instead of
  falling back. Mutinous (under 30) hands shoot half as often. At 15 or below they quit at
  the next landing. Loyal hands are the last to walk when wages run short. Shown on crew cards.
- **Radio** (wingVoice.js). Squelch blips, then a vocoder voice: a buzzy carrier at each
  hand's pitch through formant filters that follow the vowels of the subtitle line,
  ring-modulated. Krug is deep and gravelly, Sparks high. Lines for forming up, engaging,
  kills, praise, taking hits, falling back, covering you, going down, and grumbling at your
  crashes.
- **PIP Mk II** (market, Droid, 5,200 cr). Field repairs: patches your hull at 3 a second
  after 4 s without a scrape, up to 30 a trip, and repairs the wing quickly between fights.

Open: wingmen ignore rocks on the lane (they can pass through them); whether a wingman's
perk should also need them alive in the fight; voice levels.

## 2026-10-02 — career QA

Ferry buttons reserve the maximum easy-lane fuel cost (590 cr); the confirmation and pay slip
show the generated fare. Flight creation also checks the actual fare and destination. Old saves
gain an empty fallen list, and fallen hands are removed from stale hiring offers and cannot
be hired through the career API. Ferry flights still earn no contract fee or standing.

Wing QA: reset disposes every fighter's geometry as well as materials, clears tracers and
cancels queued radio. Finished wing sounds disconnect their complete audio chains. Raider
shots sweep against escorts between frames. A wingmate loss also changes the surviving
fighters' in-flight loyalty immediately, matching the saved career. Retreat repairs continue
in active combat. Formation matches the player's velocity and steers around nearby rock spheres.

Chart QA: the map now keeps a minimum 770 px drawing width inside its existing horizontal
scroll area. At 640 px, an Orcus offer badge could overlap Ixion's name. DOM rectangle checks
cover every reachable origin with offer labels at 1440, 1180 and 390 px viewport widths.
Keyboard selection retains focus. Browser regression checks also cover old loyalty/fallen
saves, immediate permanent death and retry, and PIP's four-second wait and 30-hull trip cap.

### QA regression scripts (2 Oct 2026)

- `node tests/qa-wing.mjs`: career/ferry/loyalty, formation, retreat, swept escort loss,
  resource disposal, rock clearance, and four escorts defeating the real Carrion damage model.
- `node tests/qa-audio.mjs`: scheduled audio graph release over 50 cycles, RCS pulse timing
  and loop disposal. Uses a deterministic audio clock.
- `node tests/qa-browser.cjs`: native WebGPU, chart rectangles and keyboard selection,
  affordability/hold guards, old saves, PIP repair limits, death/retry and native audio endings.
- `node tests/qa-trip.cjs`: complete threat-2, four-escort trip with an assisted pilot
  (automatic aiming, lane centring, boost and invulnerability). Escort damage stays live.
  Prints frame samples and writes screenshots under `/tmp`.

Browser scripts use the supplied Chromium path and flags. Set `PLAYWRIGHT_PATH` to the installed
Playwright module directory if it is not `/tmp/pwt/node_modules/playwright`; `QA_URL` defaults
to `http://localhost:5173`. Use a fresh test browser profile: these scripts set up careers and
control the flight directly. No game dependencies were added.

## Regions as levels (built 2 Oct 2026)

Rob asked for more levels and progression; regions first. Every contract now flies the region
of its destination's power, with its own look and one signature hazard
(src/modes/belt-run/regions.js). Harder contracts (level 1 to 3) push the hazard further.

| Power | Region | Look | Hazard |
|---|---|---|---|
| Meridian | The Beacon Lanes | the original dark blue, ice rock | none: clear, well-kept lanes, the place to learn |
| Halcyon | The Cold Nursery | pale ice fog, white rock, short view | whiteouts: warned, then the fog closes in for 7 to 11 s |
| Sable | The Foundry Storm | rust-dark, iron rock, orange rim | magnetic surges: warned with direction, then a 3.5 to 5.5 s sideways drag |
| Free Holdings | The Narrows | brown rock | 35% more rock, 25% bigger |
| Kindred | The Heliopause | violet | look only, for now (Arrokoth is still uncharted) |

MICA introduces each region a few seconds after take-off. Weather is off inside Dead Zones.
Contract cards and the navigation chart name the region and its hazard. Rock colours are
uniforms in rocks.js (setTint). Test: tests/qa-regions.cjs (ONLY=halcyon etc. for one).

Next in the progression plan: pilot rank and licences, then warlord hunts, then the campaign arc.
