"""The widescreen walkthrough (1920×1080): the current Rabble playing on a
phone at the left, and at the right, what's happening and which Meta model
does it, scene by scene, with a narration (macOS's Samantha voice) and a soft
score under it. Footage comes from the welcome promo's take
(promo/record_welcome.mjs); scenes and words from walkthrough.json.
Writes demo/rabble-walkthrough.mp4.

  python demo/compose_walkthrough.py
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(DIR, "promo"))
import compose as cutter  # noqa: E402  (promo/compose.py: frames → video)
import music  # noqa: E402

APP = os.path.join(os.path.dirname(DIR), "app")
TAKE = os.path.join(DIR, "promo", "frames-welcome")
OUT = os.path.join(DIR, "walkthrough")
W, H = 1920, 1080
PHONE_H = 960
PHONE_W = PHONE_H * 9 // 16
PHONE_X, PHONE_Y = 190, (H - PHONE_H) // 2
PANEL_X = 820
BREATH_S = 1.4                       # after each narration, before the next scene
VOICE, RATE = "Samantha", 178
MUSIC_GAIN = 0.10
BG_TOP, BG_BOTTOM = (10, 18, 34), (34, 14, 40)
CREAM, SOFT, ACCENT = (250, 240, 225), (205, 195, 185), (255, 120, 92)
AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
font = lambda size, index: ImageFont.truetype(AVENIR, size, index=index)
TITLE, BODY, TAG, SMALL = font(60, 2), font(36, 0), font(30, 1), font(26, 0)


def background():
    k = np.linspace(0, 1, H)[:, None, None]
    rows = np.array(BG_TOP) + (np.array(BG_BOTTOM) - np.array(BG_TOP)) * k
    return Image.fromarray(np.repeat(rows, W, axis=1).astype("uint8"))


def panel(scene, base, title_img):
    img = base.copy()
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((PHONE_X - 14, PHONE_Y - 14, PHONE_X + PHONE_W + 14, PHONE_Y + PHONE_H + 14),
                        radius=56, fill=(6, 8, 14), outline=(70, 70, 90), width=3)
    y = 230
    if scene["id"] in ("intro", "outro"):
        t = title_img.copy()
        t.thumbnail((820, 380))
        img.paste(t, (PANEL_X, 110), t)
        y = 110 + t.height + 40
    else:
        d.text((PANEL_X, y), scene["title"], font=TITLE, fill=CREAM)
        y += 100
    room = W - PANEL_X - 80
    for line in scene["lines"]:
        f = BODY
        while d.textlength(line, font=f) > room and f.size > 24:
            f = font(f.size - 1, 0)
        d.text((PANEL_X, y), line, font=f, fill=SOFT)
        y += 56
    if scene.get("meta"):
        y += 30
        label = "Meta  ·  " + scene["meta"]
        tw = d.textlength(label, font=TAG)
        d.rounded_rectangle((PANEL_X - 4, y, PANEL_X + tw + 40, y + 58), radius=29, fill=ACCENT)
        d.text((PANEL_X + 18, y + 10), label, font=TAG, fill=(30, 12, 8))
    d.text((PANEL_X, H - 80), "Rabble  ·  Meta Global AI Developer Hackathon  ·  2026", font=SMALL, fill=(150, 145, 160))
    return img


def narrate(scene):
    aiff = os.path.join(OUT, f"{scene['id']}.aiff")
    subprocess.run(["say", "-v", VOICE, "-r", str(RATE), "-o", aiff, scene["say"]], check=True)
    wav = os.path.join(OUT, f"{scene['id']}.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", aiff, "-ar", str(music.SR), "-ac", "2", wav], check=True)
    return music.read(wav)


def main():
    os.makedirs(OUT, exist_ok=True)
    cutter.OUT = OUT
    scenes = json.load(open(os.path.join(DIR, "walkthrough.json")))
    take = json.load(open(os.path.join(TAKE, "frames.json")))
    frames, marks = take["frames"], {m["name"]: m["t"] for m in take["marks"]}
    title_img = Image.open(os.path.join(APP, "rabble-title.webp")).convert("RGBA")
    base = background()
    parts, voice, at = [], [], 0.0
    for i, s in enumerate(scenes):
        speech = narrate(s)
        secs = len(speech) / music.SR + BREATH_S
        mark, after, speed = s["clip"]
        start = marks[mark] + after
        phone, _ = cutter.video(i, TAKE, frames, [(start, start + secs * speed, speed)])
        slide = os.path.join(OUT, f"panel{i:02d}.png")
        panel(s, base, title_img).save(slide)
        # The phone, its corners rounded, in the frame at the left of the panel.
        part = os.path.join(OUT, f"scene{i:02d}.mp4")
        r = 44
        rounded = (f"[1:v]scale={PHONE_W}:{PHONE_H}:flags=lanczos,format=yuva420p,"
                   f"geq=lum='p(X,Y)':cb='p(X,Y)':cr='p(X,Y)':a='if(gt(abs(X-W/2)-W/2+{r},0)*gt(abs(Y-H/2)-H/2+{r},0)*"
                   f"gt(hypot(abs(X-W/2)-W/2+{r},abs(Y-H/2)-H/2+{r}),{r}),0,255)'[ph];"
                   f"[0:v][ph]overlay={PHONE_X}:{PHONE_Y},format=yuv420p")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", slide, "-i", phone,
                        "-filter_complex", rounded, "-t", f"{secs:.3f}", "-r", "30",
                        "-c:v", "libx264", "-preset", "medium", "-crf", "19", part], check=True)
        parts.append(part)
        lead = np.zeros((int(0.4 * music.SR), 2))
        clip = np.vstack([lead, speech])[: int(secs * music.SR)]
        voice.append(np.vstack([clip, np.zeros((int(secs * music.SR) - len(clip), 2))]))
        print(f"{s['id']:>9}  {secs:5.1f}s  at {at:5.1f}s  (footage {mark}{after:+.1f}, ×{speed})")
        at += secs

    narration = np.vstack(voice)
    score = music.make(len(narration) / music.SR, [])
    d = int(0.012 * music.SR)
    score = np.stack([score, np.concatenate([np.zeros(d), score[:-d]])], 1)[: len(narration)]
    mix = narration + MUSIC_GAIN * score
    mix /= max(1.0, np.abs(mix).max() / 0.9)
    song = os.path.join(OUT, "mix.wav")
    music.write(song, mix)

    listing = os.path.join(OUT, "parts.txt")
    open(listing, "w").write("".join(f"file '{p}'\n" for p in parts))
    final = os.path.join(DIR, "rabble-walkthrough.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-i", song,
                    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "22",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-16:TP=-1.5",
                    "-shortest", "-movflags", "+faststart", final], check=True)
    print(f"{final}  {at:.1f}s")


if __name__ == "__main__":
    main()
