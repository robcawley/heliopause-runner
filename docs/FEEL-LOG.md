# Feel log

After a tuning session, paste the values you changed (T, then Copy values) with a line on why.

## 2026-09-28 — first build

Starting values are in `src/config.js`. Things to judge on the first real play:

- Steering: does mouse-follow or drag feel better on the Mac? Is the spring too loose or too stiff?
- Is the near-miss radius generous enough that they happen often, without being trivial?
- Is the head lag noticeable but not woozy?
- Does the phase drive feel like a place you visit?
- Rock density: hits should be rare if you are paying attention.

## 2026-09-28 — free flight

Rob, after the first play: promising, but too hard to dodge. The pilot needs real freedom and a few rolls.

Changes: the bounded aim-point frame is gone. Free lateral flight with momentum (`maxLateral` 34,
`agility` 5.5), nose follows velocity, barrel rolls (3 charges, 2.4 s recharge, 38 impulse). Rocks
spawn around the ship's predicted position so the belt never runs out. The beacon lane (safe radius
18) keeps you honest: radiation outside, core repair and repair gates inside, death if you stay out.

To judge next: is dodging now satisfying rather than easy? How long can you stay out before it feels
unfair? Do rolls feel good with the camera rolling fully?

## 2026-09-28 — a fighter, not a sled

Rob: let pilots stay in radiation longer; more freedom; it should feel like really flying a nimble,
responsive, fun star fighter. Also: this will become a component of a bigger game.

Changes: rate-based turning (yaw 2.3, pitch 2.1 rad/s, turnResponse 13, stickCurve 1.35), the ship
flies where it points with a little drift (grip 7), boost 150 / brake 28, pilot glances into turns.
The world is now truly 3D: the ship moves through a static belt, rocks and dust are placed around
it, so you can turn right round. Lane widened to 30 m. Radiation reworked: harmless until exposure
60, then slow damage (see DESIGN.md for timings). Code split into engine / modes/belt-run / shell.

To judge next: is the turn rate right with a mouse? Too twitchy, raise stickCurve or lower yawRate;
too floaty, raise turnResponse. Does 30 m of lane feel roomy? Is ~45 s just outside the lane long
enough?
