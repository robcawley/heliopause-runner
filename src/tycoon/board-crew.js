// Two more screens on the settlement board, and the raider row on each contract card:
//   Crew     who is aboard (berths, wages), who is for hire in this town
//   Wanted   the four raider warlords, their strength, their ground and their bounties
// Rules live in crew.js; this file only draws them.
import { CLANS, crewById, berths, hireState, wagesOf, strengthOf, bountyPerKill, bountyClear, clanOf, MAX_THREAT, loyaltyOf, loyaltyLabel } from './crew.js';
import { TOWNS } from './career.js';

export const portrait = (id) => `${import.meta.env.BASE_URL}portraits/${id}.jpg`;
export const threatPips = (n) => `<span class='threat' aria-label='threat ${n} of ${MAX_THREAT}'>${[1, 2, 3, 4].map((i) => `<i class='${i <= n ? 'on' : ''}'></i>`).join('')}</span>`;

// The contract card's raider row. A navigator gives the true threat; without one, a rumour.
export function raidRow(c, k, esc) {
  const r = k.raid;
  if (!r) return '';
  const clan = CLANS[r.clan];
  const exact = c.crew?.includes('brennan');
  const clear = exact ? r.threat === 0 : r.rumour[1] === 0;
  const face = clear ? '' : `<img class='raid-face' src='${portrait(clan.portrait)}' alt=''>`;
  const what = clear ? 'Lane clear: no raiders' : exact
    ? `${threatPips(r.threat)} ${esc(clan.name)}`
    : `Rumoured ${r.rumour[0]} to ${r.rumour[1]} · ${esc(clan.name)}`;
  return `<span class='k'>Raiders</span><span class='raid-row${clear ? ' clear' : ''}'>${face}<span>${what}</span></span>`;
}

export function slipNotes(s, esc) {
  const out = [];
  if (s.cleared && s.raid) out.push(`${esc(CLANS[s.raid.clan].name)} driven back. Their lanes are quieter for now.`);
    if (s.walked?.length) out.push(`${s.walked.map(esc).join(' and ')} walked off: the wages were not there.`);
  if (s.lost?.length) out.push(`${s.lost.map(esc).join(' and ')} did not come home. Shot down flying your wing.`);
  if (s.quit?.length) out.push(`${s.quit.map(esc).join(' and ')} quit: they have lost faith in you.`);
  if (s.wingKills) out.push(`Your wing shot down ${s.wingKills} raider${s.wingKills > 1 ? 's' : ''}.`);
  return out.map((t) => `<p class='slip-unlock'>${t}</p>`).join('');
}

function crewCard(c, m, aboard, h) {
  const st = hireState(c, m);
  const btn = aboard
    ? `<button type='button' class='crew-act crew-dismiss' data-id='${m.id}'>Let go</button>`
    : `<button type='button' class='crew-act crew-hire' data-id='${m.id}'${st === 'hire' ? '' : ' disabled'}>${st === 'full' ? 'No berth free' : st === 'poor' ? `Need ${h.cr(m.hire - c.credits)} more` : `Hire · ${h.cr(m.hire)} cr`}</button>`;
  return `
    <article class='crew-card${aboard ? ' aboard' : ''}'>
      <img class='crew-face' src='${portrait(m.portrait)}' alt='${h.esc(m.name)}'>
      <div class='crew-body'>
        <p class='crew-role'>${h.esc(m.role)}</p>
        <h3>${h.esc(m.name)}</h3>
                <p class='crew-perk'>${h.esc(m.perk)}</p>
        ${aboard ? `<div class='crew-loyal' title='Loyalty'><span>${loyaltyLabel(loyaltyOf(c, m.id))}</span><i><b style='width:${loyaltyOf(c, m.id)}%'></b></i></div>` : ''}
        <p class='crew-bio'>${h.esc(m.bio)}</p>
        <div class='crew-foot'><span>Wage ${h.cr(m.wage)} cr a landing</span>${btn}</div>
      </div>
    </article>`;
}

export function renderCrew(c, h) {
  const aboard = c.crew.map(crewById).filter(Boolean);
  const hires = (c.hireable ?? []).map(crewById).filter((m) => m && !c.crew.includes(m.id));
  const empty = Math.max(0, berths(c) - aboard.length);
  return `${h.art}
    <div class='board-inner'>
      ${h.top(h.back)}
      <div class='board-hero'>
        <p class='board-kicker'>Crew quarters</p>
        <h2>Your crew</h2>
        <p class='board-sub'>${aboard.length} of ${berths(c)} berths · wages ${h.cr(wagesOf(c))} cr at every landing${berths(c) < 4 ? ' · crew quarters in the market add two berths' : ''}</p>
      </div>
      <section class='crew-sec'>
        <div class='offers-head'><h3>Aboard</h3><span>Wages come out of every pay slip. If the money is not there, the best-paid hand walks.</span></div>
        <div class='crew-grid'>${aboard.map((m) => crewCard(c, m, true, h)).join('')}${`<div class='crew-empty'>Empty berth</div>`.repeat(empty)}</div>
      </section>
      <section class='crew-sec'>
        <div class='offers-head'><h3>For hire in ${h.esc(c.town)}</h3><span>Different faces in every town.</span></div>
        <div class='crew-grid'>${hires.map((m) => crewCard(c, m, false, h)).join('') || `<p class='crew-none'>Nobody looking for work here today.</p>`}</div>
      </section>
      <p class='ship-toast crew-toast' aria-live='polite'>${h.esc(h.toast || '')}</p>
    </div>`;
}

export function renderWanted(c, h) {
  const poster = (key) => {
    const k = CLANS[key], s = Math.min(MAX_THREAT, strengthOf(c, key));
    const towns = Object.keys(TOWNS).filter((t) => clanOf(t) === key);
    return `
      <article class='wanted' style='--clan:${k.color}'>
        <div class='wanted-head'>Wanted</div>
        <img class='wanted-face' src='${portrait(k.portrait)}' alt='${h.esc(k.boss)}'>
        <h3>${h.esc(k.boss)}</h3>
        <p class='wanted-clan'>${h.esc(k.name)}</p>
        <div class='wanted-str'><span>Strength</span>${threatPips(s)}</div>
        <p class='wanted-style'>${h.esc(k.style)}</p>
        <p class='wanted-towns'>Raids the lanes into ${towns.map(h.esc).join(', ')}</p>
        <div class='wanted-lts'>${k.lieutenants.map((p) => `<img src='${portrait(p)}' alt=''>`).join('')}</div>
        <p class='wanted-bounty'>${s ? `${h.cr(bountyPerKill(c, s))} cr a raider · ${h.cr(bountyClear(s))} cr to clear a zone` : 'Broken, for now. They will be back.'}</p>
      </article>`;
  };
  return `${h.art}
    <div class='board-inner'>
      ${h.top(h.back)}
      <div class='board-hero'>
        <p class='board-kicker'>Harbour notices</p>
        <h2>Wanted</h2>
        <p class='board-sub'>Clear a Dead Zone and its clan falls back. Leave them alone and they grow. A navigator tells you exactly where they wait.</p>
      </div>
      <div class='wanted-grid'>${Object.keys(CLANS).map(poster).join('')}</div>
    </div>`;
}
