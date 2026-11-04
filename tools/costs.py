"""Cost logger: every Meta API call is recorded with an approximate USD cost.

Pricing (dev.meta.ai/docs/pricing-rate-limits, Standard mode, Oct 2026):
  Muse Spark 1.3:  $1.25 / 1M input tokens, $4.25 / 1M output tokens
  Muse Image 1.0:  $0.01 per generated image (flat)
  SAM 3.1:         $2.50 / 1,000 images ($0.0025 each)
"""
import json
import os
import time

from config import OUTPUTS

COSTS_PATH = os.path.join(OUTPUTS, "costs.jsonl")

SPARK_IN_PER_1M = 1.25
SPARK_OUT_PER_1M = 4.25
IMAGE_PER_IMAGE = 0.01
SAM_PER_IMAGE = 0.0025


def log_call(endpoint, model, detail="", in_tokens=0, out_tokens=0, images=0):
    # Per docs, image responses carry token counts for reference only; the
    # flat per-image price is the whole charge. SAM is per image/frame too.
    if endpoint in ("images/generations", "images/edits"):
        usd = images * IMAGE_PER_IMAGE
    elif endpoint == "responses/sam":
        usd = images * SAM_PER_IMAGE
    else:
        usd = (in_tokens / 1e6) * SPARK_IN_PER_1M + (out_tokens / 1e6) * SPARK_OUT_PER_1M
    entry = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "endpoint": endpoint,
        "model": model,
        "detail": detail,
        "in_tokens": in_tokens,
        "out_tokens": out_tokens,
        "images": images,
        "usd": round(usd, 6),
    }
    os.makedirs(OUTPUTS, exist_ok=True)
    with open(COSTS_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    return entry


def total_spend():
    total = 0.0
    try:
        with open(COSTS_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    total += float(json.loads(line).get("usd", 0.0))
    except FileNotFoundError:
        pass
    return total
