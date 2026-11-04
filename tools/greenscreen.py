"""Cut a figure off a flat green background, like a film green screen: no SAM.

Muse Image draws the selfie figure on pure green (see server.SELFIE_PROMPT);
key() turns the green into transparency with soft edges, takes the green tint
off the edges (despill, so hair never gets a pale or green rim), keeps the
one figure, and trims to it.
"""
import io

import cv2
import numpy as np
from PIL import Image

SOLID, CLEAR = 18, 60          # how much greener than red/blue: below is the figure, above is background


def key(img_bytes):
    """RGBA of the figure, or None if no figure stands out from the green."""
    rgb = np.asarray(Image.open(io.BytesIO(img_bytes)).convert("RGB")).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    greenness = g - np.maximum(r, b)
    alpha = 1 - np.clip((greenness - SOLID) / (CLEAR - SOLID), 0, 1)
    # Despill: green can't outshine red and blue anywhere on the figure.
    rgb[..., 1] = np.minimum(g, np.maximum(r, b) + 4)
    # Keep the one figure (the largest solid piece); drop specks.
    solid = (alpha > 0.5).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    if n < 2:
        return None
    keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    near = cv2.dilate((labels == keep).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    alpha = np.where(near, alpha, 0)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.6)          # the softest edge, no halo
    out = Image.fromarray(np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8), "RGBA")
    return out.crop(out.getbbox())
