# Robot radio clips

Ten short English robot callouts for Heliopause Runner. Each is mono, 48 kHz, 64 kbit/s MP3,
with short radio punctuation and matched speech levels. All are under one second. Decode with
Web Audio and route to the game's SFX bus. Use the matching manifest text for subtitles.

| File | Phrase | Suggested moment |
| --- | --- | --- |
| 01-on-your-wing.mp3 | On your wing. | Formation established |
| 02-raiders-ahead.mp3 | Raiders ahead. | Raider contact |
| 03-weapons-free.mp3 | Weapons free. | Combat starts |
| 04-target-down.mp3 | Target down. | Raider destroyed |
| 05-taking-fire.mp3 | Taking fire. | Escort hit |
| 06-hull-critical.mp3 | Hull critical. | Critical hull warning |
| 07-falling-back.mp3 | Falling back. | Escort retreats |
| 08-watch-the-rocks.mp3 | Watch the rocks. | Asteroid warning |
| 09-hull-patched.mp3 | Hull patched. | Repairs complete |
| 10-zone-clear.mp3 | Zone clear. | Dead Zone cleared |

Created locally from macOS's Daniel voice using a 24-band vocoder, fixed electronic carriers,
light ring modulation, short delay, radio blips and static. The carrier alternates between
118, 132 and 145 Hz for subtle robot variations. No external voice API was used.

Rebuild with `scripts/generate-robot-radio.py` using existing macOS `say`, `ffmpeg` and a Python
runtime with NumPy. No packages are added to the game. The listening reel is in
`docs/audio/robot-radio-preview.mp3`.

Lossless authoring masters are kept in `docs/audio/robot-radio-masters`; the public folder
contains the compressed game assets. MP3 files work with HTML audio or Web Audio.

The flight now uses these through `src/modes/belt-run/robotRadio.js`. `config.radio` controls
the shared 24-second cooldown, four-phrase trip limit, routine-event chance and music dip.
Clips load after audio starts and remain decoded across trips; skipped cues are not queued.
