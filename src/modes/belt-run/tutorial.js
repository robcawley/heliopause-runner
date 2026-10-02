// The first flight's onboarding: a short run of prompts that each wait for you to do the thing
// (or time out), shown as a hint chip with MICA saying it. Only on a new career's first
// contract (trip.tutorial). Labels follow the device you are using.

const KEYS = {
  keyboard: { steer: 'Mouse or WASD', boost: 'Hold Shift', brake: 'Hold X', fire: 'Click or F', phase: 'Space', roll: 'Q / E', pip: 'R' },
  gamepad: { steer: 'Left stick', boost: 'Hold B', brake: 'Hold LT', fire: 'RT', phase: 'A', roll: 'LB / RB', pip: 'Y' },
  touch: { steer: 'Left thumb', boost: 'BOOST', brake: 'BRAKE', fire: 'FIRE', phase: 'PHASE', roll: 'Double-tap a side', pip: 'PIP' },
};

// Each step: what to show, what MICA says, when it is done (or how long before moving on)
const STEPS = [
  { key: 'steer', text: 'to fly', mica: 'You have the stick. Get a feel for her.', done: (s) => s.steered > 1.2, max: 12 },
  { key: 'boost', text: 'to boost', mica: 'Open her up. Boost.', done: (s) => s.boosted > 0.8, max: 10 },
  { key: 'brake', text: 'to brake', mica: 'And the brakes. Useful in tight rock.', done: (s) => s.braked > 0.5, max: 8 },
  { key: 'fire', text: 'to fire. Break a rock', mica: 'Blasters are live. Break something.', done: (s) => s.broke > 0, max: 15 },
  { key: 'phase', text: 'to phase through rock', mica: 'The phase drive takes you through anything, briefly. Try it.', done: (s) => s.phased, max: 12 },
  { key: 'lane', text: 'Keep near the beacon lane', mica: 'Stay near the beacons. Out in the open, radiation cooks the hull.', done: () => false, max: 6, plain: true },
  { key: 'pip', text: 'if you are lost: PIP flies you back', mica: 'Lost? Call PIP and it flies us back to the lane.', done: () => false, max: 6 },
];

export function createTutorial(hudParent) {
  const chip = document.createElement('div');
  chip.className = 'tutor-chip';
  chip.setAttribute('aria-live', 'polite');
  hudParent.append(chip);
  let active = false, i = 0, t = 0, s = null;

  function show(step, device) {
    const k = (KEYS[device] ?? KEYS.keyboard)[step.key];
    chip.innerHTML = step.plain ? `<span>${step.text}</span>` : `<kbd>${k}</kbd><span>${step.text}</span>`;
    chip.classList.add('on');
  }

  return {
    reset(trip) {
      active = !!trip?.tutorial; i = 0; t = -4;      // a moment to settle after take-off
      s = { steered: 0, boosted: 0, braked: 0, broke: 0, phased: false, startBroke: null };
      chip.classList.remove('on');
    },
    // flying: you have the stick; input: input.state; game: { phasing, rocksDestroyed, device }
    update(dt, flying, input, game, say) {
      if (!active) return;
      if (!flying) { chip.classList.remove('on'); return; }
      const step = STEPS[i];
      if (!step) { active = false; chip.classList.remove('on'); say('That is the lot. Deliver the cargo and get paid.'); return; }
      t += dt;
      if (t < 0) return;
      if (t - dt < 0) { show(step, game.device); say(step.mica); }
      s.startBroke ??= game.rocksDestroyed;
      if (Math.hypot(input.stickX, input.stickY) > 0.35) s.steered += dt;
      if (input.boost) s.boosted += dt;
      if (input.brake) s.braked += dt;
      if (game.phasing) s.phased = true;
      s.broke = game.rocksDestroyed - s.startBroke;
      if (step.done(s) || t > step.max) {
        chip.classList.remove('on');
        i++; t = -1.2;                                 // a short gap between prompts
      }
    },
    get active() { return active; },
  };
}
