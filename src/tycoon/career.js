// The career: credits, where you are, your standing with each town, and the three
// contracts on offer there. Plain data, saved in the browser, so a run can end and the
// career carry on. Nothing here knows about Three.js or the flight mode.
//
// Design: docs/TYCOON.md. Every town offers three contracts: one of each pay tier (low,
// standard, premium) and one of each difficulty (easy, moderate, hard), paired at random,
// so an easy job can pay premium and a hard one can pay little and reward you in standing.

export const POWERS = {
    meridian: { name: 'Meridian', color: '#d4b98a', people: 'Free humans on Meridian contract', blurb: 'AI of a dead freight firm. Owns the beacon lanes.' },
  halcyon: { name: 'Halcyon', color: '#6fa58f', people: 'The Tailored, gene-modified', blurb: 'Built to cure; now it breeds the Tailored.' },
  sable: { name: 'Sable', color: '#8f9aa6', people: 'The Threaded, AI-merged', blurb: 'A mining AI that bought its miners\u2019 minds.' },
  free: { name: 'Free Holdings', color: '#efe4d0', people: 'Free humans', blurb: 'No AI, little law. Remembers favours.' },
  kindred: { name: 'The Kindred', color: '#b9acd6', people: 'The Kindred, alien hybrids', blurb: 'Humans who came back from the edge changed.' },
};

// Every settlement the flight mode can build, who holds it, and what standing opens it.
// These names must match the settlement names in modes/belt-run/settlement.js.
export const TOWNS = {
  'Salacia Cut': { power: 'meridian', people: 'Free humans on Meridian contract', blurb: 'A refinery town cut into a split rock. Meridian\u2019s customs AI watches every pad.' },
  'Haumea Reach': { power: 'meridian', people: 'Free humans, hospital staff', blurb: 'A hospital town on the old lane, short of everything but patience.' },
  'Orcus Ward': { power: 'halcyon', people: 'The Tailored, gene-modified', blurb: 'Halcyon\u2019s cold nursery. The coolant keeps the vats alive.' },
  'Makemake Drift': { power: 'halcyon', needs: { town: 'Orcus Ward', rank: 3 }, people: 'The Tailored', blurb: 'Where the Tailored are made. Outsiders come by invitation.' },
  'Quaoar Landing': { power: 'sable', people: 'The Threaded, AI-merged', blurb: 'A foundry town. The Threaded work in silence and sing on the comms.' },
  'Ixion Row': { power: 'sable', people: 'The Threaded', blurb: 'Ore docks strung along a fault line.' },
  'Sedna Lanterns': { power: 'free', people: 'Free humans', blurb: 'A free town lit by a thousand salvaged lamps. It owes nobody.' },
  'Varda Steps': { power: 'free', people: 'Free humans, traders', blurb: 'Habitats terraced up a sheer face. Traders, no questions.' },
  'Gonggong Narrows': { power: 'free', needs: { town: 'Sedna Lanterns', rank: 2 }, people: 'Free humans, smugglers', blurb: 'A smugglers\u2019 pass the AIs pretend not to see.' },
  'Arrokoth Market': { power: 'kindred', needs: { town: null, rank: 99 }, people: 'The Kindred, alien hybrids', blurb: 'A market past the heliopause that no two charts agree on.' },   // uncharted, for now
};

export const RANKS = ['Stranger', 'Known', 'Trusted', 'Respected', 'Honoured', 'Kin'];

