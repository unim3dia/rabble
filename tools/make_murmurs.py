"""Muse Spark writes the pile's murmurs once; the app reads app/murmurs.json."""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meta_api  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMPT = """You voice Rabble: a soft, wholesome pile of tiny squishy people in a big
group hug, all awake late at night, all a little lonely, happy to be together.
Write the tiny sleepy things they murmur. Lowercase, warm, 1-5 words, no emoji,
nothing cheesy or therapeutic, never about the app. Like half-asleep friends.

Return only JSON with these keys, each a list of 14 strings:
"welcome": said when someone new drops into the pile ("oh, hi", "scoot in").
"idle": drowsy things said to each other ("your elbow's warm").
"poked": said when someone taps them ("mm?").
"tilt": said when the pile sways ("whoa", "hold on")."""

text, _ = meta_api.chat_completion([{"role": "user", "content": PROMPT}], "rabble murmurs",
                                   max_tokens=4000, temperature=0.9)
data = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
assert all(isinstance(data[k], list) and data[k] for k in ("welcome", "idle", "poked", "tilt"))
json.dump(data, open(os.path.join(ROOT, "app", "murmurs.json"), "w"), indent=1, ensure_ascii=False)
print(json.dumps(data, indent=1, ensure_ascii=False))
