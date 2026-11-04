"""Cut a title drawn on a flat dark background (like the crowd-of-people
"Rabble" lettering) out onto transparency for the heading.

  python tools/key_dark_title.py path/to/image.jpg

Alpha comes from how far each pixel's colour is from the background (read
from the corners); half-transparent pixels have the background un-mixed out of
them, so sparkles and glows fade softly instead of keeping a dark fringe.
Writes app/rabble-title.webp (the clay version is kept as rabble-title-clay.webp).
"""
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "rabble-title.webp")
KEEP = os.path.join(ROOT, "app", "rabble-title-clay.webp")
NEAR, FAR = 10.0, 46.0      # colour distance from the background: fully clear / fully solid
WIDTH = 1200


def key(src):
    im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    corners = [im[:40, :40], im[:40, -40:], im[-40:, :40], im[-40:, -40:]]
    bg = np.median(np.concatenate([c.reshape(-1, 3) for c in corners]), axis=0)
    dist = np.linalg.norm(im - bg, axis=2)
    a = np.clip((dist - NEAR) / (FAR - NEAR), 0, 1)
    safe = np.maximum(a, 0.04)[..., None]
    fg = np.clip((im - (1 - safe) * bg) / safe, 0, 255)
    img = Image.fromarray(np.dstack([fg, a[..., None] * 255]).clip(0, 255).astype(np.uint8), "RGBA")
    box = img.getchannel("A").point(lambda v: 255 if v > 30 else 0).getbbox()
    pad = 10
    img = img.crop((max(0, box[0] - pad), max(0, box[1] - pad),
                    min(img.width, box[2] + pad), min(img.height, box[3] + pad)))
    img.thumbnail((WIDTH, WIDTH), Image.LANCZOS)
    return img, bg


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python tools/key_dark_title.py <image>")
    if os.path.exists(OUT) and not os.path.exists(KEEP):
        shutil.copy(OUT, KEEP)
    title, bg = key(os.path.expanduser(sys.argv[1]))
    title.save(OUT, "WEBP", quality=88, method=6)
    print(f"{OUT} {title.size[0]}x{title.size[1]} (background {bg.astype(int).tolist()})")
