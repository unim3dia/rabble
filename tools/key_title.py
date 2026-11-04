"""Cut the clay "Rabble" lettering out of its green screen for the title.

  python tools/key_title.py ~/Downloads/morph_and_play_with_text_2cfb12b6_2K.jpg

1. Alpha from how green each pixel is (the screen colour comes from the corners).
2. Un-mix the screen out of half-transparent edge pixels.
3. Anything with a green cast (the brown sides lit by the screen, leftover rim)
   and a feathered band along every edge go black, so nothing reads olive.
Writes app/rabble-title.webp.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "rabble-title.webp")
KEY_LO, KEY_HI = 12.0, 80.0      # greenness where the screen starts / is fully gone
BAND_BLUR = 14                   # px: how far the edge band reaches into the letters
BLACK = np.array([10.0, 8.0, 7.0])
EDGE_BLACK = 0.8                 # how black the edge band goes
GREEN_CAST = (2.0, 10.0)         # green above the red/blue average: starts / fully black
DARK = (175.0, 110.0)            # only the darker sides go black: brightness where it starts / is full
WIDTH = 1000


def key(src):
    im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    corners = [im[:40, :40], im[:40, -40:], im[-40:, :40], im[-40:, -40:]]
    screen = np.median(np.concatenate([c.reshape(-1, 3) for c in corners]), axis=0)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    a = 1 - np.clip((g - np.maximum(r, b) - KEY_LO) / (KEY_HI - KEY_LO), 0, 1)

    safe = np.maximum(a, 0.04)[..., None]
    fg = np.clip((im - (1 - safe) * screen) / safe, 0, 255)

    outside = Image.fromarray(((1 - a) * 255).astype(np.uint8))
    band = np.asarray(outside.filter(ImageFilter.GaussianBlur(BAND_BLUR))).astype(np.float32) / 255
    band = np.clip(band * 2.2, 0, 1) * a
    lo, hi = GREEN_CAST
    cast = np.clip((fg[..., 1] - (fg[..., 0] + fg[..., 2]) / 2 - lo) / (hi - lo), 0, 1)
    # Only on the darker brown sides (or right at the edge): the cream faces stay cream.
    lum = fg @ np.array([0.3, 0.59, 0.11])
    dark = np.clip((DARK[0] - lum) / (DARK[0] - DARK[1]), 0, 1)
    cast *= np.maximum(dark, (band > 0.6).astype(np.float32))
    # Feather the green-cast areas a little so they melt into the black.
    cast = np.asarray(Image.fromarray((cast * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255
    k = np.clip(np.maximum(band * EDGE_BLACK, cast * 1.3), 0, 1)[..., None]
    fg = fg * (1 - k) + BLACK * k

    img = Image.fromarray(np.dstack([fg, a[..., None] * 255]).clip(0, 255).astype(np.uint8), "RGBA")
    box = img.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    pad = 12
    img = img.crop((max(0, box[0] - pad), max(0, box[1] - pad),
                    min(img.width, box[2] + pad), min(img.height, box[3] + pad)))
    img.thumbnail((WIDTH, WIDTH), Image.LANCZOS)
    return img


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python tools/key_title.py <green-screen image>")
    title = key(os.path.expanduser(sys.argv[1]))
    title.save(OUT, "WEBP", quality=90, method=6)
    print(f"{OUT} {title.size[0]}x{title.size[1]}")
