# Robot radio clips

Ten short English robot callouts for Heliopause Runner. Each is mono, 48 kHz, 16-bit PCM WAV,
with short radio punctuation and matched speech levels. All are under one second. Decode with
Web Audio and route to the game's SFX bus. Use the matching manifest text for subtitles.

| File | Phrase | Suggested moment |
| --- | --- | --- |
| 01-on-your-wing.wav | On your wing. | Formation established |
| 02-raiders-ahead.wav | Raiders ahead. | Raider contact |
| 03-weapons-free.wav | Weapons free. | Combat starts |
| 04-target-down.wav | Target down. | Raider destroyed |
| 05-taking-fire.wav | Taking fire. | Escort hit |
| 06-hull-critical.wav | Hull critical. | Critical hull warning |
| 07-falling-back.wav | Falling back. | Escort retreats |
| 08-watch-the-rocks.wav | Watch the rocks. | Asteroid warning |
| 09-hull-patched.wav | Hull patched. | Repairs complete |
| 10-zone-clear.wav | Zone clear. | Dead Zone cleared |

Created locally from macOS's Daniel voice using a 24-band vocoder, fixed electronic carriers,
light ring modulation, short delay, radio blips and static. The carrier alternates between
118, 132 and 145 Hz for subtle robot variations. No external voice API was used.

Rebuild with `scripts/generate-robot-radio.py` using existing macOS `say`, `ffmpeg` and a Python
runtime with NumPy. No packages are added to the game. The listening reel is in
`docs/audio/robot-radio-preview.wav`.
