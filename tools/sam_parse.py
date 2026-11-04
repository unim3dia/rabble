"""Parse SAM 3.1 Responses output_text into boxes + full-frame masks.

Wire grammar per dev.meta.ai/docs/sam/reading-segmentation:
  <Nf>id<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|><|mask;x=0;y=0;data=H,W,enc+payload|>,...
Mask raster covers the record's box (inclusive) at ~1px; pasted at (x1, y1).
Payload decoding via meta_sam_parser (zero-dep, canonical-checked).
"""
import re

import numpy as np
from PIL import Image

from meta_sam_parser import SegmentationMask, decode_mask_to_raster

BOX_RE = re.compile(
    r"<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)(?:;c=[^|]+)?\|>")
MASK_RE = re.compile(
    r"<\|mask;x=0;y=0(?:;c=[^;|]+)?;data=(\d+),(\d+),([!~])(.*?)\|>")
RECORD_RE = re.compile(
    r"(?:^|[,>])(?P<oid>\d+)(?P<box><\|box;.*?\|>)(?P<mask><\|mask;.*?\|>)")


def parse_output_text(text):
    """Returns list of {id, box:{x1,y1,x2,y2,w,h}, mask_raster, mask_w, mask_h}."""
    records = []
    for m in RECORD_RE.finditer(text):
        bm = BOX_RE.fullmatch(m.group("box"))
        mm = MASK_RE.fullmatch(m.group("mask"))
        if not bm or not mm:
            continue
        x1, y1, x2, y2, w, h = map(int, bm.groups())
        mh, mw, enc, payload = int(mm.group(1)), int(mm.group(2)), mm.group(3), mm.group(4)
        mask = SegmentationMask(
            encoding="one_bit" if enc == "!" else "lossless",
            payload=enc + payload, width=mw, height=mh)
        raster = np.frombuffer(decode_mask_to_raster(mask),
                                dtype=np.uint8).reshape(mh, mw).copy()
        records.append({"id": int(m.group("oid")),
                        "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "w": w, "h": h},
                        "raster": raster})
    return records


def full_frame_mask(record, out_w=None, out_h=None):
    """Paste the box-relative raster onto a full-frame bool mask."""
    b = record["box"]
    w, h = out_w or b["w"], out_h or b["h"]
    bw, bh = b["x2"] - b["x1"] + 1, b["y2"] - b["y1"] + 1
    small = Image.fromarray((record["raster"] * 255).astype(np.uint8))
    if small.size != (bw, bh):
        small = small.resize((bw, bh), Image.NEAREST)
    full = Image.new("L", (w, h), 0)
    full.paste(small, (b["x1"], b["y1"]))
    return np.array(full) > 0
