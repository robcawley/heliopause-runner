"""Create browser music from Rob's unreleased masters without changing the originals."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTERS = Path.home() / "Documents/My Music Production/_MASTERS/03 Unreleased"
OUTPUT = ROOT / "public/audio/music"
TRACKS = [("Peshawar", "peshawar"), ("Shankill", "shankill"), ("Somnum Europa", "somnum-europa")]


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    tracks = []
    for title, slug in TRACKS:
        source = next((MASTERS / title).glob("*.wav"))
        target = OUTPUT / f"{slug}.mp3"
        # ffmpeg downmixes the two six-channel masters to stereo before loudness matching.
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-ac", "2", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100",
            "-codec:a", "libmp3lame", "-q:a", "5", "-map_metadata", "-1",   # VBR, about 130 kbit/s
            "-metadata", f"title={title}", "-metadata", "artist=Rob Cawley", str(target),
        ], check=True)
        info = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "json", str(target),
        ], text=True))
        tracks.append({"title": title, "file": target.name, "artist": "Rob Cawley",
                       "duration": round(float(info["format"]["duration"]), 2), "bytes": target.stat().st_size})
        print(f"{title}: {target.stat().st_size:,} bytes")
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "format": "MP3, stereo, 44.1 kHz, VBR quality 5 (about 130 kbit/s)",
        "normalisation": "-16 LUFS, true peak limit -1.5 dBTP", "tracks": tracks,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
