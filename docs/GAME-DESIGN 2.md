# Heliopause Runner — game design

A first-person starfighter smuggling and expansion game combining arcade spaceflight, tactical
planning, ship management, and light tycoon progression.

*The heliopause is the boundary where the Sun's influence ends. In this game it is also where the
law ends, and the whole campaign is a push past it.*

## High concept

The player begins with a battered courier ship near the inner edge of the Kuiper Belt. Early jobs
involve navigating asteroids and delivering modest cargo. As the player travels farther from
settled space, they encounter pirates, increasingly aggressive authorities, rival smugglers, and
eventually alien factions.

Profits fund better ships, weapons, defenses, cargo systems, and business infrastructure. Each
successful expedition extends the player's influence across a persistent star map.

## Genre

- First-person space combat and flight
- Smuggling and trading simulator
- Strategy and fleet management
- Light tycoon progression
- Ship customization

## Target platform

- PC first
- Keyboard and mouse
- Controller and HOTAS support
- Single-player at launch

## Core player fantasy

Become an influential interstellar smuggler by:

- Flying dangerous routes personally
- Escaping scans, ambushes, and pursuit
- Buying and customizing ships
- Building a profitable transport network
- Establishing influence across the star map
- Deciding which governments, criminals, and alien factions to support

## Core gameplay loop

1. Select a contract or trade opportunity.
2. Choose cargo, route, ship, equipment, and crew.
3. Fly through hazardous space in first person.
4. Navigate obstacles, evade authorities, or fight attackers.
5. Deliver cargo and collect credits, reputation, and intelligence.
6. Repair and upgrade the ship.
7. Unlock new routes, systems, ships, and business operations.
8. Push farther outward and repeat at greater risk.

A typical mission should initially take around 8–20 minutes.

## Game structure

The world is divided into progressively more dangerous regions:

1. **Settled Frontier** — basic tutorials, legal deliveries, small asteroids, low-risk markets
2. **Kuiper Belt** — dense asteroid fields, navigation hazards, hidden smuggling routes, small pirate groups
3. **Outer Patrol Zone** — customs inspections, contraband scans, police pursuit, rival smugglers
4. **Deep Frontier** — organized pirate fleets, territorial factions, dangerous environmental phenomena, long-range expeditions
5. **Alien Space** — unknown technology, first-contact decisions, alien markets and conflicts, endgame faction warfare

## Flight and combat

Flight should feel accessible and responsive rather than fully realistic.

**Basic controls:** pitch, yaw and roll; throttle and reverse thrust; boost; lateral dodge
thrusters; target lock; primary and secondary weapons; shield management; decoy deployment;
scanner and communications controls.

**Combat systems:** laser cannons, projectile weapons, missiles, mining or cutting beams,
directional shields, hull armor, engine damage, targetable ship subsystems, electronic
countermeasures, decoys and signal spoofing.

Combat is not always the best solution. Fast ships can flee, stealth ships can hide, and
convincing smugglers can bluff their way through inspections.

## Smuggling systems

Cargo is classified as legal, restricted, stolen, contraband, hazardous, or alien.

Each cargo type has: purchase value, sale value, size and mass, detection signature, damage or
spoilage risk, regional legality, faction consequences.

Players can install concealed cargo compartments, forge manifests, bribe officials, disable
transponders, or use dangerous routes to avoid checkpoints.

## Ship management

A hangar screen allows the player to inspect and modify ships.

**Ship statistics:** hull integrity, shield capacity, shield recharge, top speed, acceleration,
maneuverability, cargo capacity, energy generation, heat dissipation, sensor range, detection
signature, crew capacity.

**Upgrade categories:** weapons, shields, armor, engines, thrusters, power reactor, cooling
systems, sensors, cargo modules, smuggling compartments, decoy launchers, electronic warfare
systems, cosmetic components.

Equipment is constrained by available slots, power consumption, heat generation, mass, and cost.

## Ship classes

Initial scope could include:

- **Courier** — balanced starting ship
- **Interceptor** — fast, agile, limited cargo
- **Freighter** — large cargo hold, slow handling
- **Gunship** — heavy weapons and armor
- **Stealth Runner** — low detection signature
- **Explorer** — long range and advanced sensors
- **Alien Hybrid** — endgame modular technology

