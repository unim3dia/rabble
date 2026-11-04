"""Phone-ready copies of every Rabble person: app/people/*.png -> app/people-web/*.webp.

Smaller (the phone never draws them bigger than this), with hot highlights
tamed and a light touch of extra contrast and sharpening (mostly the original
look). Up-to-date copies are skipped.

Run: python tools/optimize_people.py
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app", "people")
OUT = os.path.join(ROOT, "app", "people-web")
MAX_H = 360
QUALITY = 80
CONTRAST = 1.22
SHARPNESS = 1.6
SATURATION = 1.04
KNEE = 184            # brightness above this is gently compressed (fewer hot highlights)
KNEE_SLOPE = 0.5
CRISP_MIX = 0.35      # how much of the extra contrast/sharpening to use


def tone(v):
    return v if v < KNEE else int(KNEE + (v - KNEE) * KNEE_SLOPE)


CURVE = [tone(v) for v in range(256)] * 3


def optimize(name):
    src = os.path.join(SRC, name)
    dst = os.path.join(OUT, name[:-4] + ".webp")
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return False
    img = Image.open(src).convert("RGBA")
    if img.height > MAX_H:
        img = img.resize((round(img.width * MAX_H / img.height), MAX_H), Image.LANCZOS)
    rgb, alpha = img.convert("RGB"), img.getchannel("A")
    base = rgb.point(CURVE)                 # hot spots tamed, fully
    crisp = ImageEnhance.Contrast(base).enhance(CONTRAST)
    crisp = ImageEnhance.Color(crisp).enhance(SATURATION)
    crisp = ImageEnhance.Sharpness(crisp).enhance(SHARPNESS)
    rgb = Image.blend(base, crisp, CRISP_MIX)   # mostly the original look
    rgb.putalpha(alpha)
    rgb.save(dst, "WEBP", quality=QUALITY, method=5)
    return True


def main():
    os.makedirs(OUT, exist_ok=True)
    names = [n for n in os.listdir(SRC) if n.endswith(".png")]
    with ThreadPoolExecutor(6) as ex:
        done = sum(ex.map(optimize, names))
    print(f"{done} optimized, {len(names) - done} already up to date")


if __name__ == "__main__":
    sys.exit(main())
