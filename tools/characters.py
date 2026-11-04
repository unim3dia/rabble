"""Give every Rabble person a character: one warm line about who they are.

One Muse Spark call for the whole roster. Writes "bio" into tools/roster.json
and app/people.json. Run once (again only to refresh the characters):
  python tools/characters.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meta_api  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTER = os.path.join(ROOT, "tools", "roster.json")
PEOPLE = os.path.join(ROOT, "app", "people.json")

PROMPT = """These are the little people in Rabble, a cozy pile of people in a big
group hug, awake late at night. Give each one a character: one warm, specific
line (at most 18 words) about who they are: a passion, a habit, a small
quirk, something they're proud of. Make every one distinct and true to their
age and place. Kind and PG; no real people, brands or politics.

{people}

Return ONLY JSON: {{"slug": "the line", ...}} for every slug."""


def main():
    roster = json.load(open(ROSTER))
    people = "\n".join(f'- {p["slug"]}: {p["name"]}, {p.get("age", "?")}, from {p["place"]}. {p["desc"]}'
                       for p in roster)
    text, _ = meta_api.chat_completion([{"role": "user", "content": PROMPT.format(people=people)}],
                                       "rabble characters", temperature=0.8)
    match = re.search(r"\{.*\}", text, re.S)
    bios = json.loads(match.group(0)) if match else {}
    for p in roster:
        if isinstance(bios.get(p["slug"]), str):
            p["bio"] = " ".join(bios[p["slug"]].split())[:160]
    json.dump(roster, open(ROSTER, "w"), indent=1, ensure_ascii=False)
    app_people = json.load(open(PEOPLE))
    by_slug = {p["slug"]: p for p in roster}
    for p in app_people:
        if by_slug.get(p["slug"], {}).get("bio"):
            p["bio"] = by_slug[p["slug"]]["bio"]
    json.dump(app_people, open(PEOPLE, "w"), indent=1, ensure_ascii=False)
    print(f"{sum('bio' in p for p in roster)} of {len(roster)} people have a character")


if __name__ == "__main__":
    main()
