"""Fresh words for the pile, written by Muse Spark.

Spark searches the web for today's genuinely good news, then writes short,
abstract whispers for the pile: feelings of the day, good news in a few words,
and murmurs (welcome / idle / poked / tilt / leaving). A batch is cached and
refreshed in the background, so the app never waits and never repeats for long.
"""
import json
import os
import re
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import costs  # noqa: E402
import meta_api  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FALLBACK = os.path.join(ROOT, "app", "murmurs.json")
REFRESH_S = 45 * 60
KINDS = ("feelings", "news", "welcome", "idle", "poked", "tilt", "leaving")

PROMPT = """Today is {date}. Search the web for genuinely good, uplifting news from
today or the last day or two: kindness, recoveries, nature, discoveries, small
local wins. Nothing political, nothing sad, nothing with a catch.

Then write words for Rabble: a soft pile of tiny people in a big group hug,
awake late at night, a little lonely, glad to be together. These words float
up from the pile as whispers. Lowercase, 2 to 7 words, warm and a little
abstract, like half-asleep friends. No emoji, no hashtags, nothing cheesy or
therapeutic, never about the app. Every line different.

Return ONLY a JSON object with these keys:
"feelings": 24 lines naming how today might feel ("tender, a bit hopeful").
"news": 24 lines, each a real good thing from today's news, distilled into a
  gentle whisper ("53 orangutans went home today", "a stranger's hands, a
  heartbeat back").
"welcome": 16 lines said when someone new drops in.
"idle": 24 drowsy things said to each other.
"poked": 16 lines said when someone is tapped.
"tilt": 12 lines said when the pile sways.
"leaving": 12 lines said when someone rolls out of the pile.
"""

_lock = threading.Lock()
_batch = None          # the latest good batch
_made_at = 0.0
_busy = False


def _final_text(out):
    """The last assistant message text from a Responses API result."""
    text = ""
    for item in out.get("output", []):
        if item.get("type") == "message":
            for part in item.get("content", []):
                if part.get("type") == "output_text":
                    text = part.get("text", "")
    return text


def _valid(data):
    return isinstance(data, dict) and all(
        isinstance(data.get(k), list) and len(data[k]) >= 4 for k in KINDS)


def _generate():
    status, out = meta_api._post_json("/responses", {
        "model": meta_api.TEACHER_MODEL,
        "input": PROMPT.format(date=time.strftime("%B %d, %Y")),
        "tools": [{"type": "web_search"}],
        "reasoning": {"effort": "low"},
        "max_output_tokens": 16000,
    }, timeout=300)
    if status != 200 or not isinstance(out, dict):
        raise RuntimeError(f"whispers failed (HTTP {status})")
    usage = out.get("usage") or {}
    costs.log_call("responses/whispers", meta_api.TEACHER_MODEL, "rabble whispers",
                   in_tokens=usage.get("input_tokens", 0),
                   out_tokens=usage.get("output_tokens", 0))
    match = re.search(r"\{.*\}", _final_text(out), re.S)
    data = json.loads(match.group(0)) if match else None
    if not _valid(data):
        raise RuntimeError("whispers came back in the wrong shape")
    clean = {k: [str(s).strip().lower()[:60] for s in data[k] if str(s).strip()] for k in KINDS}
    clean["made"] = time.strftime("%Y-%m-%dT%H:%M")
    return clean


def _refresh():
    global _batch, _made_at, _busy
    try:
        batch = _generate()
        with _lock:
            _batch, _made_at = batch, time.time()
        sys.stderr.write(f"rabble: fresh whispers ({sum(len(batch[k]) for k in KINDS)} lines)\n")
    except Exception as e:  # keep serving the last batch or the fallback
        sys.stderr.write(f"rabble: whispers refresh failed: {type(e).__name__}: {e}\n")
    finally:
        _busy = False


def _fallback():
    with open(FALLBACK, encoding="utf-8") as f:
        base = json.load(f)
    return {"feelings": [], "news": [], "leaving": ["see you soon", "night night"], **base}


def current():
    """The freshest batch we have; starts a refresh in the background if stale."""
    global _busy
    with _lock:
        stale = time.time() - _made_at > REFRESH_S
        batch = _batch
        if stale and not _busy:
            _busy = True
            threading.Thread(target=_refresh, daemon=True).start()
    return batch or _fallback()


if __name__ == "__main__":
    print(json.dumps(_generate(), indent=1, ensure_ascii=False))
