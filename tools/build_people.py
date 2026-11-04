"""Write app/people.json (no prompts) from the roster, for people that exist."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
roster = json.load(open(os.path.join(ROOT, "tools", "roster.json")))
POSES = ("curl", "drape", "lean", "prop", "chin", "snuggle")


def has(name):
    return os.path.exists(os.path.join(ROOT, "app", "people", name + ".png"))


people = [{**{k: p[k] for k in ("slug", "name", "place", "ring", "age")}, **({"bio": p["bio"]} if p.get("bio") else {}),
           "poses": [x for x in POSES if has(f"{p['slug']}-{x}")]}
          for p in roster if has(p["slug"])]
json.dump(people, open(os.path.join(ROOT, "app", "people.json"), "w"), indent=1, ensure_ascii=False)
print(f"{len(people)} people")

# Phone-ready copies for the app (small, a little more contrast).
sys_path = os.path.join(ROOT, "tools")
import sys  # noqa: E402
sys.path.insert(0, sys_path)
import optimize_people  # noqa: E402
optimize_people.main()
