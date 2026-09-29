# Feel log

The project was called Kuiper Blast 2 until 28 Sept 2026, when it became the flight core of
Heliopause Runner.

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

## 2026-09-29 — an arena, not a corridor

Rob: the safe zone circles should be much wider. Attack ships and more are coming; the pilot needs
much more ability to fly around, turn around, fly free.

Changes: lane safe radius 30 → 160 m (warn at 135, rings every 260 m, repair gates within 64 m of
the centre, core repair within 80 m). Flight moved from yaw/pitch angles to a true orientation:
pitch, yaw and roll about the ship's own axes, so loops and inverted flight work. Q / E now roll
(hold); barrel roll is any double-tap (Q, E, A, D, or a bumper). Auto-level eases the wings back
when you let go of roll; it stands back while you pull hard on pitch.

To judge next: is 160 m roomy enough, or too roomy for the belt to feel dangerous? Does auto-level
help or fight you (try 0 and 4 in Flight)? Is roll rate 2.8 right?

## 2026-09-29 — the freeze off the lane

Rob: straying far from the safe zone tends to freeze and visually crash.

Cause: a bug, not the design. The radiation alarm's code reused the name `a` for its two tones,
hiding the audio system of the same name, so the alarm threw an error the first time it sounded.
That stopped every frame from finishing, which froze the picture. Fixed, and `npm run lint` now
catches this class of mistake. The host also catches a frame error, logs it once and keeps flying,
so one bug can never freeze the game again.

Also: at full radiation the screen washed out to amber static, which read as a crash in itself. The
bleed now stays at the edges, grain is much lighter, and the centre is always clear. Deaths are
calmer: a radiation death has no debris and fades out; a rock breach throws a small spray that
travels with the ship instead of a wall of shards in the pilot's face.

## 2026-09-29 — PIP, blasters, and mouse flight that stays put

Rob: it is quite easy to lose control with the mouse; wants a droid that pops up when you drift
far and can take you back to the safe lane; and wants to test blasters.

Changes:
- Mouse: click the view to capture it. Mouse movement now pushes a virtual stick that eases back to
  centre (mouseRecentre 1.1, mouseRange 260 px), shown as a dot in a ring at screen centre. Esc
  releases the mouse and pauses.
- PIP: a small droid on the right of the dash. Pops up at 85% of the lane radius with a chirp and an
  offer; R hands it the stick; it flies you to 45% of the radius and hands back once you are inside
  60% and pointing down the lane. Hard stick input or R takes over. R also works as a panic button.
- Blasters: left click / F / right trigger. Nine shots a second alternating barrels, converging at
  160 m, heat 5.5 per shot, cools 32 a second, overheat locks until 35. Rocks take size x size x 1.2
  hits; small ones pop in one or two, big ones take a burst; giants cannot be broken. Visible gun
  barrels at the bottom corners of the canopy.

To judge next: does the captured mouse feel controllable (too twitchy: raise mouse travel; drifts
back too fast: lower self-centring)? Is PIP's timing right, and does its flying look competent? Do
the blasters feel punchy: fire rate, bolt visibility, heat?

## 2026-09-29 — usability and fun QA

Playtest finding: the title screen asked the player to read a dense control manual (and clipped it
at laptop height), while the flight exposed several good toys without giving the first run a goal.

Changes: the launch screen now leads with four essential controls and teaches the advanced moves
in three short in-flight prompts. A visible field test ties the existing systems together: fly 2 km
down the lane, earn 3 close calls, and break 5 rocks for a 1,000-point completion bonus and MICA
payoff. The pause screen is now the full control reference. HUD prompts have a dark backing for
legibility over dust and sunlight, and the compact challenge panel moves clear of touch controls on
small screens.

To judge next: do the three goals complete in roughly the same run, or is one consistently left
behind? If the close calls lag, try 2 rather than widening their detection radius; if rocks lag,
try 4 rather than making the blasters stronger.

## 2026-09-29 — control mapping across devices

