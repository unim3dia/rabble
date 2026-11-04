"""Put the Rabble demo together: the phone recording on the left, a panel on
the right explaining each scene (and which Meta model does what), and the
narration lined up with each scene. Writes demo/rabble-demo.mp4.

  python demo/compose.py   (after node demo/record.mjs)
"""
import json
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

DIR = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(os.path.dirname(DIR), "app")
W, H = 1920, 1080
PHONE_H = 980                        # the phone recording, scaled to this height
PHONE_X, PHONE_Y = 170, (H - PHONE_H) // 2
PANEL_X = 820                        # where the explanation starts
BG_TOP, BG_BOTTOM = (10, 18, 34), (34, 14, 40)
CREAM, SOFT, ACCENT = (250, 240, 225), (205, 195, 185), (255, 120, 92)

AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
font = lambda size, index: ImageFont.truetype(AVENIR, size, index=index)
TITLE, BODY, TAG, SMALL = font(64, 2), font(38, 0), font(30, 1), font(26, 0)


def background():
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        k = y / (H - 1)
        c = tuple(int(a + (b - a) * k) for a, b in zip(BG_TOP, BG_BOTTOM))
        for x in range(W):
            px[x, y] = c
    return img


def phone_frame(draw):
    w = round(PHONE_H * 390 / 844)
    draw.rounded_rectangle((PHONE_X - 14, PHONE_Y - 14, PHONE_X + w + 14, PHONE_Y + PHONE_H + 14),
                           radius=58, fill=(6, 8, 14), outline=(70, 70, 90), width=3)


def slide(scene, base, title_img):
    img = base.copy()
    d = ImageDraw.Draw(img)
    phone_frame(d)
    y = 250
    if scene["id"] in ("intro", "outro") and title_img is not None:
        t = title_img.copy()
        t.thumbnail((880, 420))
        img.paste(t, (PANEL_X, 120), t)
        y = 120 + t.height + 40
    if scene["id"] != "intro":
        d.text((PANEL_X, y), scene["title"], font=TITLE, fill=CREAM)
        y += 100
    room = W - PANEL_X - 70
    for line in scene["lines"]:
        f = BODY
        while d.textlength(line, font=f) > room and f.size > 26:      # long lines shrink to fit
            f = font(f.size - 1, 0)
        d.text((PANEL_X, y), line, font=f, fill=SOFT)
        y += 58
    if scene.get("meta"):
        y += 30
        label = "Meta  ·  " + scene["meta"]
        tw = d.textlength(label, font=TAG)
        d.rounded_rectangle((PANEL_X - 4, y, PANEL_X + tw + 40, y + 58), radius=29, fill=ACCENT)
        d.text((PANEL_X + 18, y + 10), label, font=TAG, fill=(30, 12, 8))
    d.text((PANEL_X, H - 80), "Rabble  ·  Meta Global AI Developer Hackathon  ·  November 4, 2026", font=SMALL, fill=(150, 145, 160))
    return img


def main():
    scenes = {s["id"]: s for s in json.load(open(os.path.join(DIR, "scenes.json")))}
    tl = json.load(open(os.path.join(DIR, "timeline.json")))
    order = tl["scenes"]
    title_img = Image.open(os.path.join(APP, "rabble-title.webp")).convert("RGBA")
    base = background()
    os.makedirs(os.path.join(DIR, "slides"), exist_ok=True)
    concat = []
    for i, s in enumerate(order):
        start = 0 if i == 0 else s["start"]
        end = order[i + 1]["start"] if i + 1 < len(order) else tl["end"]
        path = os.path.join(DIR, "slides", f"{i:02d}_{s['id']}.png")
        slide(scenes[s["id"]], base, title_img).save(path)
        concat += [f"file '{path}'", f"duration {end - start:.3f}"]
    concat.append(f"file '{path}'")                      # the concat format wants the last file twice
    list_path = os.path.join(DIR, "slides", "list.txt")
    open(list_path, "w").write("\n".join(concat) + "\n")

    # Narration: each line starts with its scene (and a beat after the scene begins).
    inputs, delays = [], []
    for i, s in enumerate(order):
        inputs += ["-i", os.path.join(DIR, "audio", f"{s['id']}.aiff")]
        ms = int((s["start"] + 0.4) * 1000)
        delays.append(f"[{i + 2}:a]adelay={ms}|{ms}[a{i}]")
    mix = ";".join(delays) + ";" + "".join(f"[a{i}]" for i in range(len(order))) + \
        f"amix=inputs={len(order)}:normalize=0,apad[aud]"
    w = round(PHONE_H * 390 / 844)
    video = f"[1:v]scale={w}:{PHONE_H}:flags=lanczos,format=yuva420p,geq=lum='p(X,Y)':a='if(gt(abs(X-W/2)-W/2+44,0)*gt(abs(Y-H/2)-H/2+44,0)*gt(hypot(abs(X-W/2)-W/2+44,abs(Y-H/2)-H/2+44),44),0,255)'[ph];" \
            f"[0:v]fps=30[bg];[bg][ph]overlay={PHONE_X}:{PHONE_Y}:shortest=1,format=yuv420p[vid]"
    out = os.path.join(DIR, "rabble-demo.mp4")
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list_path,
           "-i", os.path.join(DIR, "raw", "phone.webm"), *inputs,
           "-filter_complex", video + ";" + mix, "-map", "[vid]", "-map", "[aud]",
           "-t", f"{tl['end']:.2f}", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out]
    subprocess.run(cmd, check=True)
    print(out)


if __name__ == "__main__":
    main()
