// Crew and raider clans: the strategy layer around every delivery. Plain data, no Three.js.
//
// Crew: hire up to your berths (2, or 4 with crew quarters). Each takes a hiring fee, draws
// wages at every landing, and brings one perk that changes the flight or the pay slip. If a
// landing cannot cover the wages, the best-paid hand walks off. Portraits: public/portraits/crew-N.jpg.
//
// Clans: four raider warlords hold the lanes (portraits: public/portraits/raiders-N.jpg). A
// contract crosses the ground of the clan that holds its destination's region; the clan's
// strength there is the threat (0-4). Threat 0 is a clear lane. Otherwise the trip has a Dead
// Zone fight: more threat means harder raiders and bigger bounties. Clearing the zone knocks the
// clan back; every landing, every clan regrows a little. So a route is a choice: safe and dull,
// or dangerous and paid in bounties, and your fights shape the map.
import { TOWNS } from './career.js';

export const CREW = [
  { id: 'varga', portrait: 'crew-1', name: 'Ilse Varga', role: 'Quartermaster', hire: 3000, wage: 250, perk: 'Contract fees +10%', bio: 'Ex-Meridian supply officer. Knows what every crate is really worth.' },
  { id: 'teo', portrait: 'crew-2', name: 'Teo Nakamura', role: 'Pilot', hire: 3500, wage: 300, perk: 'One more auto-roll; phase recharges 15% faster', bio: 'Flew canyon races at Haumea until the stewards banned him.' },
  { id: 'okafor', portrait: 'crew-3', name: 'Adaeze Okafor', role: 'Broker', hire: 4500, wage: 350, perk: 'One extra standing on every delivery', bio: 'Former captain. Every harbourmaster owes her something.' },
  { id: 'sparks', portrait: 'crew-4', name: 'Rosa Quill', role: 'Mechanic', hire: 2800, wage: 220, perk: 'Hull repairs half price; +10 hull', bio: 'Answers to Sparks. Talks to engines, and they listen.' },
  { id: 'brennan', portrait: 'crew-5', name: 'Hal Brennan', role: 'Navigator', hire: 2400, wage: 200, perk: 'Exact raider intel on contracts; deadlines 10% longer', bio: 'Charted half the Reach by hand. Does not trust beacons.' },
  { id: 'osei', portrait: 'crew-6', name: 'Nia Osei', role: 'Correspondent', hire: 2000, wage: 150, perk: 'Flying bonus doubled: she sells the footage', bio: 'Freelance. Her feeds pay better the closer you fly.' },
  { id: 'tanaka', portrait: 'crew-7', name: 'Mei Tanaka', role: 'Signals', hire: 3200, wage: 260, perk: 'Raider attacks telegraph 35% longer', bio: 'Reads raider chatter before the raiders know their own minds.' },
  { id: 'krug', portrait: 'crew-8', name: 'Krug', role: 'Gunner', hire: 3800, wage: 320, perk: 'Blasters +30% damage; bounties +25%', bio: 'Lost the arm to the Coil. Has not forgiven anyone for it.' },
  { id: 'mags', portrait: 'crew-9', name: 'Old Mags', role: 'Engineer', hire: 3000, wage: 240, perk: 'Blaster heat -20%; double salvage patches in a fight', bio: 'Built half the ships in the yards. Retired twice.' },
];
export const crewById = (id) => CREW.find((m) => m.id === id);

export const CLANS = {
  rust: { name: 'The Rust Court', boss: 'Queen Rust', portrait: 'raiders-1', lieutenants: ['raiders-5', 'raiders-8'], style: 'Big mixed swarms, led from the back', extra: 'skirmisher', color: '#c0583a' },
  coil: { name: 'The Coil', boss: 'The Coil Mother', portrait: 'raiders-2', lieutenants: ['raiders-4', 'raiders-7'], style: 'Hooks: they grapple and drag', extra: 'grappler', color: '#b04ad0' },
  wall: { name: `Bastion's Wall`, boss: 'Bastion', portrait: 'raiders-3', lieutenants: ['raiders-9'], style: 'Shielded Bulwarks: flank them', extra: 'bulwark', color: '#d0a050' },
  hollow: { name: 'The Hollow Guns', boss: 'The Hollow', portrait: 'raiders-6', lieutenants: ['raiders-4'], style: 'Lancers: charged shots from long range', extra: 'gunner', color: '#4aa8d0' },
};
// Which clan raids the lanes into each power's towns
const TERRITORY = { meridian: 'rust', halcyon: 'coil', sable: 'hollow', free: 'wall', kindred: 'coil' };
export const clanOf = (town) => TERRITORY[TOWNS[town]?.power] ?? 'rust';
export const MAX_THREAT = 4;
const START = { rust: 2.2, coil: 1.6, wall: 1.2, hollow: 2.6 };
const REGROW = 0.3;        // per landing, every clan
const KNOCK = 1.3;         // a cleared Dead Zone knocks its clan back this far

