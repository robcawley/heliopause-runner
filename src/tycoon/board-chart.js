// The navigation chart, one more screen on the settlement board (design canvas: Navigation
// chart). Every town, the power that holds it, the routes out of where you are, who raids
// them and what your standing opens. Tap a town to inspect it, then take its contract from
// here, or fly there empty on a ferry flight. Rules live in career.js and crew.js.
import { POWERS, TOWNS, RANKS, standingIn, isOpen, opensFrom, ferryFuel, FERRY_MAX_KM, holdOf } from './career.js';
import { CLANS, clanOf, strengthOf, MAX_THREAT } from './crew.js';
import { threatPips } from './board-crew.js';
import { REGIONS } from '../modes/belt-run/regions.js';

const face = (id) => `${import.meta.env?.BASE_URL ?? '/'}portraits/${id}.jpg`;

// Where each town sits (viewBox 1000 x 748). The Sun is far off to the left; the
// heliopause curves across the right-hand edge.
export const CHART = {
  'Salacia Cut': [312, 396], 'Haumea Reach': [202, 226], 'Varda Steps': [112, 136],
  'Orcus Ward': [492, 496], 'Makemake Drift': [372, 666], 'Quaoar Landing': [692, 396],
  'Ixion Row': [822, 556], 'Sedna Lanterns': [542, 196], 'Gonggong Narrows': [742, 86],
  'Arrokoth Market': [882, 216],
};
const W = 1000, H = 748, SUN = [-1548, 396];
// Reserve enough credits for the longest easy lane, so the generated fare always fits.

export function statusOf(c, t) {
  if (t === c.town) return 'here';
  if (TOWNS[t].needs?.town === null) return 'uncharted';
  if (!isOpen(c, t)) return 'locked';
  return c.offers.some((k) => k.to === t) ? 'offer' : 'open';
}

// Each power's mark, as on the canvas: square, circle, triangle, diamond, ring. Hollow when locked.
function mark(power, hollow, size = 14) {
  const col = POWERS[power].color, f = hollow ? `fill='none' stroke='${col}' stroke-width='1.8'` : `fill='${col}'`;
  const shape = {
    meridian: `<rect x='2' y='2' width='10' height='10' ${f}/>`,
    halcyon: `<circle cx='7' cy='7' r='${hollow ? 5.5 : 6}' ${f}/>`,
    sable: `<path d='M7 1 L13 13 L1 13 Z' ${f}/>`,
    free: `<path d='M7 ${hollow ? 1 : 0} L${hollow ? 13 : 14} 7 L7 ${hollow ? 13 : 14} L${hollow ? 1 : 0} 7 Z' ${f}/>`,
    kindred: `<circle cx='7' cy='7' r='5' fill='none' stroke='${col}' stroke-width='2.4'/>`,
  }[power];
  return `<svg width='${size}' height='${size}' viewBox='0 0 14 14' aria-hidden='true'>${shape}</svg>`;
}

const pct = ([x, y]) => `left:${(x / W) * 100}%;top:${(y / H) * 100}%`;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function routes(c) {
  const here = CHART[c.town];
  const lines = { offer: [], open: [], locked: [], uncharted: [] };
  
  for (const t of Object.keys(TOWNS)) {
    const st = statusOf(c, t);
    if (st === 'here' || !CHART[t]) continue;
    const [x, y] = CHART[t];
    lines[st].push(`<path d='M${here[0]} ${here[1]} L${x} ${y}'/>`);
        const m = mid(here, CHART[t]);
    if (st === 'locked') lines.locked.push(`<g class='lock' transform='translate(${m[0] - 6} ${m[1] - 5})'><rect y='4' width='12' height='10' rx='1.5'/><path d='M2.5 4 L2.5 1.5 A3.5 3.5 0 0 1 9.5 1.5 L9.5 4' fill='none'/></g>`);
  }
  return lines;
}

function town(c, t, i, sel, h) {
  const st = statusOf(c, t), T = TOWNS[t];
    const label = st === 'uncharted' ? `${t.split(' ')[0]}?` : t;
  const k = st === 'offer' ? c.offers.find((o) => o.to === t) : null;
  const pay = k ? `<span class='chart-pay'>${h.esc(k.cargo.split(' ')[0])} \u00b7 ${h.cr(k.pay)}</span>` : '';
  const flip = st === 'uncharted' ? ' below' : CHART[t][0] >= 700 ? ' flip' : '';   // near the right edge the label reads leftwards
  return `<button type='button' class='chart-town is-${st}${flip}${sel === t ? ' sel' : ''}' data-t='${i}' style='${pct(CHART[t])}' aria-pressed='${sel === t}'>
    <span class='chart-dot'>${mark(T.power, st === 'locked')}</span><span class='chart-name'>${h.esc(label)}</span>${pay}</button>`;
}

