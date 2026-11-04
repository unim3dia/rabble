"""Find pictures with extra arms or hands (an AI-drawing slip) and take them
out of the pile. Muse Spark looks at each pose and counts.

  python tools/check_arms.py          # check every pose, drop the bad ones
Writes the result to tools/arm_check.json and removes flagged poses from
app/people.json (the files stay on disk; "open" is never removed).
"""
import base64
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meta_api  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "app", "people-web")
PEOPLE = os.path.join(ROOT, "app", "people.json")
OUT = os.path.join(ROOT, "tools", "arm_check.json")

ASK = ("This is one clay figurine of a single person. Count carefully: how many "
       "arms and how many hands belong to this one person? Look for extra "
       "forearms tucked under the chin or body. Return ONLY JSON: "
       '{"arms": n, "hands": n}')


def check(name):
    data = base64.b64encode(open(os.path.join(WEB, name + ".webp"), "rb").read()).decode()
    try:
        text, _ = meta_api.chat_completion([{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/webp;base64,{data}"}},
            {"type": "text", "text": ASK}]}], f"arm check {name}", max_tokens=2000, temperature=0)
        m = re.search(r"\{.*?\}", text, re.S)
        got = json.loads(m.group(0)) if m else {}
        return name, {"arms": int(got.get("arms", 0)), "hands": int(got.get("hands", 0))}
    except Exception as e:  # keep going; an unchecked pose stays in
        return name, {"error": type(e).__name__}


def main():
    people = json.load(open(PEOPLE))
    names = [p["slug"] if pose == "open" else f'{p["slug"]}-{pose}'
             for p in people for pose in ["open", *p["poses"]]]
    with ThreadPoolExecutor(8) as pool:
        results = dict(pool.map(check, names))
    json.dump(results, open(OUT, "w"), indent=1)
    bad = {n for n, r in results.items() if r.get("arms", 2) > 2 or r.get("hands", 2) > 2}
    for p in people:
        p["poses"] = [pose for pose in p["poses"] if f'{p["slug"]}-{pose}' not in bad]
    json.dump(people, open(PEOPLE, "w"), indent=1, ensure_ascii=False)
    print(f"checked {len(results)}, removed {len(bad - set(p['slug'] for p in people))}:",
          ", ".join(sorted(bad)))


if __name__ == "__main__":
    main()