Players may own several ships and select the best one for each operation.

## Customization

**Functional:** weapons and turrets, engine types, shield generators, cargo modules, armor
plating, cockpit instruments.

**Cosmetic:** hull paint and patterns, decals and faction markings, engine colors, cockpit
ornaments, interior lighting, wear, cleanliness and battle damage, ship name and registration
identity.

## Progression

The player advances through four connected systems:

- **Credits** — purchase ships, equipment, repairs, and facilities
- **Reputation** — unlock faction contracts and special technology
- **Influence** — establish control or presence in regions
- **Knowledge** — reveal routes, hazards, market data, and alien discoveries

Better equipment improves capability but also raises operating costs, repair bills, and attention
from powerful enemies.

## Tycoon layer

As the player grows, they can move beyond individual jobs. Possible investments: storage depots,
repair docks, trading posts, safe houses, intelligence networks, automated cargo routes, escort
wings, smuggler crews, bribed officials, remote mining operations.

Owned ships can eventually be assigned to AI captains. These operations generate income but may be
delayed, inspected, attacked, or destroyed.

## Star map and influence

The star map contains connected regions and routes. Each region displays: security level, pirate
activity, faction control, market demand, known hazards, player influence, available contacts,
discovered routes.

Influence expands by completing contracts, controlling trade routes, building facilities, helping
factions, and defeating local threats.

Expansion should be gradual: each new region introduces at least one mechanic, enemy type,
economic opportunity, or story development.

## Factions

Initial faction categories: frontier settlers, corporate authorities, system police, independent
traders, smuggler syndicates, pirate clans, military forces, multiple alien civilizations.

Faction relationships affect prices, inspections, missions, reinforcements, and access to
territory. Supporting one faction may damage relationships with another.

## Mission types

Cargo delivery, contraband smuggling, passenger transport, blockade running, pirate interception,
convoy escort, ship recovery, salvage, scouting, bounty hunting, customs evasion, alien artifact
retrieval, territory establishment.

## Failure and risk

Failure should hurt without routinely ending the campaign.

Possible consequences: lost cargo, ship damage, repair debt, fines, confiscated equipment,
reputation loss, injured crew, temporary route closures, ship destruction.

Insurance, escape pods, reserve ships, and emergency loans prevent most failures from becoming
permanent dead ends.

## Camera and presentation

- First-person cockpit during flight
- Optional external ship camera
- Interactive cockpit displays
- Tactical overlays for combat and navigation
- Dedicated hangar and ship-management interface
- Zoomable strategic star map

## Initial playable prototype

A strong first prototype would contain: one flyable courier ship, one asteroid region, one
station, basic first-person flight, laser combat, shields and hull damage, one pirate enemy, one
authority patrol, cargo buying and selling, contraband scanning, five ship upgrades, a small
branching star map, save and progression systems.

---

## Design notes (proposals, 28 Sept 2026)

These came out of reviewing this document against the flight prototype. They are proposals for
Rob to accept or reject; the production plan assumes them where marked.

- **The lane is the shipping route.** The prototype's beacon lane becomes the patrolled, legal
  route: sheltered from rocks and radiation, but that is where customs waits. Off the lane,
  radiation masks your signature, rocks break line of sight, and patrols won't follow, but the hull
  pays. The "stay near the path or not" decision becomes the core smuggling trade-off.
- **Detection signature is a live number.** Boost raises heat, contraband widens the signature,
  rock shadow and radiation hide it. Hiding from a scan sweep is a flight skill; bluffing an
  inspection is a dialogue skill. Fight, flee, hide and talk are four equal answers.
- **Death is an insurance claim.** The prototype's death screen becomes a loss event (cargo gone,
  repair debt, insurance premium up), not a game over.
- **The story needs a spine.** Open question: does the Kuiper Blast / Orison story (MICA, the
  beacon, the Drifters) carry over as the thread that pulls you outward toward alien space, or is
  this a fresh setting?
- **Start small.** Three cargo classes (legal, contraband, alien) before six; the tycoon layer runs
  as abstract outcomes on the star map, not simulated ships.
