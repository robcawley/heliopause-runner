import * as THREE from 'three/webgpu';

// Regions: every power's lanes fly differently. A contract flies the region of its destination
// (tycoon/career.js puts trip.region and trip.level on the trip). Each region has its own look
// (fog, light, rock colour, how crowded the belt is) and one signature hazard, pushed harder
// by harder contracts (level 1 to 3):
//
//   meridian  The Beacon Lanes    the well-kept lanes: clear, steady, the place to learn
//   halcyon   The Cold Nursery    pale ice fog; whiteouts roll through and close the view down
//   sable     The Foundry Storm   rust-dark; magnetic surges drag the ship sideways, with warning
//   free      The Narrows         crowded, tight rock; more of it, and bigger
//   kindred   The Heliopause      violet and strange (uncharted, for now)
//
// Weather is off inside a Dead Zone, which keeps its own rules.

export const REGIONS = {
  meridian: {
    name: 'The Beacon Lanes', hazard: 'Clear, well-kept lanes', fog: 0x050a16, near: 150, far: 480, sun: 0xfff1dc, density: 1,
    rock: { ice: [0.46, 0.52, 0.6], carbon: [0.09, 0.085, 0.09], rim: [0.25, 0.55, 0.75] },
    intro: ['Meridian lanes. Beacons all the way. Enjoy it while it lasts.', 'Beacon Lanes. Clear run. Watch the traffic.'],
  },
  halcyon: {
    name: 'The Cold Nursery', hazard: 'Whiteouts: ice fog closes in', fog: 0x2a3c48, near: 70, far: 330, sun: 0xd8ecff, density: 0.9,
    rock: { ice: [0.78, 0.86, 0.92], carbon: [0.22, 0.27, 0.32], rim: [0.45, 0.75, 0.95] },
    weather: 'whiteout',
    intro: ['Halcyon space. Ice fog in these lanes. When a whiteout rolls in, slow down and trust the beacons.', 'Cold Nursery lanes. Visibility drops without warning out here.'],
  },
  sable: {
    name: 'The Foundry Storm', hazard: 'Magnetic surges drag the ship', fog: 0x1c0f0a, near: 120, far: 420, sun: 0xffb27a, density: 1.05,
    rock: { ice: [0.36, 0.3, 0.27], carbon: [0.06, 0.045, 0.04], rim: [0.85, 0.42, 0.18] },
    weather: 'surge',
    intro: ['Sable lanes. The foundries throw magnetic surges. I will call them; lean against the pull.', 'Foundry Storm. Iron rock, live fields. Expect to be dragged.'],
  },
  free: {
    name: 'The Narrows', hazard: 'Crowded rock: more of it, and bigger', fog: 0x0e0b12, near: 130, far: 440, sun: 0xffe2b8, density: 1.35,
    rock: { ice: [0.5, 0.44, 0.38], carbon: [0.1, 0.08, 0.07], rim: [0.7, 0.55, 0.35] },
    sizeScale: 1.25,
    intro: ['Free Holdings lanes. Nobody clears the rock out here. Thread it.', 'The Narrows. Tight flying. Keep your speed honest.'],
  },
  kindred: {
    name: 'The Heliopause', hazard: 'Unknown', fog: 0x150c22, near: 110, far: 420, sun: 0xd4c4ff, density: 1.1,
    rock: { ice: [0.5, 0.45, 0.62], carbon: [0.08, 0.06, 0.12], rim: [0.6, 0.45, 0.95] },
    intro: ['Past the heliopause. No beacons, no law. I do not like this.'],
  },
};
export const regionOf = (key) => REGIONS[key] ?? REGIONS.meridian;

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = THREE.MathUtils.clamp;

// host: { config, scene, ship, rocks, hud, rig, sfx, fogBase, sunCol, flash(k) }
export function createWeather(host) {
  const { config, scene, ship } = host;
  const base = { near: config.world.fogNear, far: config.world.fogFar, min: config.world.rockMinSize, max: config.world.rockMaxSize };
  let region = REGIONS.meridian, level = 1, t = 0, timer = 0, state = 'calm', k = 0, side = 1, introDone = false, active = false;
  const push = new THREE.Vector3();

  function reset(trip) {
    region = regionOf(trip?.region);
    level = trip?.level ?? 1;
    active = !!trip;
    state = 'calm'; k = 0; t = 0; introDone = false;
    timer = 14 + Math.random() * 8;
    host.fogBase.set(region.fog);
    host.sunCol.set(region.sun);
    scene.fog.near = region.near; scene.fog.far = region.far;
    config.world.fogNear = region.near; config.world.fogFar = region.far;
    config.run.density *= region.density;
    config.world.rockMinSize = base.min * (region.sizeScale ?? 1);
    config.world.rockMaxSize = base.max * (region.sizeScale ?? 1);
    host.rocks.setTint?.(region.rock);
  }

  const say = (text) => host.hud.say('MICA', text, 5);

  // flying: the lane's rules are on (not take-off, not in a Dead Zone)
  function update(dt, flying) {
    t += dt;
    if (active && flying && !introDone && t > 6) { introDone = true; say(pick(region.intro)); }
    let fogScale = 1;
    if (!active || !flying || !region.weather) { state = 'calm'; k = Math.max(0, k - dt); }
    else {
      timer -= dt;
      const gap = [26, 20, 15][level - 1] ?? 20;
      if (region.weather === 'whiteout') {
        // calm -> rolling in (warned) -> whiteout -> clearing
        if (state === 'calm' && timer <= 0) { state = 'in'; timer = 3; say(pick(['Whiteout rolling in.', 'Fog bank ahead. Ease off.', 'Here it comes. Whiteout.'])); host.hud.callout('Whiteout', 1, true); }
        else if (state === 'in') { k = Math.min(1, k + dt / 3); if (timer <= 0) { state = 'hold'; timer = 5 + level * 2; } }
        else if (state === 'hold') { k = 1; if (timer <= 0) { state = 'out'; timer = 3; } }
        else if (state === 'out') { k = Math.max(0, k - dt / 3); if (timer <= 0) { state = 'calm'; timer = gap + Math.random() * 10; } }
        fogScale = 1 - k * (0.4 + level * 0.1);
      } else if (region.weather === 'surge') {
        // calm -> warning (which way it will pull) -> surge -> calm
        if (state === 'calm' && timer <= 0) {
          state = 'warn'; timer = 2.2; side = Math.random() < 0.5 ? -1 : 1;
          host.hud.callout(`Mag surge · pulling ${side > 0 ? 'right' : 'left'}`, side, true);
          say(side > 0 ? 'Surge building. It will pull you right.' : 'Surge building. Pulling left.');
          host.sfx?.alarm?.(false);
        } else if (state === 'warn') { k = 0; if (timer <= 0) { state = 'surge'; timer = 2.5 + level; host.flash(0.35); host.rig.addTrauma(0.25); } }
        else if (state === 'surge') {
          k = Math.min(1, k + dt * 3);
          push.copy(ship.right).multiplyScalar(side * (14 + level * 6) * k * dt);
          ship.dodge.add(push);
          host.rig.addTrauma(0.6 * dt);
          if (Math.random() < dt * 2.5) host.flash(0.12);
          if (timer <= 0) { state = 'calm'; timer = gap + Math.random() * 8; }
        } else k = Math.max(0, k - dt * 2);
      }
    }
    scene.fog.near = region.near * clamp(fogScale, 0.15, 1);
    scene.fog.far = region.far * clamp(fogScale, 0.35, 1);
  }

  return { reset, update, get region() { return region; }, get state() { return state; } };
}
