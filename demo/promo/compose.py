"""Cut the vertical Rabble promo (1080×1920, about a minute): gameplay clips
from the recorded take, with the cutaway cards in between.
Writes demo/promo/out/rabble-promo.mp4 and a poster frame.

  python demo/promo/compose.py   (after record.mjs and record_cards.mjs)
"""
import json
import os
import subprocess

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, "out")
FPS = 30

# (source, mark, seconds after the mark, seconds of source, speed)
# source "take" is the gameplay recording; anything else is a card.
SEGMENTS = [
    ("title", "ready", 0.0, 2.4, 1.0),
    ("take", "menu", 1.0, 8.0, 1.6),        # people fall in; turn it; zoom in and out
    ("meta", "ready", 0.0, 2.8, 1.0),
    ("you", "ready", 0.0, 2.8, 1.0),
    ("take", "photo", 0.0, 2.6, 1.0),       # choose a photo...
    ("take", "making", 0.2, 1.6, 1.0),      # ...it's being made...
    ("take", "made", -0.2, 2.6, 1.0),       # ...here you are
    ("dive", "ready", 0.0, 2.4, 1.0),
    ("take", "join", 0.0, 8.0, 1.8),        # drop in, look around
    ("take", "zoom", 0.0, 6.5, 1.6),        # all the way in
    ("take", "bop", 0.0, 4.2, 1.15),        # tap: they bop
    ("ring", "ready", 0.0, 2.4, 1.0),
    ("take", "ring", 0.6, 10.5, 1.9),       # city, then state
    ("talk", "ready", 0.0, 3.0, 1.0),
    ("say", "ready", 0.0, 2.4, 1.0),
    ("take", "say", 0.4, 3.6, 1.3),         # typing
    ("take", "answered", -0.5, 8.5, 1.4),   # the answers
    ("together", "ready", 0.0, 2.4, 1.0),
    ("next", "ready", 0.0, 3.0, 1.0),
    ("end", "ready", 0.0, 3.0, 1.0),
]


def load(source):
    folder = os.path.join(DIR, "frames" if source == "take" else os.path.join("cards", source))
    data = json.load(open(os.path.join(folder, "frames.json")))
    marks = {m["name"]: m["t"] for m in data["marks"]}
    return folder, data["frames"], marks


def clip(i, source, mark, after, length, speed):
    """One segment as its own mp4, each frame held as long as it really showed."""
    folder, frames, marks = load(source)
    start = marks[mark] + after
    end = start + length
    picked = [f for f in frames if start <= f["t"] < end]
    before = [f for f in frames if f["t"] < start]
    if before:                                  # the frame on screen when the segment starts
        picked.insert(0, dict(before[-1], t=start))
    lines = []
    for a, b in zip(picked, picked[1:] + [{"t": end}]):
        lines += [f"file '{os.path.join(folder, a['file'])}'", f"duration {(b['t'] - a['t']) / speed:.4f}"]
    lines.append(f"file '{os.path.join(folder, picked[-1]['file'])}'")
    listing = os.path.join(OUT, f"seg{i:02d}.txt")
    open(listing, "w").write("\n".join(lines) + "\n")
    path = os.path.join(OUT, f"seg{i:02d}.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing,
                    "-vf", f"fps={FPS},scale=1080:1920:flags=lanczos,format=yuv420p",
                    "-t", f"{length / speed:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "17",
                    path], check=True)
    return path, length / speed


def main():
    os.makedirs(OUT, exist_ok=True)
    parts, total = [], 0.0
    for i, seg in enumerate(SEGMENTS):
        path, secs = clip(i, *seg)
        parts.append(path)
        total += secs
        print(f"{seg[0]:>9} {seg[1]:<12} {secs:5.2f}s")
    listing = os.path.join(OUT, "parts.txt")
    open(listing, "w").write("".join(f"file '{p}'\n" for p in parts))
    final = os.path.join(OUT, "rabble-promo.mp4")
    # A silent track too: some players won't autoplay or post a video without one.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing,
                    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "19",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-shortest",
                    "-movflags", "+faststart", final], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "4", "-i", final, "-frames:v", "1",
                    "-q:v", "3", os.path.join(OUT, "rabble-promo.jpg")], check=True)
    print(f"{final}  {total:.1f}s")


if __name__ == "__main__":
    main()
