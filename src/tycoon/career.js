// The career: credits, where you are, your standing with each town, and the three
// contracts on offer there. Plain data, saved in the browser, so a run can end and the
// career carry on. Nothing here knows about Three.js or the flight mode.
//
// Design: docs/TYCOON.md. Every town offers three contracts: one of each pay tier (low,
// standard, premium) and one of each difficulty (easy, moderate, hard), paired at random,
// so an easy job can pay premium and a hard one can pay little and reward you in standing.

export const POWERS = {
  meridian: { name: 'Meridian', color: '#d4b98a', people: 'Free humans on Meridian contract' },
  halcyon: { name: 'Halcyon', color: '#6fa58f', people: 'The Tailored, gene-modified' },
  sable: { name: 'Sable', color: '#8f9aa6', people: 'The Threaded, AI-merged' },
  free: { name: 'Free Holdings', color: '#efe4d0', people: 'Free humans' },
  kindred: { name: 'The Kindred', color: '#b9acd6', people: 'The Kindred, alien hybrids' },
};

// Every settlement the flight mode can build, who holds it, and what standing opens it.
// These names must match the settlement names in modes/belt-run/settlement.js.
export const TOWNS = {
  'Salacia Cut': { power: 'meridian' },
  'Haumea Reach': { power: 'meridian' },
  'Orcus Ward': { power: 'halcyon' },
  'Makemake Drift': { power: 'halcyon', needs: { town: 'Orcus Ward', rank: 3 } },
  'Quaoar Landing': { power: 'sable' },
  'Ixion Row': { power: 'sable' },
  'Sedna Lanterns': { power: 'free' },
  'Varda Steps': { power: 'free' },
  'Gonggong Narrows': { power: 'free', needs: { town: 'Sedna Lanterns', rank: 2 } },
  'Arrokoth Market': { power: 'kindred', needs: { town: null, rank: 99 } },   // uncharted, for now
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
  c.offers = makeOffers(c);
  return c;
}
export function loadCareer() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (c?.v === 1 && TOWNS[c.town]) {
      c.owned ??= {};
      if (!c.offers?.length) c.offers = makeOffers(c);
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

export function makeOffers(c) {
  const dests = shuffle(openTowns(c)).slice(0, 3);
  const diffs = shuffle(Object.keys(DIFFICULTIES));
  // Always at least two jobs this ship can carry: without a cargo frame, heavy freight waits
  const fits = shuffle(CARGO.filter((k) => k.t <= holdOf(c)));
  const cargo = shuffle([...fits.slice(0, 2), ...shuffle(CARGO.filter((k) => !fits.slice(0, 2).includes(k))).slice(0, 1)]);
  return Object.keys(TIERS).map((tier, i) => {
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
      deadline: urgent ? Math.round((est * 0.92) / 5) * 5 : null,     // urgent jobs need some boosting
      pay: Math.round((between(T.pay) * (urgent ? 1.1 : 1)) / 100) * 100,
      standing: T.standing,
    };
  });
}

// What the flight mode needs to build the trip
export const tripOf = (k) => (k ? { origin: k.from, dest: k.to, distance: k.distance, density: k.density } : undefined);

// Landed: work out the pay slip, pay it, move the pilot, raise standing, post new offers
export function settle(c, k, s) {
  const lines = [];
  const late = !!k.deadline && s.time > k.deadline;
  const fee = late ? Math.round(k.pay / 2) : k.pay;
  lines.push({ label: late ? 'Contract fee, late' : 'Contract fee', note: late ? 'half pay' : '', amount: fee });
  lines.push({ label: 'Hull bonus', note: `${s.hull}%`, amount: Math.round(k.pay * 0.12 * (s.hull / 100)) });
  if (k.deadline && !late) lines.push({ label: 'On time', note: `${clock(s.time)} of ${clock(k.deadline)}`, amount: Math.round(k.pay * 0.1) });
  if (s.rocksDestroyed) lines.push({ label: 'Salvage', note: `${s.rocksDestroyed} rocks`, amount: s.rocksDestroyed * 20 });
  lines.push({ label: 'Flying bonus', note: `${s.score.toLocaleString('en-GB')} pts`, amount: Math.floor(s.score / 10) });
  lines.push({ label: 'Docking fee', note: '', amount: -150 });
  if (s.hull < 100) lines.push({ label: 'Hull repair', note: `${100 - s.hull}%`, amount: -(100 - s.hull) * 20 });
  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  const before = c.credits;
  const openBefore = new Set(openTowns({ ...c, town: null }));
  c.credits = Math.max(0, c.credits + total);
  c.standing[k.to] = Math.min(RANKS.length - 1, standingIn(c, k.to) + k.standing);
  c.town = k.to;
  c.contract = null;
  c.runs += 1;
  const unlocked = openTowns({ ...c, town: null }).filter((t) => !openBefore.has(t));
  c.offers = makeOffers(c);
  return { contract: k, lines, total, before, after: c.credits, town: k.to, time: s.time, hull: s.hull, late, standing: c.standing[k.to], unlocked };
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
    BASE.set(config, { hull: config.hull.max, cooldown: config.phase.cooldown, charges: config.roll.charges, heat: config.blasters.heatPerShot, jam: config.settlement.jamBlasters });
  }
  const b = BASE.get(config), o = c.owned ?? {};
  config.hull.max = o.plating ? Math.round(b.hull * 1.25) : b.hull;
  config.phase.cooldown = o.capacitor ? b.cooldown * 0.75 : b.cooldown;
  config.roll.charges = b.charges + (o.reflex ? 1 : 0);
  config.blasters.heatPerShot = o.coolant ? b.heat * 0.8 : b.heat;
  config.settlement.jamBlasters = o.bypass ? false : b.jam;
}
