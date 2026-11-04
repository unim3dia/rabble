"""Build the 3-minute demo (demo/demo-3min-script.md): widescreen, the phone
alone in a dark room at the right, quiet words appearing at the left one idea
at a time, Samantha's voice, the app's own sounds, and funk_music.py's score.
Every scene is a whole number of bars (92 BPM), so cuts land on the beat.
Footage: record_demo.mjs (frames-demo/ and frames-sit/).
Writes demo/rabble-demo-3min.mp4.

  python demo/promo/compose_demo.py
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import compose as cutter                     # frames → video, the app's sounds
import funk_music as funk
import music

DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(DIR))
OUT = os.path.join(os.path.dirname(DIR), "film")
FINAL = os.path.join(os.path.dirname(DIR), "rabble-demo-3min.mp4")
W, H = 1920, 1080
PHONE_H = 960
PHONE_W = PHONE_H * 9 // 16
PHONE_X, PHONE_Y = (W - PHONE_W) // 2, (H - PHONE_H) // 2   # the phone in the middle
GAP = 80                              # between the phone and the words either side
CORNER = 46
LEFT_EDGE = PHONE_X - GAP            # words at the left end here (right-aligned)
RIGHT_EDGE = PHONE_X + PHONE_W + GAP  # words at the right start here
VOICE, RATE = "Samantha", 172
SFX_GAIN, MUSIC_GAIN, VOICE_GAIN = 2.0, 0.42, 1.0
CREAM, SOFT = (250, 242, 230), (190, 184, 196)
SF = "/System/Library/Fonts/SFNS.ttf"
PHOTO = "selfie-auburn.jpg"            # the stand-in's photo (record_demo.mjs uses the same)
TAKES = {"demo": os.path.join(DIR, "frames-demo"), "sit": os.path.join(DIR, "frames-sit")}


def sf(size, weight):
    f = ImageFont.truetype(SF, size)
    f.set_variation_by_name(weight)
    return f


STYLES = {"big": (sf(58, "Semibold"), CREAM), "line": (sf(40, "Regular"), SOFT),
          "small": (sf(30, "Regular"), SOFT), "meta": (sf(46, "Semibold"), CREAM)}

# A scene: bars of music, a level per bar, footage (take, from mark + seconds,
# to mark + seconds; sped or slowed to fill the scene), words (text, at which
# bar, style, y, which side of the phone), the voice (text, at seconds), and
# the photo steps (picture, at which bar, its line, which side).
SCENES = [
    {"id": "cold", "levels": [0, 0, 0, "r", "r"], "take": "demo", "clip": ("menu", 0.0, "turn", 0.0),
     "fade_in": 2.5, "words": [("Sometimes\nyou just want", 1.2, "big", 430, "L"), ("a little\ncompany.", 2.0, "big", 430, "R")]},
    {"id": "title", "levels": [2, 2, 2, 2, 2], "take": "demo", "clip": ("turn", 0.0, "faces", 0.0),
     "title": True, "words": [("A little company\nwhen you want it.", 0.8, "line", 470, "R")],
     "voice": ("This is Rabble. A soft, living pile of people. And there's room for you.", 1.4)},
    {"id": "people", "levels": [2] * 7, "take": "demo", "clip": ("faces", 0.0, "faces-end", 0.0),
     "words": [("Every person,", 0.4, "big", 470, "L"), ("drawn by\nMeta Muse Image.", 1.0, "big", 430, "R")],
     "voice": ("Forty seven people, ages ten to ninety. Every one of them drawn by Meta's Muse Image, "
               "in poses for being awake, reaching out, and dozing off. And SAM three point one cut each one out.", 1.0)},
    {"id": "becoming", "levels": [1] * 10, "take": "demo", "clip": ("photo", -0.4, "made", 4.0),
     "steps": [("photo", 1.5, "Your photo.", "L"), ("clay", 5.0, "Muse Image makes you,\nexactly as you.", "R")],
     "voice": ("Add a photo, and Muse Image makes a little you, in soft clay, exactly as you are. "
               "Same face. Same hair. Same age. And the photo is never saved.", 1.0)},
    {"id": "arrival", "levels": [0, 2, 2, 2], "take": "demo", "clip": ("join", 0.6, "asked", -0.4),
     "voice": ("Drop in, and the pile catches you.", 3.6)},
    {"id": "mind", "levels": [2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3], "take": "demo", "clip": ("asked", -0.3, "reply-end", -1.0),
     "words": [("Your words\nstay yours.", 1.0, "big", 430, "L"), ("Meta Muse Spark\nlistens.", 5.0, "big", 430, "R")],
     "voice": ("Someone asks what's on your mind. What you share goes up exactly as you wrote it. "
               "Muse Spark makes sure it's kind, then answers like a friend would, and remembers what you said.", 1.5)},
    {"id": "bodies", "levels": [1, 1, 1, 1, 1, "r", "r"], "take": "demo", "clip": ("light", 0.0, "reply2-end", -1.0),
     "words": [("It answers", 1.0, "big", 470, "L"), ("with its\nwhole body.", 1.8, "big", 430, "R")],
     "voice": ("And it doesn't just answer in words. A small win gets a cheer. A long week gets a lean, and a hush. "
               "Muse Spark chooses how the pile responds.", 1.0)},
    {"id": "sit", "levels": ["r"] * 6, "take": "sit", "clip": ("asked", 0.0, "sit-end", 0.0),
     "words": [("Or just", 1.0, "big", 470, "L"), ("sit.", 1.6, "big", 470, "R")],
     "voice": ("Or don't say anything at all. That's welcome too.", 4.0)},
    {"id": "world", "levels": [3] * 6, "take": "demo", "clip": ("ring", 2.7, "tower-end", 0.0),
     "words": [("Neighborhood.", 0.5, "big", 380, "L"), ("City.", 1.5, "big", 380, "R"),
               ("State.", 2.5, "big", 560, "L"), ("World.", 3.5, "big", 560, "R")]},
    {"id": "made", "levels": [2, 2, 2, 2], "take": "demo", "clip": ("close", 0.0, "close-end", 0.0),
     "words": [("Muse Image:\nevery face.", 0.1, "meta", 330, "L"), ("Muse Spark:\nevery word,\nevery gesture.", 1.0, "meta", 330, "R"),
               ("SAM 3.1:\nevery edge.", 2.0, "meta", 560, "L"),
               ("Private by design.\nNo account. No feed.", 3.0, "line", 620, "R")],
     "voice": ("Three Meta models. One little place to be.", 6.6)},
    {"id": "end", "levels": [4, 0, 0], "take": "demo", "clip": ("rest", 0.0, "rest-end", 0.0),
     "title": True, "words": [("Come find\nyour spot.", 0.3, "big", 430, "R"), ("unim3dia.github.io/rabble", 0.6, "small", 600, "R")]},
]


def room():
    """A dark room, a soft glow behind the phone, a little grain."""
    y, x = np.mgrid[0:H, 0:W]
    glow = np.exp(-(((x - (PHONE_X + PHONE_W / 2)) / 700) ** 2 + ((y - H / 2) / 520) ** 2))
    base = np.array([10, 9, 18]) + glow[..., None] * np.array([38, 26, 48])
    base += np.random.default_rng(3).normal(0, 1.6, (H, W, 1))
    img = Image.fromarray(np.clip(base, 0, 255).astype("uint8"))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((PHONE_X - 12, PHONE_Y - 12, PHONE_X + PHONE_W + 12, PHONE_Y + PHONE_H + 12),
                        radius=CORNER + 10, fill=(4, 4, 8), outline=(58, 56, 72), width=2)
    return img


def layer(draw_fn):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_fn(img, ImageDraw.Draw(img))
    return img


def words_png(i, k, text, style, y, side):
    """Words beside the phone: at the left they end near it, at the right they start near it."""
    font, color = STYLES[style]
    path = os.path.join(OUT, f"w{i:02d}_{k}.png")
    x, anchor, align = (LEFT_EDGE, "ra", "right") if side == "L" else (RIGHT_EDGE, "la", "left")
    layer(lambda img, d: d.multiline_text((x, y), text, font=font, fill=color, anchor=anchor,
                                          align=align, spacing=12)).save(path)
    return path


def title_png(i):
    t = Image.open(os.path.join(ROOT, "app", "rabble-title.webp")).convert("RGBA")
    t.thumbnail((560, 280))
    path = os.path.join(OUT, f"title{i:02d}.png")
    layer(lambda img, d: img.paste(t, (LEFT_EDGE - t.width + 20, H // 2 - t.height // 2), t)).save(path)
    return path


def step_pngs(i, steps):
    """The photo and the clay you: a card either side of the phone, each with its line."""
    trim = lambda im: im.crop(im.getbbox())             # just the person, not the empty canvas
    pics = {"photo": Image.open(os.path.join(DIR, PHOTO)).convert("RGBA"),
            "clay": trim(Image.open(os.path.join(TAKES["demo"], "you.png")).convert("RGBA"))}
    font, color = STYLES["line"]
    out = []
    for k, (name, at, line, side) in enumerate(steps):
        x = LEFT_EDGE - 280 if side == "L" else RIGHT_EDGE

        def draw(img, d, name=name, x=x, line=line):
            card = Image.new("RGBA", (280, 360), (255, 250, 242, 18))
            pic = pics[name].copy()
            pic.thumbnail((260, 340))
            card.paste(pic, ((280 - pic.width) // 2, (360 - pic.height) // 2), pic)
            mask = Image.new("L", card.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle((0, 0, 279, 359), radius=26, fill=255)
            img.paste(card, (x, 330), mask)
            d.multiline_text((x, 712), line, font=font, fill=color, spacing=10)
        path = os.path.join(OUT, f"s{i:02d}_{k}.png")
        layer(draw).save(path)
        out.append((path, at))
    return out


def narrate(i, text):
    aiff, wav = os.path.join(OUT, f"v{i:02d}.aiff"), os.path.join(OUT, f"v{i:02d}.wav")
    subprocess.run(["say", "-v", VOICE, "-r", str(RATE), "-o", aiff, text], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", aiff, "-ar", str(music.SR), "-ac", "2", wav], check=True)
    return music.read(wav)


def load(take):
    data = json.load(open(os.path.join(TAKES[take], "frames.json")))
    return data["frames"], {m["name"]: m["t"] for m in data["marks"]}


def build_scene(i, s, secs, bg):
    frames, marks = load(s["take"])
    m0, a0, m1, a1 = s["clip"]
    start, end = marks[m0] + a0, marks[m1] + a1
    speed = (end - start) / secs
    phone, _ = cutter.video(i, TAKES[s["take"]], frames, [(start, end, speed)])
    overlays = []                                       # (png, seconds in)
    if s.get("title"):
        overlays.append((title_png(i), 0.3))
    for k, (text, at, style, y, side) in enumerate(s.get("words", [])):
        overlays.append((words_png(i, k, text, style, y, side), at * funk.BAR))
    for path, at in step_pngs(i, s["steps"]) if s.get("steps") else []:
        overlays.append((path, at * funk.BAR))
    inputs = ["-loop", "1", "-i", bg, "-i", phone, "-loop", "1", "-i", os.path.join(OUT, "mask.png")]
    graph = [f"[1:v]scale={PHONE_W}:{PHONE_H}:flags=lanczos[ph];[ph][2:v]alphamerge[phr];"
             f"[0:v][phr]overlay={PHONE_X}:{PHONE_Y}[v0]"]
    for k, (png, at) in enumerate(overlays):
        inputs += ["-loop", "1", "-i", png]
        graph.append(f"[{k + 3}:v]format=rgba,fade=in:st={at:.2f}:d=0.8:alpha=1,"
                     f"fade=out:st={secs - 0.6:.2f}:d=0.5:alpha=1[o{k}];[v{k}][o{k}]overlay=0:0[v{k + 1}]")
    last = f"[v{len(overlays)}]"
    fade = f"{last}fade=in:st=0:d={s['fade_in']}[vf]" if s.get("fade_in") else f"{last}null[vf]"
    graph.append(fade)
    part = os.path.join(OUT, f"scene{i:02d}.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(graph),
                    "-map", "[vf]", "-t", f"{secs:.3f}", "-r", "30", "-pix_fmt", "yuv420p",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", part], check=True)
    return part, (start, end, speed)


def take_sound(take):
    """The app's sounds from a take, as a wav, and when the recording started."""
    folder = TAKES[take]
    if not os.path.exists(os.path.join(folder, "sfx.webm")):
        return None, 0
    wav = os.path.join(OUT, f"sfx-{take}.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(folder, "sfx.webm"),
                    "-ar", str(music.SR), "-ac", "2", wav], check=True)
    return wav, json.load(open(os.path.join(folder, "sfx.json")))["start"]