Touch now has hold-to-boost, hold-to-brake, and pause buttons alongside steering, fire, phase,
barrel dodge and PIP. Steering starts on the left side, leaving the right side for actions. Controller
A or Start can launch and restart, Start pauses, B joins X as a boost button, and the previous mouse
position no longer adds steering while using the controller. Title and pause instructions switch to
the active input device. A launch press is not spent on the phase drive.

To judge on hardware: thumb reach and button spacing on a phone, and bumper double-tap timing on
an actual controller. Browser emulation cannot establish those feel judgments.

## 2026-09-29 — QA fixes: the fairness pass

A code-level QA found ten places where the game broke its own promises. Fixed:

1. Blasters converge on the first rock under the reticle (within `aimRange` 400 m), falling back to
   160 m. Before, both streams passed either side of a small rock dead ahead at 30 m.
2. A rock you phase into stays harmless until you are out the other side, even if the phase ends
   first (slow motion made big rocks take longer to cross than the phase lasts).
3. The barrel roll's sideways burst decays in world time, so a roll in slow motion carries the same
   ~6.5 m as at full speed (it was about 40% after a near miss).
4. Double-tapping A / D no longer barrel-rolls (it fired on ordinary steering corrections). Q / E still
   do. Switch the old behaviour back on under Stick: "dodge on A / D double-tap".
5. No rock deals more than 45 hull (`rockDamageMax`); giants used to one-shot you. Shooting a giant
   gives a dull clank and "Too big to break" once a run. PIP now looks ahead while flying you home and
   phases (or rolls clear) instead of flying you into ice.
6. Ctrl no longer brakes (Ctrl+W closes the tab on Windows). Keys use physical positions (`e.code`), so
   WASD works on any layout and a modifier can never leave a key stuck.
7. A connected controller only takes over when it moves away from where it rests (worn sticks and
   odd mappings used to switch mouse flight off); moving the mouse hands control straight back.
8. Presses made while paused are thrown away instead of firing on resume.
9. Rock collisions are swept across the whole frame, so nothing tunnels through the hull at boost on
   a slow frame, and a pass through the hull can no longer score as a near miss.
10. On touch, a tap on the right side that misses a button does nothing (it used to fire the phase).

Checked headlessly against the real flight, rock and blaster code (all pass). Still to judge by hand:
does converging on the target make the guns feel too easy at range? Does PIP's automatic phase read
as competent or as a cheat? Is 45 the right ceiling for a giant?

## 2026-09-29 — Phone controls: a thumb arc

Rob's first phone run (iPhone, portrait) was a mess: the seven touch buttons were flex-wrapped
into a 205 px box, so Phase and both rolls overlapped and Fire sat mid-cluster; iOS started
text selection on a held thumb; MICA's line and the hints sat on top of the buttons; and
Boost/Brake had to be held by the same thumb that holds Fire.

Changes: Fire in the corner (92 px) with Phase, the rolls (proper icons), PIP and Boost/Brake
on an arc around it, none overlapping, all 44 px or more, each lighting up when pressed. Fire
keeps firing if the thumb drifts off it. Boost and Brake latch by default (tap on, tap again or
tap the other to stop; tuning panel: Stick → touch boost/brake latch). Text selection, callout
menus and pinch-zoom are off. Portrait and landscape each get their own HUD layout, with the
comms line and hints kept clear of both thumbs.

To judge on the phone:
- Does Fire in the corner with Phase to its left feel natural, or should Phase and Fire swap?
- Latching Boost/Brake: freeing, or do you forget they are on?
- Portrait or landscape: is portrait worth supporting properly, or should we ask for landscape?

## 2026-09-29 — Touch steering: less twitchy

Rob, on the phone: movement "a little too responsive". Touch hit full deflection at 70 px of drag,
shared the mouse's curve (1.35) and had no smoothing, so thumb wobble became turns.

Touch now has its own settings (tuning panel → Stick): reach 90 px, deadzone 0.06, centre curve 1.6,
smoothing 0.06 s. A half-way drag now asks for about half the turn it used to; a full drag still
gives a full-rate turn. Mouse, keyboard and gamepad are unchanged.

To judge: still twitchy → raise touch reach (100–110) or the curve (1.8); now sluggish → lower the
smoothing first (0.03), then the curve.
