"""Rabble people from every country: one woman and one man each, ages 10-90.

Not run automatically. Two steps, both resumable (finished work is skipped):

  1. describe  Muse Spark writes a short look for each person: features, hair,
               everyday clothes and style of their country. Plain everyday
               life only: no religious items, symbols, flags, logos or text.
               -> tools/world_roster.json
  2. make      Muse Image makes each person in all seven poses, SAM cuts them
               out, and they join the roster in the "world" ring.
               -> app/people/<slug>[-pose].png, tools/roster.json, app/people.json

Run:   python tools/world_people.py describe
       python tools/world_people.py make
Size:  ~390 people x 7 images ~ 2,700 images, roughly $35 and a few hours.
"""
import json
import os
import random
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meta_api  # noqa: E402
from make_person import POSES  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORLD = os.path.join(ROOT, "tools", "world_roster.json")
ROSTER = os.path.join(ROOT, "tools", "roster.json")
BATCH = 15
WORKERS = 6

COUNTRIES = """Afghanistan, Albania, Algeria, Andorra, Angola, Antigua and Barbuda, Argentina,
Armenia, Australia, Austria, Azerbaijan, Bahamas, Bahrain, Bangladesh, Barbados, Belarus,
Belgium, Belize, Benin, Bhutan, Bolivia, Bosnia and Herzegovina, Botswana, Brazil, Brunei,
Bulgaria, Burkina Faso, Burundi, Cabo Verde, Cambodia, Cameroon, Canada, Central African
Republic, Chad, Chile, China, Colombia, Comoros, Congo, Costa Rica, Côte d'Ivoire, Croatia,
Cuba, Cyprus, Czechia, Democratic Republic of the Congo, Denmark, Djibouti, Dominica,
Dominican Republic, Ecuador, Egypt, El Salvador, Equatorial Guinea, Eritrea, Estonia,
Eswatini, Ethiopia, Fiji, Finland, France, Gabon, Gambia, Georgia, Germany, Ghana, Greece,
Grenada, Guatemala, Guinea, Guinea-Bissau, Guyana, Haiti, Honduras, Hungary, Iceland, India,
Indonesia, Iran, Iraq, Ireland, Israel, Italy, Jamaica, Japan, Jordan, Kazakhstan, Kenya,
Kiribati, Kuwait, Kyrgyzstan, Laos, Latvia, Lebanon, Lesotho, Liberia, Libya, Liechtenstein,
Lithuania, Luxembourg, Madagascar, Malawi, Malaysia, Maldives, Mali, Malta, Marshall Islands,
Mauritania, Mauritius, Mexico, Micronesia, Moldova, Monaco, Mongolia, Montenegro, Morocco,
Mozambique, Myanmar, Namibia, Nauru, Nepal, Netherlands, New Zealand, Nicaragua, Niger,
Nigeria, North Korea, North Macedonia, Norway, Oman, Pakistan, Palau, Palestine, Panama,
Papua New Guinea, Paraguay, Peru, Philippines, Poland, Portugal, Qatar, Romania, Russia,
Rwanda, Saint Kitts and Nevis, Saint Lucia, Saint Vincent and the Grenadines, Samoa,
San Marino, Sao Tome and Principe, Saudi Arabia, Senegal, Serbia, Seychelles, Sierra Leone,
Singapore, Slovakia, Slovenia, Solomon Islands, Somalia, South Africa, South Korea,
South Sudan, Spain, Sri Lanka, Sudan, Suriname, Sweden, Switzerland, Syria, Taiwan,
Tajikistan, Tanzania, Thailand, Timor-Leste, Togo, Tonga, Trinidad and Tobago, Tunisia,
Türkiye, Turkmenistan, Tuvalu, Uganda, Ukraine, United Arab Emirates, United Kingdom,
United States, Uruguay, Uzbekistan, Vanuatu, Vatican City, Venezuela, Vietnam, Yemen,
Zambia, Zimbabwe"""

PROMPT = """For each country below, describe two ordinary people who live there today:
one woman and one man. They are just living their lives. Make them feel true to
the country: realistic physical features (skin tone, hair texture and style,
face), how people there carry themselves, and everyday clothes and colours people
there really wear. Vary ages widely between 10 and 90 across the whole list.

Strict rules: no religious clothing or items of any kind, no symbols, flags,
emblems, logos, writing or jewellery with meaning. No costumes or stereotypes;
everyday modern life. Always wearing bottoms (pants, shorts, skirt or long dress).

Return ONLY a JSON list, one object per person:
{{"country": "...", "gender": "woman" | "man", "name": "a common first name there",
  "age": 10-90, "desc": "one sentence: skin tone, hair, and what they're wearing"}}

Countries: {countries}"""


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def describe():
    done = json.load(open(WORLD)) if os.path.exists(WORLD) else []
    have = {(p["country"], p["gender"]) for p in done}
    todo = [c.strip() for c in COUNTRIES.replace("\n", " ").split(",") if c.strip()]
    todo = [c for c in todo if (c, "woman") not in have or (c, "man") not in have]
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        text, _ = meta_api.chat_completion(
            [{"role": "user", "content": PROMPT.format(countries=", ".join(chunk))}],
            f"world people {chunk[0]}", max_tokens=8000, temperature=0.8, reasoning_effort="low")
        match = re.search(r"\[.*\]", text, re.S)
        for p in json.loads(match.group(0)) if match else []:
            if p.get("country") in chunk and p.get("gender") in ("woman", "man") and p.get("desc"):
                age = max(10, min(90, int(p.get("age") or random.randint(18, 80))))
                p.update(age=age, slug=f"w-{slugify(p['country'])}-{p['gender']}")
                done.append(p)
        json.dump(done, open(WORLD, "w"), indent=1, ensure_ascii=False)
        print(f"described {len(done)} people", flush=True)


def make_one(job):
    p, pose = job
    slug = p["slug"] + (f"-{pose}" if pose else "")
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "make_person.py"),
                        slug, p["desc"], str(p["age"]), pose or ""], capture_output=True, text=True)
    print(r.stdout.strip() or f"FAILED {slug}", flush=True)


def make():
    people = json.load(open(WORLD))
    jobs = [(p, pose) for p in people for pose in [None, *POSES]
            if not os.path.exists(os.path.join(ROOT, "app", "people",
                                               p["slug"] + (f"-{pose}" if pose else "") + ".png"))]
    print(f"{len(jobs)} images to make", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex:
        list(ex.map(make_one, jobs))
    # Everyone who came out joins the world ring.
    roster = json.load(open(ROSTER))
    known = {p["slug"] for p in roster}
    for p in people:
        if p["slug"] in known or not os.path.exists(os.path.join(ROOT, "app", "people", p["slug"] + ".png")):
            continue
        roster.append({"slug": p["slug"], "name": p["name"], "place": p["country"],
                       "ring": "world", "desc": p["desc"], "age": p["age"]})
    json.dump(roster, open(ROSTER, "w"), indent=1, ensure_ascii=False)
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_people.py")])


if __name__ == "__main__":
    {"describe": describe, "make": make}[sys.argv[1]]()