// Old saves gain the strategy fields
export function ensureStrategy(c) {
  c.crew ??= [];
  c.clans ??= { ...START };
  if (!c.hireable?.length) refreshHires(c);
  return c;
}
export const berths = (c) => (c.owned?.quarters ? 4 : 2);
export const hasCrew = (c, id) => !!c.crew?.includes(id);
export const wagesOf = (c) => (c.crew ?? []).reduce((n, id) => n + (crewById(id)?.wage ?? 0), 0);
export function refreshHires(c) {
  const free = CREW.filter((m) => !c.crew.includes(m.id)).sort(() => Math.random() - 0.5);
  c.hireable = free.slice(0, 3).map((m) => m.id);
}
export function hireState(c, m) {
  if (hasCrew(c, m.id)) return 'aboard';
  if (c.crew.length >= berths(c)) return 'full';
  if (c.credits < m.hire) return 'poor';
  return 'hire';
}
export function hire(c, id) {
  const m = crewById(id);
  if (!m || hireState(c, m) !== 'hire') return false;
  c.credits -= m.hire;
  c.crew = [...c.crew, id];
  c.hireable = c.hireable.filter((x) => x !== id);
  return true;
}
export function dismiss(c, id) {
  c.crew = c.crew.filter((x) => x !== id);
}

// ---- Raider threat on a contract ---------------------------------------------------------
export const strengthOf = (c, clan) => Math.round(c.clans?.[clan] ?? 0);
export function raidFor(c, to, level) {
  const clan = clanOf(to);
  const base = (c.clans?.[clan] ?? 0) + (level - 2) * 0.7 + (Math.random() - 0.5);
  const threat = Math.max(0, Math.min(MAX_THREAT, Math.round(base)));
  // Without a navigator you only hear rumours: a range the truth sits inside
  const lo = Math.max(0, threat - (Math.random() < 0.5 ? 1 : 0));
  const hi = Math.min(MAX_THREAT, lo + 1);
  return { clan, threat, rumour: [lo, hi] };
}
export const bountyPerKill = (c, threat) => Math.round((110 + 40 * threat) * (hasCrew(c, 'krug') ? 1.25 : 1) / 10) * 10;
export const bountyClear = (threat) => 1200 * threat;

// After a landing: the clan you beat falls back, the rest regrow
export function clansAfter(c, raid, cleared) {
  for (const k of Object.keys(CLANS)) {
    if (cleared && raid?.clan === k) c.clans[k] = Math.max(0, c.clans[k] - KNOCK);
    else c.clans[k] = Math.min(MAX_THREAT + 1, (c.clans[k] ?? 0) + REGROW);
  }
}

// ---- Crew in the cockpit --------------------------------------------------------------------
const LINES = {
  start: {
    varga: 'Manifest checks out. Let us get paid.', teo: 'Clamps off when you are ready. I will keep my hands in my lap.',
    okafor: 'The harbourmaster at the other end expects us. Do not make me a liar.', sparks: 'Engines are singing. Try not to bend anything.',
    brennan: 'Course is laid in. Trust the chart, not the beacons.', osei: 'Feed is live. Fly close, it sells.',
    tanaka: 'Listening on every band. It is quiet. For now.', krug: 'Guns are warm.', mags: 'She will hold. I built her to.',
  },
  zone: {
    varga: 'Bounties on every one of these. Count them.', teo: 'Brake and pick them off. No heroics.',
    okafor: 'Clear this and the whole lane owes us.', sparks: 'Keep them off the hull. Please.',
    brennan: 'No beacons in here. Use the wrecks.', osei: 'Oh, that is going to look incredible.',
    tanaka: 'I have their chatter. I will call the wind-ups.', krug: 'There you are.', mags: 'Coolant is topped. Let the guns breathe between bursts.',
  },
  clear: {
    varga: 'That is a fat bounty.', teo: 'Clean flying.', okafor: 'Word will travel. Good.', sparks: 'Hull is a mess. I love it.',
    brennan: 'Beacons ahead. Back on the lane.', osei: 'Got all of it. Every frame.', tanaka: 'Their channel just went very quiet.',
    krug: 'Not enough of them.', mags: 'Salvage rights. I will have that coil.',
  },
};
export function crewLines(c) {
  const out = {};
  for (const when of Object.keys(LINES)) {
    const pool = (c.crew ?? []).map((id) => ({ who: crewById(id).name, text: LINES[when][id] }));
    if (pool.length) out[when] = pool[Math.floor(Math.random() * pool.length)];
  }
  return out;
}
