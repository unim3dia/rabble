"""Cut the vertical Rabble promo (1080×1920, about 90 seconds): gameplay from
the recorded take with the app's own sounds, the cutaway cards in between,
and music.py's score under it all.
Writes demo/promo/out/rabble-promo.mp4 and a poster frame.

  python demo/promo/compose.py   (after record.mjs and record_cards.mjs)

Every shot is one continuous stretch of the recording; a long wait inside a
shot is sped up rather than cut out, so nothing flashes by for a few frames.
"""
import json
import os
import subprocess

import numpy as np

import music

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, "out")
FPS = 30
SR = music.SR
MIN_SHOT_S = 3.0
SFX_MAX_SPEED = 1.6        # faster than this, the app's sounds are left out of that stretch
SFX_GAIN = 2.6             # the app plays its sounds quietly; bring them up over the music
MUSIC_GAIN = 0.32

# (source, mark, seconds after the mark, pieces). Each piece is (length, speed),
# one after another; a length can be the name of a mark ("until then").
SHOTS = [
    ("title", "ready", 0.0, [(3.4, 1.0)]),
    ("take", "menu", 0.8, [(8.4, 1.6)]),                            # people fall in; turn it; zoom
    ("meta", "ready", 0.0, [(3.9, 1.0)]),
    ("you", "ready", 0.0, [(3.9, 1.0)]),
    ("take", "photo", -1.4, [(4.0, 1.0), ("made", 10.0), (3.0, 1.0)]),  # choose → making → here you are
    ("dive", "ready", 0.0, [(3.9, 1.0)]),
    ("take", "join", 0.5, [(7.7, 1.5)]),                            # drop in, look around
    ("take", "zoom", 0.0, [(7.0, 1.6)]),                            # all the way in
    ("take", "bop", -0.3, [(4.6, 1.05)]),                           # tap: they bop
    ("ring", "ready", 0.0, [(3.9, 1.0)]),
    ("take", "ring-end", 0.9, [("tower", 1.4), (12.0, 1.5)]),       # the world falls in; the tower, slowly round
    ("talk", "ready", 0.0, [(4.2, 1.0)]),
    ("take", "talk", -0.4, [(8.6, 1.25)]),                          # one news conversation, above the pile
    ("take", "say", 0.4, [(3.8, 1.0), ("answered", 6.0), (7.0, 1.3)]),  # type → wait → answers
    ("next", "ready", 0.0, [(4.6, 1.0)]),
    ("end", "ready", 0.0, [(4.4, 1.0)]),
]


def load(source):
    folder = os.path.join(DIR, "frames" if source == "take" else os.path.join("cards", source))
    data = json.load(open(os.path.join(folder, "frames.json")))
    return folder, data["frames"], {m["name"]: m["t"] for m in data["marks"]}


def spans(marks, mark, after, pieces):
    """The pieces as (start, end, speed) in recording time, end to end."""
    out, t = [], marks[mark] + after
    for length, speed in pieces:
        end = marks[length] - 0.2 if isinstance(length, str) else t + length
        out.append((t, end, speed))
        t = end
    return out


def video(i, folder, frames, parts):
    """One shot as its own mp4, each frame held as long as it really showed (sped up per piece)."""
    lines, last = [], None
    for start, end, speed in parts:
        picked = [f for f in frames if start <= f["t"] < end]
        before = [f for f in frames if f["t"] < start]
        if before:
            picked.insert(0, dict(before[-1], t=start))
        for a, b in zip(picked, picked[1:] + [{"t": end}]):
            lines += [f"file '{os.path.join(folder, a['file'])}'", f"duration {(b['t'] - a['t']) / speed:.4f}"]
            last = a
    lines.append(f"file '{os.path.join(folder, last['file'])}'")
    listing = os.path.join(OUT, f"shot{i:02d}.txt")
    open(listing, "w").write("\n".join(lines) + "\n")
    secs = sum((e - s) / v for s, e, v in parts)
    path = os.path.join(OUT, f"shot{i:02d}.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing,
                    "-vf", f"fps={FPS},scale=1080:1920:flags=lanczos,format=yuv420p",
                    "-t", f"{secs:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "17", path], check=True)
    return path, secs


def sfx_piece(sfx_wav, sfx_start, start, end, speed):
    """The app's sound for one piece, sped up without changing pitch (or silence if too fast)."""
    n = int((end - start) / speed * SR)
    if speed > SFX_MAX_SPEED:
        return np.zeros((n, 2))
    tmp = os.path.join(OUT, "piece.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{max(0, start - sfx_start):.3f}",
                    "-t", f"{end - start:.3f}", "-i", sfx_wav, "-af", f"atempo={speed:.4f}",
                    "-ar", str(SR), "-ac", "2", tmp], check=True)
    out = music.read(tmp)[:n]
    return np.vstack([out, np.zeros((n - len(out), 2))])


def main():
    os.makedirs(OUT, exist_ok=True)
    sfx_wav = os.path.join(OUT, "sfx.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(DIR, "frames", "sfx.webm"),
                    "-ar", str(SR), "-ac", "2", sfx_wav], check=True)
    sfx_start = json.load(open(os.path.join(DIR, "frames", "sfx.json")))["start"]

    paths, sounds, card_times, at = [], [], [], 0.0
    for i, (source, mark, after, pieces) in enumerate(SHOTS):
        folder, frames, marks = load(source)
        parts = spans(marks, mark, after, pieces)
        path, secs = video(i, folder, frames, parts)
        if secs < MIN_SHOT_S:
            raise SystemExit(f"shot {i} ({source} {mark}) is only {secs:.1f}s: too short, it would flash")
        paths.append(path)
        if source == "take":
            audio = np.vstack([sfx_piece(sfx_wav, sfx_start, *p) for p in parts])
        else:
            audio = np.zeros((int(secs * SR), 2))
            if source != "title":
                card_times.append(at)
        audio = audio[: int(secs * SR)]
        sounds.append(np.vstack([audio, np.zeros((int(secs * SR) - len(audio), 2))]))
        print(f"{source:>9} {mark:<12} {secs:5.2f}s  at {at:5.1f}s")
        at += secs

    effects = np.vstack(sounds)
    score = music.make(len(effects) / SR, card_times)
    d = int(0.012 * SR)
    score = np.stack([score, np.concatenate([np.zeros(d), score[:-d]])], 1)[: len(effects)]
    mix = MUSIC_GAIN * score + SFX_GAIN * effects
    mix /= max(1.0, np.abs(mix).max() / 0.9)
    song = os.path.join(OUT, "mix.wav")
    music.write(song, mix)

    listing = os.path.join(OUT, "parts.txt")
    open(listing, "w").write("".join(f"file '{p}'\n" for p in paths))
    final = os.path.join(OUT, "rabble-promo.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-i", song,
                    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "21",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-af", "loudnorm=I=-15:TP=-1.5",
                    "-shortest", "-movflags", "+faststart", final], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "5", "-i", final, "-frames:v", "1",
                    "-q:v", "3", os.path.join(OUT, "rabble-promo.jpg")], check=True)
    print(f"{final}  {at:.1f}s")


if __name__ == "__main__":
    main()
