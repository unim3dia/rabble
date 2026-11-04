"""Shared config for Rabble. Loads the Meta key without ever printing it.

Key resolution (first hit wins):
  1. $META_API_KEY / $MODEL_API_KEY environment variables
  2. .rabble-env in the project root (gitignored, KEY=value lines)
  3. ~/Documents/iseeme/.iseeme-env, if present (read-only)

The key value is never logged, printed, or included in error messages.
"""
import os

STREAK_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STREAK_ENV = os.path.join(STREAK_ROOT, ".rabble-env")
ISEEME_ENV = os.path.expanduser("~/Documents/iseeme/.iseeme-env")
OUTPUTS = os.path.join(STREAK_ROOT, "work")

DEFAULTS = {
    "META_API_BASE": "https://api.meta.ai/v1",
    "META_MODEL_IMAGE": "muse-image-1.0",
    "META_MODEL_SAM": "sam-3.1",
    "META_MODEL_TEACHER": "muse-spark-1.3",
    "META_DATA_MODE": "standard",
}


def _parse_env_file(path):
    out = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip("'\"")
    except FileNotFoundError:
        pass
    return out


def get_config():
    cfg = dict(DEFAULTS)
    for path in (ISEEME_ENV, STREAK_ENV):
        for k, v in _parse_env_file(path).items():
            if k in DEFAULTS or k in ("META_API_KEY", "MODEL_API_KEY", "AI_PROVIDER"):
                if v:
                    cfg[k] = v
    for k in list(DEFAULTS) + ["META_API_KEY", "MODEL_API_KEY"]:
        if os.environ.get(k):
            cfg[k] = os.environ[k]
    return cfg


def require_key(cfg):
    """Return the API key, or raise instructions that contain no key material."""
    key = cfg.get("META_API_KEY") or cfg.get("MODEL_API_KEY")
    if not key:
        raise SystemExit(
            "No Meta API key found. Set META_API_KEY in the environment or "
            ".rabble-env in the project root (gitignored)."
        )
    mode = (cfg.get("META_DATA_MODE") or "").strip().lower()
    if mode != "standard":
        raise SystemExit("Refusing to run: META_DATA_MODE must be exactly 'standard'.")
    for mkey in ("META_MODEL_IMAGE", "META_MODEL_SAM", "META_MODEL_TEACHER"):
        if str(cfg.get(mkey, "")).strip().lower().endswith("-contributor"):
            raise SystemExit(f"Refusing to run: {mkey} must not be a *-contributor model.")
    return key
