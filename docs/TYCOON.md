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
