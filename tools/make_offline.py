"""Record a night of the pile's talk for the server-free version of Rabble
(the GitHub page): conversations from Muse Spark about real news, plus answers
to a few things people often say. Writes app/offline.json.

  python tools/make_offline.py
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chat  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "offline.json")
CONVERSATIONS = 18
SAYINGS = ["hello everyone", "i can't sleep", "what is everyone doing", "i love you all",
           "good night", "is anyone awake", "how is everyone", "i'm so tired",
           "tell me something good", "what's new", "i'm happy tonight", "i miss my friends",
           "this is nice", "who are you"]


def safely(fn, *args):
    try:
        return fn(*args)
    except Exception as e:  # no key material in the message
        sys.stderr.write(f"skipped: {type(e).__name__}\n")
        return None


def main():
    with ThreadPoolExecutor(6) as pool:
        talks = list(pool.map(lambda _: safely(chat.opener), range(CONVERSATIONS)))
        answers = list(pool.map(lambda s: safely(chat.speak, s), SAYINGS))
    data = {
        "conversations": [t["lines"] for t in talks if t],
        "sayings": {s: a for s, a in zip(SAYINGS, answers) if a},
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"{OUT}: {len(data['conversations'])} conversations, {len(data['sayings'])} sayings")


if __name__ == "__main__":
    main()