function inspector(c, t, h) {
  const T = TOWNS[t], p = POWERS[T.power], st = statusOf(c, t);
  const uncharted = st === 'uncharted';
  const clanKey = clanOf(t), clan = CLANS[clanKey], s = Math.min(MAX_THREAT, strengthOf(c, clanKey));
  const rank = standingIn(c, t);
  let route, act = '';
  if (st === 'here') route = 'You are here';
  else if (st === 'offer') {
    const i = c.offers.findIndex((k) => k.to === t), k = c.offers[i];
    const heavy = k.tons > holdOf(c);
    route = `On the board: ${h.esc(k.job.toLowerCase())}, ${h.cr(k.pay)} cr`;
    act = `<button type='button' class='chart-act chart-take' data-i='${i}'${heavy ? ' disabled' : ''}>${heavy ? 'Needs a cargo frame' : 'Take this contract'}</button>`;
  } else if (st === 'open') {
    const fuel = ferryFuel(FERRY_MAX_KM), poor = c.credits < fuel;
    route = 'Open. No contract out of here goes there today';
    act = `<button type='button' class='chart-act chart-ferry'${poor ? ' disabled' : ''}>${poor ? `Ferry needs ${h.cr(fuel - c.credits)} more` : `Ferry flight \u00b7 up to ${h.cr(fuel)} cr fuel`}</button>
      <p class='chart-small'>Fly there empty: no fee, no standing. Go where the work is.</p>`;
  } else if (st === 'locked') route = `Locked: ${RANKS[T.needs.rank]} with ${h.esc(T.needs.town)} (you are ${RANKS[standingIn(c, T.needs.town)]})`;
  else route = 'Uncharted. No two charts agree on it';
  const opens = opensFrom(t).map(([name, r]) => `${RANKS[r]} here opens ${h.esc(name)}${standingIn(c, t) >= r ? ' (open)' : ''}`);
  const pips = [0, 1, 2, 3, 4].map((i) => `<i style='background:${!uncharted && i < rank ? p.color : 'rgba(239,228,208,.16)'}'></i>`).join('');
  const raid = uncharted ? '<span>Unknown</span>'
    : s ? `<span class='chart-raid'><img src='${face(clan.portrait)}' alt=''>${threatPips(s)} ${h.esc(clan.name)}</span>`
      : `<span>${h.esc(clan.name)}: broken, for now</span>`;
  return `<section class='chart-panel chart-inspect' aria-live='polite'>
    <p class='chart-power' style='color:${p.color}'>${mark(T.power, false, 11)} ${h.esc(p.name)}</p>
    <h3>${h.esc(uncharted ? `${t.split(' ')[0]}?` : t)}</h3>
    <p class='chart-blurb'>${h.esc(T.blurb ?? '')}</p>
    <dl class='chart-dl'>
            <dt>People</dt><dd>${h.esc(T.people ?? p.people)}</dd>
      <dt>Lanes</dt><dd>${uncharted ? 'Unknown' : `${h.esc(REGIONS[T.power].name)}: ${h.esc(REGIONS[T.power].hazard.toLowerCase())}`}</dd>
      <dt>Route</dt><dd class='route-${st}'>${route}</dd>
      <dt>Raiders</dt><dd>${raid}</dd>
      ${opens.length ? `<dt>Opens</dt><dd>${opens.join('<br>')}</dd>` : ''}
    </dl>
    ${act}
    <div class='chart-standing'><div><span>Your standing</span><span>${uncharted ? 'Unknown' : `${RANKS[rank]} \u00b7 ${rank} of 5`}</span></div><div class='chart-pips'>${pips}</div></div>
  </section>`;
}