const TIERS = {
  low: { label: 'Low pay', pay: [1400, 2200], standing: 2 },
  standard: { label: 'Standard pay', pay: [3400, 4600], standing: 1 },
  premium: { label: 'Premium pay', pay: [7000, 9800], standing: 1 },
};
// Difficulty is the trip itself: how far, and how thick the rocks are on your line
export const DIFFICULTIES = {
  easy: { label: 'Easy', level: 1, km: [8.5, 9.8], density: 0.7, lanes: ['Thin belt, beacons lit all the way', 'Quiet lane, light traffic'] },
  moderate: { label: 'Moderate', level: 2, km: [10, 11.5], density: 1, lanes: ['Dense field past the midpoint', 'Busy lane, rock drifting across it'] },
  hard: { label: 'Hard', level: 3, km: [11.5, 13], density: 1.6, lanes: ['Rocks packed tight on the line', 'Heavy field, little room to turn'] },
};
const CARGO = [
  { what: 'Serum crates', t: 0.6, job: 'Serum run' },
  { what: 'Mail and post', t: 0.4, job: 'Post run' },
  { what: 'Reactor coolant', t: 6, job: 'Coolant freight' },
  { what: 'Water ice', t: 8, job: 'Ice haul' },
  { what: 'Machine parts', t: 4, job: 'Parts run' },
  { what: 'Seed stock', t: 1.2, job: 'Seed delivery' },
  { what: 'Data cores', t: 0.3, job: 'Data courier' },
  { what: 'Sealed crate', t: 2, job: 'Sealed consignment' },
  { what: 'Ore samples', t: 3, job: 'Assay run' },
];
import { CLANS, ensureStrategy, hasCrew, raidFor, bountyPerKill, bountyClear, clansAfter, refreshHires, wagesOf, crewById, crewLines, wingOf, loyaltyAfter, loyaltyOf, LOYALTY } from './crew.js';

const HEAVY = 4;                 // tonnes: heavy cargo shudders near giant rocks
const HOLD = 2;                  // tonnes the ship carries without a cargo frame
export const holdOf = (c) => (c.owned?.hold ? 8 : HOLD);   // a cargo frame takes 8 t
const CRUISE = 70;               // m/s, for time estimates
const SEQUENCES = 25;            // seconds of take-off and landing

const KEY = 'heliopause-career-v1';
const between = ([a, b]) => a + Math.random() * (b - a);
const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function newCareer() {
  const c = { v: 1, credits: 2500, town: 'Salacia Cut', standing: {}, owned: {}, offers: null, contract: null, runs: 0 };
  ensureStrategy(c);
  c.offers = makeOffers(c);
  return c;
}
export function loadCareer() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (c?.v === 1 && TOWNS[c.town]) {
      c.owned ??= {};
      ensureStrategy(c);
      if (!c.offers?.length || !c.offers[0].raid) c.offers = makeOffers(c);   // older saves: offers gain raider intel
      return c;
    }
  } catch { /* no save, or a broken one: start fresh */ }
  return newCareer();
}
export function saveCareer(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* private mode: the career lasts the session */ }
}

export const standingIn = (c, town) => c.standing[town] ?? 0;
export function isOpen(c, town) {
  const needs = TOWNS[town]?.needs;
  return !needs || (needs.town !== null && standingIn(c, needs.town) >= needs.rank);
}
export const openTowns = (c) => Object.keys(TOWNS).filter((t) => t !== c.town && isOpen(c, t));
// What standing in a town opens: the towns that wait on it, as [town, rank]
export const opensFrom = (town) => Object.entries(TOWNS).filter(([, t]) => t.needs?.town === town).map(([name, t]) => [name, t.needs.rank]);

// ---- The crossing (docs/PACKAGE.md) ------------------------------------------------------
// Trusted with a town of every power and the Kindred make contact: one of them needs carrying
// home, past the heliopause. That contract is the ending. After it, c.ended is set.
const CROSSING_POWERS = ['meridian', 'halcyon', 'sable', 'free'];
const CROSSING_RANK = 2;   // Trusted
export const crossingProgress = (c) => CROSSING_POWERS.filter((p) => Object.keys(TOWNS).some((t) => TOWNS[t].power === p && standingIn(c, t) >= CROSSING_RANK)).length;
export const CROSSING_NEEDS = CROSSING_POWERS.length;
export const crossingOpen = (c) => !c.ended && crossingProgress(c) >= CROSSING_NEEDS;
export function makeCrossing(c) {
  const distance = 14000;
  return {
    id: `crossing-${c.runs}`, final: true, tier: 'final', tierLabel: 'The crossing', difficulty: 'easy', difficultyLabel: 'Unknown', level: 1,
    job: 'Carry a Kindred passenger home', from: c.town, to: 'Arrokoth Market', distance, density: 0.6, lane: 'Past the last beacon. No lane.',
    cargo: 'One Kindred passenger', tons: 0, heavy: false, est: Math.round((distance / CRUISE + SEQUENCES) / 5) * 5, deadline: null,
    raid: { clan: 'coil', threat: 0, rumour: [0, 0] }, pay: 0, standing: 0,
  };
}

