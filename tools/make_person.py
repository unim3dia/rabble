"""Make one Rabble person: Muse Image generates it, SAM 3.1 cuts it out.

Usage: python make_person.py <slug> "<description>" [age]
Writes work/raw/<slug>.png (full image) and app/people/<slug>.png
(transparent, trimmed, max 420px tall).
"""
import io
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meta_api  # noqa: E402
from sam_parse import parse_output_text, full_frame_mask  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "work", "raw")
OUT = os.path.join(ROOT, "app", "people")
MAX_H = 420

STYLE = (
    "A single small, squishy, chunky clay figurine of a grown person, full body. "
    "Their face and features are true to their real age (smile lines, grey "
    "hair, stubble or wrinkles where the age calls for it); they are NOT a "
    "baby or toddler. Only the proportions are toy-like: big round head, "
    "soft round body, short stubby arms and legs, little feet, rosy cheeks. "
    "Fully clothed: the top covers the whole tummy, and they always wear bottoms (pants, shorts, a skirt or a long dress). "
    "Soft matte clay / plush vinyl toy look, gentle studio light, subtle "
    "soft shadows, warm and wholesome. Centered, whole body visible with "
    "space around it, on a plain flat pale cream background, nothing else "
    "in the frame. No other people, hands or props. "
)


# Pile poses: how people lie together in a big group hug.
POSES = {
    "curl": "Pose: lying on their side, curled up cozy, both arms wrapped around "
            "a soft cushion hugged to their chest, cheek resting on it, eyes closed, "
            "peaceful smile. Seen from the front, slightly above.",
    "drape": "Pose: lying on their tummy, draped forward over a soft lumpy cushion, "
             "both arms wrapped around it in a hug, cheek resting on it, eyes closed, "
             "content smile. Seen from the front, slightly above.",
    "prop": "Pose: lying on their side, propped up on one elbow with that hand "
            "cupping their cheek, the other arm reaching out wide for a hug. Exactly "
            "two arms and two hands, nothing else. Eyes open and bright, a big warm "
            "grin. Seen from the front, slightly above.",
    "chin": "Pose: lying on their tummy, chin resting on both hands, feet kicked up "
            "behind, eyes open and sparkling, laughing. Seen from the front, slightly above.",
    "snuggle": "Pose: sitting, leaning sideways with both arms open wide as if hugging "
               "someone beside them, eyes open, joyful laughing face.",
    "lean": "Pose: sitting with knees up, leaning sideways, arms wrapped around "
            "themselves in a cozy self-hug, head tilted to the side as if resting on "
            "someone's shoulder, eyes closed, soft smile.",
}


def prompt_for(desc, age=None, pose=None):
    who = f"This person is {age} years old. " if age else ""
    return STYLE + who + desc + " " + POSES.get(pose, "")


def largest_blob(mask):
    """Keep the main figure; drop stray crumbs SAM sometimes includes."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if n <= 2:
        return mask
    keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return labels == keep


def cut_out(img_bytes):
    """Return an RGBA image of the person, or None if SAM finds nothing."""
    # Clay figures sometimes don't read as a "person" to SAM; try kinder words.
    recs = []
    for concept in ("person", "doll", "toy figure"):
        recs = parse_output_text(meta_api.sam_segment(img_bytes, "image/png", concept, "rabble cutout"))
        if recs:
            break
    if not recs:
        return None
    src = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    w, h = src.size
    # SAM may split one figure into pieces; union them all.
    mask = np.zeros((h, w), bool)
    for r in recs:
        mask |= full_frame_mask(r, w, h)
    mask = largest_blob(mask)
    alpha = Image.fromarray((mask * 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    rgba = src.copy()
    rgba.putalpha(alpha)
    return rgba.crop(alpha.getbbox())


def main():
    slug, desc = sys.argv[1], sys.argv[2]
    age = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    pose = sys.argv[4] if len(sys.argv) > 4 else None
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    blob = meta_api.images_generate(prompt_for(desc, age, pose), f"rabble {slug}")[0]
    with open(os.path.join(RAW, slug + ".png"), "wb") as f:
        f.write(blob)
    person = cut_out(blob)
    if person is None:
        raise SystemExit(f"{slug}: SAM found no person")
    if person.height > MAX_H:
        person = person.resize(
            (round(person.width * MAX_H / person.height), MAX_H), Image.LANCZOS)
    person.save(os.path.join(OUT, slug + ".png"), optimize=True)
    print(f"{slug}: {person.width}x{person.height}")


if __name__ == "__main__":
    main()