function powers(c, h) {
  const rows = Object.entries(POWERS).map(([key, p]) => {
    const towns = Object.keys(TOWNS).filter((t) => TOWNS[t].power === key && TOWNS[t].needs?.town !== null);
    const best = towns.length ? Math.max(...towns.map((t) => standingIn(c, t))) : null;
    const clanKey = towns.length ? clanOf(towns[0]) : null;
    return `<div class='chart-pw'>${mark(key, false)}<b>${h.esc(p.name)}</b><span style='color:${best ? p.color : ''}'>${best === null ? 'Unknown' : RANKS[best]}</span>
      <span class='chart-pw-note'>${h.esc(p.blurb ?? '')}${clanKey ? ` Lanes raided by ${h.esc(CLANS[clanKey].name)}.` : ''}</span></div>`;
  }).join('');
  return `<section class='chart-panel'><h3 class='chart-h'>Powers of the belt</h3>${rows}
    <p class='chart-small'>Best standing in each power's towns.</p></section>`;
}

export function renderChart(c, h, sel) {
  const pick = TOWNS[sel] ? sel : c.town;
  const lines = routes(c);
  const [sx, sy] = SUN;
  const band = (r, w, o, dash) => `<circle cx='${sx}' cy='${sy}' r='${r}' stroke-width='${w}' opacity='${o}'${dash ? ` stroke-dasharray='${dash}'` : ''}/>`;
  return `${h.art}
    <div class='board-inner'>
      ${h.top(h.back)}
      <div class='board-hero'>
        <p class='board-kicker'>Navigation chart</p>
        <h2>The Belt</h2>
        <p class='board-sub'>Routes out of ${h.esc(c.town)}. Tap a town to inspect it.</p>
      </div>
      <div class='chart-grid'>
        <section class='chart-panel chart-mapwrap' aria-label='Chart'>
          <div class='chart-scroll'><div class='chart-map'>
            <svg class='chart-svg' viewBox='0 0 ${W} ${H}' aria-hidden='true'>
              <g fill='none' stroke='#efe4d0'>${band(1760, 70, 0.035)}${band(1960, 110, 0.045)}${band(2170, 80, 0.035)}${band(1860, 1, 0.1, '2 8')}${band(2060, 1, 0.1, '2 8')}${band(2260, 1, 0.1, '2 8')}</g>
              <circle cx='${sx}' cy='${sy}' r='2420' fill='none' stroke='#a597c4' stroke-width='18' opacity='0.12'/>
              <circle cx='${sx}' cy='${sy}' r='2420' fill='none' stroke='#b9acd6' stroke-width='1.5' opacity='0.7'/>
              <g class='r-open'>${lines.open.join('')}</g>
              <g class='r-locked'>${lines.locked.join('')}</g>
              <g class='r-uncharted'>${lines.uncharted.join('')}</g>
              <g class='r-offer'>${lines.offer.join('')}</g>
              <g stroke='#d9c8aa' stroke-width='1.6' fill='none'><path d='M74 514 L26 514'/><path d='M34 507 L26 514 L34 521'/></g>
            </svg>
            <span class='chart-note sol' style='${pct([24, 540])}'>Toward Sol<br><b>44 AU</b></span>
            <span class='chart-note hp' style='${pct([985, 700])}'><b>Heliopause</b><br>Past here, no AI's law</span>
            
            ${Object.keys(TOWNS).filter((t) => CHART[t]).map((t) => town(c, t, Object.keys(TOWNS).indexOf(t), pick, h)).join('')}
          </div></div>
          <div class='chart-key'>
            <span><svg width='34' height='6'><path d='M1 3 L33 3' stroke='#e58a3a' stroke-width='2.5' stroke-dasharray='9 6'/></svg>Contract on the board</span>
            <span><svg width='34' height='6'><path d='M1 3 L33 3' stroke='#efe4d0' stroke-width='2' opacity='.6'/></svg>Open route</span>
            <span><svg width='34' height='6'><path d='M2 3 L33 3' stroke='#bfae92' stroke-width='2' stroke-dasharray='1 7' stroke-linecap='round'/></svg>Locked by standing</span>
            <span><svg width='34' height='6'><path d='M1 3 L33 3' stroke='#b9acd6' stroke-width='1.5' stroke-dasharray='10 10'/></svg>Uncharted</span>
          </div>
        </section>
        <div class='chart-side'>${inspector(c, pick, h)}${powers(c, h)}</div>
      </div>
      <p class='ship-toast chart-toast' aria-live='polite'>${h.esc(h.toast || '')}</p>
    </div>`;
}
