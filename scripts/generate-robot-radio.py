"""Render short radio assets with macOS speech and a 24-band FFT vocoder.

Uses existing authoring tools (say, ffmpeg and NumPy), not game dependencies.
Run from any directory; outputs live under public/audio/robot-radio.
"""

import json
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/audio/robot-radio"
MASTERS = ROOT / "docs/audio/robot-radio-masters"
RATE = 48000
LINES = [
    ("01-on-your-wing", "On your wing.", "Escorts form up after take-off"),
    ("02-raiders-ahead", "Raiders ahead.", "Raider contact or Dead Zone warning"),
    ("03-weapons-free", "Weapons free.", "Combat begins"),
    ("04-target-down", "Target down.", "A raider is destroyed"),
    ("05-taking-fire", "Taking fire.", "An escort takes damage"),
    ("06-hull-critical", "Hull critical.", "Hull falls into the critical range"),
    ("07-falling-back", "Falling back.", "An escort retreats to repair"),
    ("08-watch-the-rocks", "Watch the rocks.", "Rock hit or close asteroid warning"),
    ("09-hull-patched", "Hull patched.", "PIP or an escort finishes repairs"),
    ("10-zone-clear", "Zone clear.", "The Dead Zone is cleared"),
]


def read_wav(path):
    with wave.open(str(path), "rb") as source:
        assert source.getframerate() == RATE and source.getnchannels() == 1
        return np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(float) / 32768


def write_wav(path, samples):
    pcm = np.round(np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(RATE)
        target.writeframes(pcm.tobytes())


def encode_mp3(source, destination):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-codec:a", "libmp3lame", "-b:a", "64k", "-ar", str(RATE), "-ac", "1",
        "-map_metadata", "-1", str(destination),
    ], check=True)


def fade(samples, milliseconds=8):
    length = min(len(samples) // 2, int(RATE * milliseconds / 1000))
    if length:
        samples[:length] *= np.linspace(0, 1, length)
        samples[-length:] *= np.linspace(1, 0, length)
    return samples


def vocode(speech, pitch, seed):
    rng = np.random.default_rng(seed)
    loud = np.flatnonzero(np.abs(speech) > np.max(np.abs(speech)) * 0.018)
    assert len(loud), "Speech renderer returned silence"
    speech = speech[max(0, loud[0] - 960): min(len(speech), loud[-1] + 1920)]
    size, hop = 1024, 256
    original_length = len(speech)
    speech = np.pad(speech, (size, size))
    time = np.arange(len(speech)) / RATE
    phase = pitch * time + 0.012 * np.sin(2 * np.pi * 5 * time)
    saw = 2 * (phase % 1) - 1
    square = np.where(phase % 1 < 0.47, 1.0, -1.0)
    carrier = 0.7 * saw + 0.3 * square + 0.1 * rng.normal(size=len(time))
    window = np.hanning(size)
    frequencies = np.fft.rfftfreq(size, 1 / RATE)
    edges = np.geomspace(160, 7000, 25)
    bands = [(frequencies >= low) & (frequencies < high) for low, high in zip(edges[:-1], edges[1:])]
    result = np.zeros(len(speech))
    weight = np.zeros(len(speech))
    previous = np.zeros(len(bands))
    for start in range(0, len(speech) - size, hop):
        spoken = np.fft.rfft(speech[start:start + size] * window)
        synth = np.fft.rfft(carrier[start:start + size] * window)
        shaped = np.zeros_like(synth)
        for i, mask in enumerate(bands):
            if not mask.any():
                continue
            envelope = np.sqrt(np.sum(np.abs(spoken[mask]) ** 2))
            # Fast attack keeps consonants readable; a short release avoids a brittle buzz.
            envelope = 0.8 * envelope + 0.2 * previous[i]
            previous[i] = envelope
            energy = np.sqrt(np.sum(np.abs(synth[mask]) ** 2)) + 1e-9
            shaped[mask] = synth[mask] * envelope / energy
        result[start:start + size] += np.fft.irfft(shaped) * window
        weight[start:start + size] += window ** 2
    result /= np.maximum(weight, 1e-6)
    result = result[size:size + original_length]
    dry = speech[size:size + original_length]
    # A small intelligibility layer preserves very short words through the metallic carrier.
    result = 0.86 * result + 0.14 * dry
    result *= 0.9 + 0.1 * np.sin(2 * np.pi * 43 * np.arange(len(result)) / RATE)
    rms = np.sqrt(np.mean(result ** 2))
    result *= 0.11 / max(rms, 1e-9)
    result = np.tanh(result * 1.25) / 1.25
    echo = np.zeros(len(result) + 2880)
    echo[:len(result)] += result
    echo[2640:2640 + len(result)] += 0.1 * result
    result = fade(echo)

    # Radio punctuation is short enough to leave the words, and game music, in front.
    blip_time = np.arange(int(RATE * 0.035)) / RATE
    blip = fade(0.055 * np.sin(2 * np.pi * (1450 + seed * 25) * blip_time), 5)
    static = fade(rng.normal(0, 0.013, int(RATE * 0.025)), 5)
    clip = np.concatenate([np.zeros(480), blip, static, np.zeros(480), result, static * 0.6, np.zeros(960)])
    peak = np.max(np.abs(clip))
    if peak > 0.85:
        clip *= 0.85 / peak
    return clip


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    MASTERS.mkdir(parents=True, exist_ok=True)
    clips, manifest = [], []
    with tempfile.TemporaryDirectory(prefix="heliopause-radio-") as directory:
        temporary = Path(directory)
        for index, (name, text, trigger) in enumerate(LINES):
            raw, decoded = temporary / f"{name}.aiff", temporary / f"{name}.wav"
            subprocess.run(["say", "-v", "Daniel", "-r", "205", "-o", str(raw), text], check=True)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-ar", str(RATE), "-ac", "1", "-c:a", "pcm_s16le", str(decoded)], check=True)
            clip = vocode(read_wav(decoded), pitch=[118, 132, 145][index % 3], seed=index + 1)
            assert 0.25 < len(clip) / RATE < 2.5
            assert np.isfinite(clip).all() and np.max(np.abs(clip)) < 1
            master = MASTERS / f"{name}.wav"
            asset = OUTPUT / f"{name}.mp3"
            write_wav(master, clip)
            encode_mp3(master, asset)
            manifest.append({"id": name[3:], "file": f"{name}.mp3", "bytes": asset.stat().st_size, "text": text, "trigger": trigger, "duration": round(len(clip) / RATE, 3)})
            clips.append(clip)
            print(f"{name}: {len(clip) / RATE:.2f} s — {text}")
    (OUTPUT / "manifest.json").write_text(json.dumps({"format": "MP3, mono, 48 kHz, 64 kbit/s", "clips": manifest}, indent=2) + "\n")
    preview = ROOT / "docs/audio/robot-radio-preview.wav"
    preview.parent.mkdir(parents=True, exist_ok=True)
    write_wav(preview, np.concatenate([part for clip in clips for part in (clip, np.zeros(int(RATE * 0.4)))]))
    encode_mp3(preview, preview.with_suffix(".mp3"))


if __name__ == "__main__":
    main()