export function makeOffers(c) {
  const dests = shuffle(openTowns(c)).slice(0, 3);
  const diffs = shuffle(Object.keys(DIFFICULTIES));
  // Always at least two jobs this ship can carry: without a cargo frame, heavy freight waits
  const fits = shuffle(CARGO.filter((k) => k.t <= holdOf(c)));
  const cargo = shuffle([...fits.slice(0, 2), ...shuffle(CARGO.filter((k) => !fits.slice(0, 2).includes(k))).slice(0, 1)]);
    const offers = Object.keys(TIERS).map((tier, i) => {
    const T = TIERS[tier], D = DIFFICULTIES[diffs[i]], k = cargo[i];
    const distance = Math.round((between(D.km) * 1000) / 100) * 100;
    const est = distance / CRUISE + SEQUENCES;
    const urgent = Math.random() < 0.35;
    return {
      id: `${Date.now().toString(36)}-${i}`,
      tier, tierLabel: T.label, difficulty: diffs[i], difficultyLabel: D.label, level: D.level,
      job: urgent ? `Urgent ${k.job.toLowerCase()}` : k.job,
      from: c.town, to: dests[i], distance, density: D.density, lane: pick(D.lanes),
      cargo: k.what, tons: k.t, heavy: k.t >= HEAVY,
      est: Math.round(est / 5) * 5,
      deadline: urgent ? Math.round((est * 0.92 * (hasCrew(c, 'brennan') ? 1.1 : 1)) / 5) * 5 : null,     // urgent jobs need some boosting
      raid: raidFor(c, dests[i], D.level),
      pay: Math.round((between(T.pay) * (urgent ? 1.1 : 1)) / 100) * 100,
            standing: T.standing,
    };
  });
  if (crossingOpen(c)) offers.push(makeCrossing(c));
  return offers;
}

// A ferry flight (from the navigation chart): fly empty to any open town and pay for the fuel.
// No fee and no standing, but you go where the work is, or the crew you want, and the raiders
// on that lane are still there, with their bounties.
export const FERRY_MAX_KM = DIFFICULTIES.easy.km[1];
export const ferryFuel = (km) => Math.round((300 + km * 30) / 10) * 10;
export function makeFerry(c, to) {
  if (!TOWNS[to] || to === c.town || !isOpen(c, to)) return null;
  const D = DIFFICULTIES.easy;
  const distance = Math.round(between(D.km) * 10) * 100;
  const fuel = ferryFuel(distance / 1000);
  if (c.credits < fuel) return null;
  return {
    id: `${Date.now().toString(36)}-f`, ferry: true, fuel,
    tier: 'ferry', tierLabel: 'Ferry', difficulty: 'easy', difficultyLabel: D.label, level: D.level,
    job: 'Ferry flight', from: c.town, to, distance, density: D.density, lane: 'Flying empty',
    cargo: 'Empty hold', tons: 0, heavy: false, est: Math.round((distance / CRUISE + SEQUENCES) / 5) * 5, deadline: null,
    raid: raidFor(c, to, D.level), pay: 0, standing: 0,
  };
}

// What the flight mode needs to build the trip
// raid: the clan on this lane and its threat (threat 0: no fight). crew: what the crew say in flight.
export const tripOf = (k, c) => (k ? {
  origin: k.from, dest: k.to, distance: k.distance, density: k.density, heavy: !!k.heavy,
  region: TOWNS[k.to]?.power ?? 'meridian', level: k.level ?? 1, final: !!k.final,
  raid: k.raid ? { ...CLANS[k.raid.clan], clan: k.raid.clan, threat: k.raid.threat } : null,
  crew: c ? crewLines(c) : {},
  wing: c ? wingOf(c) : [],
} : undefined);

