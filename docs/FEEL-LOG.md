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
