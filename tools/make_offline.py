"""Record a night of the pile's talk for the server-free version of Rabble
(the GitHub page): conversations from Muse Spark about real news, plus a clay
companion's answers to a few things people often say, and a few warm answers
for anything else. Writes app/offline.json.

  python tools/make_offline.py              # everything
  python tools/make_offline.py --answers    # only the answers; keeps the conversations
"""
import json
import os
import random
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
# For anything else: answers that fit whatever small thing someone shared.
ANY = "(they shared something small from their day; you don't know what. Answer warmly in general.)"
ANY_COUNT = 8
QUESTION = "What tiny thing rescued your day?"


def safely(fn, *args):
    try:
        return fn(*args)
    except Exception as e:  # no key material in the message
        sys.stderr.write(f"skipped: {type(e).__name__}\n")
        return None


def companion(text):
    part = safely(chat.reply_thread, text, QUESTION)
    return {"replies": part["lines"]} if part else None


def main():
    only_answers = "--answers" in sys.argv
    with ThreadPoolExecutor(6) as pool:
        if only_answers:
            talks = None
        else:
            talks = list(pool.map(lambda _: safely(chat.opener), range(CONVERSATIONS)))
        answers = list(pool.map(companion, SAYINGS))
        general = list(pool.map(companion, [ANY] * ANY_COUNT))
    conversations = ([t["lines"] for t in talks if t] if talks is not None
                     else json.load(open(OUT, encoding="utf-8"))["conversations"])
    data = {
        "conversations": conversations,
        "sayings": {s: a for s, a in zip(SAYINGS, answers) if a},
        "anything": [g["replies"][0] for g in general if g],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"{OUT}: {len(data['conversations'])} conversations, {len(data['sayings'])} sayings")


if __name__ == "__main__":
    main()