// Landed: work out the pay slip, pay it, move the pilot, raise standing, post new offers
export function settle(c, k, s) {
  const lines = [];
  const late = !!k.deadline && s.time > k.deadline;
  const fee = Math.round((late ? k.pay / 2 : k.pay) * (hasCrew(c, 'varga') ? 1.1 : 1));
    if (k.ferry) lines.push({ label: 'Ferry fuel', note: 'flying empty', amount: -k.fuel });
  else {
    lines.push({ label: late ? 'Contract fee, late' : 'Contract fee', note: late ? 'half pay' : '', amount: fee });
    lines.push({ label: 'Hull bonus', note: `${s.hull}%`, amount: Math.round(k.pay * 0.12 * (s.hull / 100)) });
  }
  if (k.deadline && !late) lines.push({ label: 'On time', note: `${clock(s.time)} of ${clock(k.deadline)}`, amount: Math.round(k.pay * 0.1) });
  if (s.rocksDestroyed) lines.push({ label: 'Salvage', note: `${s.rocksDestroyed} rocks`, amount: s.rocksDestroyed * 20 });
  const raid = k.raid, kills = s.raidersKilled ?? 0, cleared = (s.zonesCleared ?? 0) > 0;
  if (raid?.threat && kills) lines.push({ label: 'Raider bounties', note: `${kills} at ${bountyPerKill(c, raid.threat)}`, amount: kills * bountyPerKill(c, raid.threat) });
  if (raid?.threat && cleared) lines.push({ label: 'Dead Zone cleared', note: CLANS[raid.clan].name, amount: bountyClear(raid.threat) });
  const footage = hasCrew(c, 'osei') ? 2 : 1;
  lines.push({ label: 'Flying bonus', note: `${s.score.toLocaleString('en-GB')} pts${footage > 1 ? ', footage sold' : ''}`, amount: Math.floor(s.score / 10) * footage });
  lines.push({ label: 'Docking fee', note: '', amount: -150 });
  if (s.hull < 100) lines.push({ label: 'Hull repair', note: `${100 - s.hull}%${hasCrew(c, 'sparks') ? ', Sparks' : ''}`, amount: -(100 - s.hull) * (hasCrew(c, 'sparks') ? 10 : 20) });
  const wages = wagesOf(c);
  if (wages) lines.push({ label: 'Crew wages', note: `${c.crew.length} aboard`, amount: -wages });
  let total = lines.reduce((sum, l) => sum + l.amount, 0);
  // Wages you cannot cover: the best-paid hand walks off, unpaid
  const walked = [];
  while (c.crew.length && c.credits + total < 0) {
    const m = c.crew.map(crewById).sort((a, b) => (loyaltyOf(c, a.id) >= LOYALTY.loyal) - (loyaltyOf(c, b.id) >= LOYALTY.loyal) || b.wage - a.wage)[0];
    c.crew = c.crew.filter((x) => x !== m.id);
    lines.push({ label: `${m.name} walked off`, note: 'unpaid', amount: m.wage });
    total += m.wage;
    walked.push(m.name);
  }

    // The wing: who was shot down, and how the rest feel about the run (tycoon/crew.js)
  const lost = (s.wingLost ?? []).map((id) => crewById(id)?.name).filter(Boolean);
  for (const name of lost) lines.push({ label: `${name}, shot down`, note: 'killed in action', amount: 0 });
  const mood = loyaltyAfter(c, s, { total, late, cleared });
  for (const name of mood.quit) lines.push({ label: `${name} quit`, note: 'lost faith in you', amount: 0 });

  const before = c.credits;
  const openBefore = new Set(openTowns({ ...c, town: null }));
  c.credits = Math.max(0, c.credits + total);
  if (!k.ferry) c.standing[k.to] = Math.min(RANKS.length - 1, standingIn(c, k.to) + k.standing + (hasCrew(c, 'okafor') ? 1 : 0));
  clansAfter(c, raid, cleared);
  c.town = k.to;
  c.contract = null;
  c.runs += 1;
  refreshHires(c);
  const unlocked = openTowns({ ...c, town: null }).filter((t) => !openBefore.has(t));
  c.offers = makeOffers(c);
  return { contract: k, lines, total, before, after: c.credits, town: k.to, time: s.time, hull: s.hull, late, standing: standingIn(c, k.to), unlocked, walked, raid, cleared, kills, lost, quit: mood.quit, loyaltyDelta: mood.delta, wingKills: s.wingKills ?? 0 };
}

