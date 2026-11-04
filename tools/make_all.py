"""Generate every roster person's pile poses not yet in app/people, 6 at a time.

Files: <slug>.png is the arms-open pose; <slug>-<pose>.png for each of POSES.
"""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from make_person import POSES  # noqa: E402


def make(job):
    p, pose = job
    slug = p["slug"] + (f"-{pose}" if pose else "")
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "make_person.py"),
                        slug, p["desc"], str(p.get("age", "")), pose or ""],
                       capture_output=True, text=True)
    print(r.stdout.strip() or f"FAILED {slug}: {r.stderr.strip()[-300:]}", flush=True)


roster = json.load(open(os.path.join(ROOT, "tools", "roster.json")))
jobs = []
for p in roster:
    poses = [None] if p["ring"] == "you" else [None, *POSES]
    for pose in poses:
        slug = p["slug"] + (f"-{pose}" if pose else "")
        if not os.path.exists(os.path.join(ROOT, "app", "people", slug + ".png")):
            jobs.append((p, pose))
print(f"{len(jobs)} to make", flush=True)
with ThreadPoolExecutor(6) as ex:
    list(ex.map(make, jobs))
