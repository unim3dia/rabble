"""Cut the two short commercials (vertical, about 30 seconds each) from the
clean take (record_spots.mjs) and the title frames (render_titles.mjs), on
spot_music.py's beat: every shot is a whole number of half bars (1.2 s).
Writes demo/promo/spots/out/rabble-everyone.mp4 and rabble-there-you-are.mp4.

  python demo/promo/compose_spots.py
"""
import json
import os
import subprocess

import numpy as np

import compose
import spot_music
from music import SR

DIR = os.path.dirname(os.path.abspath(__file__))
SPOTS = os.path.join(DIR, "spots")
OUT = os.path.join(SPOTS, "out")
HALF = spot_music.HALF
SFX_GAIN = 2.2
MUSIC_GAIN = 0.42

# ("title", name, halves) or ("take", mark, after, [(source seconds or mark, halves), ...]).
# Next to each shot: how full the music is in each of its half bars.
EVERYONE = [
    (("title", "one", 2), [0, 0]),
    (("take", "arrive", -0.6, [(3.2, 2)]), [1, 1]),               # one newcomer lands
    (("title", "another", 1), [1]),
    (("take", "drop", 0.2, [(5.4, 3)]), [1, 1, 1]),               # you drop in
    (("title", "everyone", 1), [2]),
    (("take", "rain", 0.3, [(7.2, 4)]), [3, 3, 3, 3]),            # the world falls onto the tower
    (("take", "tower", 0.0, [(7.2, 4)]), [3, 3, 3, 3]),           # slowly round it
    (("take", "push", 1.0, [(7.5, 3)]), [3, 3, 3]),               # in close, along the faces
    (("take", "bop", 0.0, [(2.4, 2)]), [3, 3]),                   # taps on the beat: they bop and sing
    (("title", "lockupA", 4), [4, "-", "-", "-"]),
]
THERE_YOU_ARE = [
    (("title", "isYou", 2), [0, 0]),
    (("title", "alsoYou", 2), [0, 0]),
    (("title", "everyoneElse", 2), [1, 2]),
    (("take", "tower", 0.5, [(8.6, 4)]), [3, 3, 3, 3]),           # the whole tower
    (("take", "drop", 0.2, [(5.4, 3)]), [1, 1, 1]),               # you drop in
    (("take", "push", 0.0, [(5.0, 3)]), [1, 1, 1]),               # all the way in to your face
    (("title", "thereYouAre", 2), [0, 0]),
    (("take", "say", 0.3, [("sent", 1), ("answered", 1), (5.4, 3)]), [1, 1, 1, 1, 1]),  # hi → one answer
    (("title", "lockupB", 4), [4, "-", "-", "-"]),
]


def load_take():
    folder = os.path.join(SPOTS, "frames")
    data = json.load(open(os.path.join(folder, "frames.json")))
    return folder, data["frames"], {m["name"]: m["t"] for m in data["marks"]}


def still(i, name, secs):
    path = os.path.join(OUT, f"shot{i:02d}.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", os.path.join(SPOTS, "titles", f"{name}.png"),
                    "-t", f"{secs:.3f}", "-vf", f"fps={compose.FPS},scale=1080:1920:flags=lanczos,format=yuv420p",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "17", path], check=True)
    return path


def take_parts(marks, mark, after, pieces):
    """(start, end, speed) per piece, each stretched to its whole number of half bars."""
    parts, t = [], marks[mark] + after
    for length, halves in pieces:
        end = marks[length] - 0.1 if isinstance(length, str) else t + length
        parts.append((t, end, (end - t) / (halves * HALF)))
        t = end
    return parts


def cut(name, shots, take, sfx_wav, sfx_start):
    folder, frames, marks = take
    paths, sounds, plan = [], [], []
    for i, (shot, levels) in enumerate(shots):
        halves = shot[2] if shot[0] == "title" else sum(h for _, h in shot[3])
        assert len(levels) == halves, f"{name} shot {i}: {len(levels)} music levels for {halves} half bars"
        secs = halves * HALF
        if shot[0] == "title":
            paths.append(still(i, shot[1], secs))
            sounds.append(np.zeros((int(secs * SR), 2)))
        else:
            parts = take_parts(marks, *shot[1:])
            path, _ = compose.video(i, folder, frames, parts)
            paths.append(path)
            audio = np.vstack([compose.sfx_piece(sfx_wav, sfx_start, *p) for p in parts])[: int(secs * SR)]
            sounds.append(np.vstack([audio, np.zeros((int(secs * SR) - len(audio), 2))]))
        plan += levels
    effects = np.vstack(sounds)
    score = spot_music.stereo(spot_music.make(plan))
    effects = np.vstack([effects, np.zeros((len(score) - len(effects), 2))])
    mix = MUSIC_GAIN * score + SFX_GAIN * effects
    mix /= max(1.0, np.abs(mix).max() / 0.9)
    song = os.path.join(OUT, f"{name}.wav")
    spot_music.music.write(song, mix)

    listing = os.path.join(OUT, f"{name}.txt")
    open(listing, "w").write("".join(f"file '{p}'\n" for p in paths))
    final = os.path.join(OUT, f"{name}.mp4")
    # The picture holds on the lockup while the last chord rings out.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-i", song,
                    "-map", "0:v", "-map", "1:a", "-vf", "tpad=stop_mode=clone:stop_duration=1.5",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-af", "loudnorm=I=-14:TP=-1.5",
                    "-t", f"{len(plan) * HALF + 1.5:.2f}", "-movflags", "+faststart", final], check=True)
    print(f"{final}  {len(plan) * HALF + 1.5:.1f}s")


def main():
    os.makedirs(OUT, exist_ok=True)
    compose.OUT = OUT                    # the shared helpers write their pieces here
    sfx_wav = os.path.join(OUT, "sfx.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(SPOTS, "frames", "sfx.webm"),
                    "-ar", str(SR), "-ac", "2", sfx_wav], check=True)
    sfx_start = json.load(open(os.path.join(SPOTS, "frames", "sfx.json")))["start"]
    take = load_take()
    cut("rabble-everyone", EVERYONE, take, sfx_wav, sfx_start)
    cut("rabble-there-you-are", THERE_YOU_ARE, take, sfx_wav, sfx_start)


if __name__ == "__main__":
    main()