// ---- The shipwright's market ------------------------------------------------------------
// Upgrades are bought with credits and fitted before the next launch. applyLoadout() writes
// their effects into the flight mode's config, so what you buy is what you fly.
export const UPGRADES = [
  { id: 'plating', cat: 'Hull', name: 'Ablative plating Mk II', stat: 'Hull', from: '100', to: '125', note: 'Soaks another 25 points of rock before the frame gives.', price: 4800 },
  { id: 'capacitor', cat: 'Drive', name: 'Phase capacitor', stat: 'Phase recharge', from: '3.0 s', to: '2.3 s', note: 'Slip through rock a quarter more often.', price: 6400 },
  { id: 'reflex', cat: 'Drive', name: 'Reflex thrusters', stat: 'Auto-rolls', from: '3', to: '4', note: 'One more dodge before the charges run dry.', price: 3900 },
  { id: 'coolant', cat: 'Guns', name: 'Coolant loop', stat: 'Blaster heat', from: '100%', to: '80%', note: 'Longer bursts before the guns lock up.', price: 2600 },
  { id: 'hold', cat: 'Hold', name: 'Cargo frame', stat: 'Hold', from: `${HOLD} t`, to: '8 t', note: 'Carry heavy freight: coolant, ice, parts and ore.', price: 5500 },
  { id: 'quarters', cat: 'Crew', name: 'Crew quarters', stat: 'Berths', from: '2', to: '4', note: 'Bunks, a galley and a door that locks. Room for four crew.', price: 7500 },
    { id: 'pip', cat: 'Droid', name: 'PIP Mk II', stat: 'PIP', from: 'Mk I', to: 'Mk II', note: 'Field repairs: PIP patches your hull between scrapes, up to 30 a trip, and keeps your wing flying.', price: 5200 },
  { id: 'bypass', cat: 'Licences', name: 'Jammer bypass licence', stat: 'Guns in dock limits', from: 'Jammed', to: 'Live', note: 'Your guns work inside settlement no-fire zones.', price: 24000, needsTrusted: 3 },
];
export const trustedTowns = (c) => Object.values(c.standing).filter((r) => r >= 2).length;
export function upgradeState(c, u) {
  if (c.owned?.[u.id]) return 'owned';
  if (u.needsTrusted && trustedTowns(c) < u.needsTrusted) return 'locked';
  if (c.credits < u.price) return 'poor';
  return 'buy';
}
export function buy(c, id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || upgradeState(c, u) !== 'buy') return false;
  c.credits -= u.price;
  c.owned = { ...c.owned, [id]: true };
  return true;
}
// The ship as the market shows it: [label, value, upgraded]
export function shipStats(c) {
  return UPGRADES.map((u) => [u.stat, c.owned?.[u.id] ? u.to : u.from, !!c.owned?.[u.id]]);
}
// Write the fitted upgrades into the flight config (from its original values, so it never compounds)
const BASE = new WeakMap();
export function applyLoadout(config, c) {
  if (!BASE.has(config)) {
    BASE.set(config, { hull: config.hull.max, cooldown: config.phase.cooldown, charges: config.roll.charges, heat: config.blasters.heatPerShot, jam: config.settlement.jamBlasters,
      damage: config.blasters.damage, telegraph: config.raiders.telegraphScale, waveRepair: config.deadZone.waveRepair });
  }
  const b = BASE.get(config), o = c.owned ?? {};
  // Upgrades and crew perks together (crew: tycoon/crew.js)
  const has = (id) => hasCrew(c, id);
  config.hull.max = Math.round(b.hull * (o.plating ? 1.25 : 1)) + (has('sparks') ? 10 : 0);
  config.phase.cooldown = b.cooldown * (o.capacitor ? 0.75 : 1) * (has('teo') ? 0.85 : 1);
  config.roll.charges = b.charges + (o.reflex ? 1 : 0) + (has('teo') ? 1 : 0);
  config.blasters.heatPerShot = b.heat * (o.coolant ? 0.8 : 1) * (has('mags') ? 0.8 : 1);
  config.blasters.damage = b.damage * (has('krug') ? 1.3 : 1);
  config.raiders.telegraphScale = b.telegraph * (has('tanaka') ? 1.35 : 1);
  config.deadZone.waveRepair = b.waveRepair * (has('mags') ? 2 : 1);
    config.settlement.jamBlasters = o.bypass ? false : b.jam;
  config.droid.mk2 = !!o.pip;
}