def main():
    os.makedirs(OUT, exist_ok=True)
    cutter.OUT = OUT
    mask = Image.new("L", (PHONE_W, PHONE_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, PHONE_W - 1, PHONE_H - 1), radius=CORNER, fill=255)
    mask.save(os.path.join(OUT, "mask.png"))
    bg = os.path.join(OUT, "room.png")
    room().save(bg)
    sounds = {t: take_sound(t) for t in TAKES}
    sr = music.SR
    parts, voice, effects, plan, at = [], [], [], [], 0.0
    for i, s in enumerate(SCENES):
        secs = len(s["levels"]) * funk.BAR
        part, span = build_scene(i, s, secs, bg)
        parts.append(part)
        plan += s["levels"]
        n = int(round(secs * sr))
        v = np.zeros((n, 2))
        if s.get("voice"):
            text, start = s["voice"]
            said = narrate(i, text)
            room_s = secs - start - 0.4
            if len(said) / sr > room_s:
                print(f"  ! {s['id']}: the voice runs {len(said) / sr:.1f}s, room for {room_s:.1f}s", flush=True)
            k = int(start * sr)
            said = said[: n - k]
            v[k:k + len(said)] += said
        voice.append(v)
        wav, t0 = sounds[s["take"]]
        fx = cutter.sfx_piece(wav, t0, *span) if wav else np.zeros((n, 2))
        effects.append(np.vstack([fx, np.zeros((max(0, n - len(fx)), 2))])[:n])
        print(f"{s['id']:>9} {len(s['levels']):2d} bars {secs:5.1f}s at {at:5.1f}s  footage x{span[2]:.2f}", flush=True)
        at += secs
    voice, effects = np.vstack(voice), np.vstack(effects)
    score = funk.make(plan)[: len(voice)]
    score = np.vstack([score, np.zeros((len(voice) - len(score), 2))])
    # The music steps back while Samantha speaks.
    speaking = np.convolve(np.abs(voice[:, 0]) > 0.01, np.ones(int(0.4 * sr)) / (0.4 * sr), mode="same")
    duck = 1 - 0.45 * np.clip(speaking * 3, 0, 1)
    mix = VOICE_GAIN * voice + MUSIC_GAIN * score * duck[:, None] + SFX_GAIN * effects
    mix /= max(1.0, np.abs(mix).max() / 0.9)
    song = os.path.join(OUT, "mix.wav")
    music.write(song, mix)
    listing = os.path.join(OUT, "parts.txt")
    open(listing, "w").write("".join(f"file '{p}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-i", song,
                    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "21",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-af", "loudnorm=I=-15:TP=-1.5",
                    "-shortest", "-movflags", "+faststart", FINAL], check=True)
    print(f"{FINAL}  {at:.1f}s")


if __name__ == "__main__":
    sys.exit(main())
