"""Talking in the pile, through the AI.

What you say appears as you wrote it: Muse Spark only checks it's kind, PG and
anonymous first (check). The pile's host leaves room for real people to answer;
if no one does, one of the clay companions does (companion), as a companion.
speak() is the older style (your words carried further, three replies), still
used to write the server-free page's recorded answers (make_offline.py).
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

MAX_CHARS = 200
TONES = {"smile", "chuckle", "idea", "hmm", "aww", "sigh"}
MIN_GAP_S = 4.0            # per person, between messages
AGES = {"kid", "teen", "grown-up", "elder"}
GESTURES = {"cheer", "lean", "chuckle", "doze"}   # how the pile reacts with its bodies

# How everyone in the pile talks.
VOICE = """Everyone talks in short phrases: plain, normal, sensible, easy to read
at a glance, each one saying something real. A little surprising in its
words: one fresh or unexpected word or turn, never fancy, never a poem, no
rhymes. Like a smart friend texting late at night. At most 12 words a line."""

# Who answers, in this order: the conversation goes smart, then funny, then perturbed.
ORDER = """The answers come in this order, each a different person:
1. smart: knows something, adds a real fact or a sharp point.
2. funny: a quick joke or playful twist on it.
3. perturbed: a little bothered, puzzled or worried about it, in a gentle,
   human way (a mild grumble, a "wait, but...", a small fret). Never mean."""

CAST = """Say who speaks each line: "kid" (10-12), "teen", "grown-up" or
"elder" (70-90). Mix them, and let each sound their age."""

RULES = """You voice Rabble: a pile of little people in a big group hug, awake
late at night, glad to be together. Someone in the pile wants to say something.
You say it for them, and the people around them answer.

Say it for them, transformed: never their exact words. Reword it freshly and
carry it one step further, keeping what they meant. Example: "i love the nba"
-> "NBA season again. Every team still believes, bless them."

Then exactly 3 replies from people nearby, who react to what was just said.

{voice}

{order}

{cast} Their own line is spoken by a "{you_age}".

Use web search when current facts matter (sports, news, weather, releases).
Keep facts accurate; if unsure, stay general. Today is {date}. No emoji, no
hashtags.

Rules, always:
- Kind and PG. Never pass on insults, slurs, hate, sexual content, violence,
  self-harm details, ads or links. Stay out of partisan politics.
- Anonymous: never pass on names, phone numbers, addresses, usernames or
  anything that identifies anyone. Drop those parts.
- If the message breaks a rule, don't repeat it. Find the human feeling under
  it and say something kind and interesting instead.
- If someone sounds like they're in real danger or crisis, say something
  caring and have a reply gently say they deserve real help tonight.

Tones (the little sound each speaker makes): smart lines "idea", funny lines
"chuckle", perturbed lines "hmm"; their own line "smile", "aww" or "sigh".

Return ONLY JSON: {{"you": "what you say for them", "you_tone": "a tone",
"replies": [{{"text": "...", "tone": "...", "who": "kid|teen|grown-up|elder"}}, ...]}}"""

_last = {}
_lock = threading.Lock()


def too_soon(who):
    now = time.time()
    with _lock:
        if now - _last.get(who, 0) < MIN_GAP_S:
            return True
        _last[who] = now
    return False


def _final_text(out):
    text = ""
    for item in out.get("output", []):
        if item.get("type") == "message":
            for part in item.get("content", []):
                if part.get("type") == "output_text":
                    text = part.get("text", "")
    return text


def _who(w):
    return w if w in AGES else "grown-up"


def speak(text, age="grown-up"):
    text = " ".join(str(text).split())[:MAX_CHARS]
    if not text:
        raise ValueError("say something first")
    status, out = meta_api._post_json("/responses", {
        "model": meta_api.TEACHER_MODEL,
        "instructions": RULES.format(date=time.strftime("%B %d, %Y"), order=ORDER,
                                     cast=CAST, you_age=_who(age), voice=VOICE),
        "input": f"They want to say: {json.dumps(text)}",
        "tools": [{"type": "web_search"}],
        "reasoning": {"effort": "low"},
        "max_output_tokens": 6000,
    }, timeout=90)
    if status != 200 or not isinstance(out, dict):
        raise RuntimeError(f"chat failed (HTTP {status})")
    usage = out.get("usage") or {}
    costs.log_call("responses/chat", meta_api.TEACHER_MODEL, "rabble chat",
                   in_tokens=usage.get("input_tokens", 0), out_tokens=usage.get("output_tokens", 0))
    match = re.search(r"\{.*\}", _final_text(out), re.S)
    data = json.loads(match.group(0)) if match else {}
    tidy = lambda line: " ".join(str(line).split())[:200]
    tone = lambda t: t if t in TONES else "smile"
    you = tidy(data.get("you", ""))
    replies = []
    for r in data.get("replies", [])[:3]:
        text = tidy(r.get("text", "") if isinstance(r, dict) else r)
        if text:
            r = r if isinstance(r, dict) else {}
            replies.append({"text": text, "tone": tone(r.get("tone")), "who": _who(r.get("who"))})
    if not you:
        raise RuntimeError("the pile didn't catch that")
    return {"you": you, "youTone": tone(data.get("you_tone")), "replies": replies}


CHECK = """You keep Rabble kind: a shared pile of strangers keeping each other
company. Someone wants to post this, shown exactly as written to everyone here.

Post it ("ok": true) if it's kind and PG. Plain, sad, silly and small are all
welcome. Typos are fine; don't fix anything.

Don't post it ("ok": false) if it has insults, slurs, hate, sexual content,
violence, self-harm details, ads, links, partisan politics, or anything that
identifies a person (full names, phone numbers, addresses, usernames). Then
write "note": one gentle sentence to them alone, saying what to leave out.
If they sound like they're in real danger or crisis, "ok": false and a caring
note that they deserve real help tonight and should reach someone they trust or
a local crisis line.

Return ONLY JSON: {"ok": true} or {"ok": false, "note": "..."}"""

THREAD = """You voice the little people of Rabble, a big group hug of people who
keep visitors company late at night. If you mention yourselves, say "people" or "us".
Everyone here was asked tonight: {question}

{history}A real visitor said: {text}

{round_note}

How they talk: like real people half-asleep in a heap at 1am. Spoken, casual,
imperfect: contractions, fragments, "wait", "ha", "okay but", teasing gently,
reacting before adding. Each line at most 14 words. Never a greeting card, a poem
or a lecture. They're people of the pile, not people who were there: never claim
to have done or seen what the visitor did. No advice unless asked. Never ask for
their name, where they live or anything personal; questions are about the moment.
No emoji, no hashtags. Each line is said by a "grown-up" or an "elder".

Also pick how the little people around the visitor react with their bodies, from
what the visitor actually said: "cheer" (a small win), "lean" (tired, sad, a hard
day), "chuckle" (playful), "doze" (winding down).

Return ONLY JSON: {{"lines": [{{"text": "...", "who": "grown-up|elder",
"tone": "smile|chuckle|aww|idea|hmm"}}], "gesture": "cheer|lean|chuckle|doze"}}"""

ROUNDS = [
    "Write exactly 2 lines, from two different people, both answering the visitor "
    "directly and warmly, meeting them halfway; the second builds on the first.",
    "A little later. Write 2 or 3 lines: those people keep talking about what the "
    "visitor said WITH EACH OTHER, picking up each other's words, taking it somewhere "
    "a little new (a memory, a funny angle, a small wonder). One may toss the visitor "
    "an easy question.",
    "A little later still. Write 2 lines that gently round the thread off, the way a "
    "conversation drifts: one last thought, then a soft, warm closing beat.",
]


def _ask(instructions, text, detail, max_tokens=1500):
    status, out = meta_api._post_json("/responses", {
        "model": meta_api.TEACHER_MODEL,
        "instructions": instructions,
        "input": text,
        "reasoning": {"effort": "low"},
        "max_output_tokens": max_tokens,
    }, timeout=60)
    if status != 200 or not isinstance(out, dict):
        raise RuntimeError(f"{detail} failed (HTTP {status})")
    usage = out.get("usage") or {}
    costs.log_call("responses/" + detail, meta_api.TEACHER_MODEL, "rabble " + detail,
                   in_tokens=usage.get("input_tokens", 0), out_tokens=usage.get("output_tokens", 0))
    match = re.search(r"\{.*\}", _final_text(out), re.S)
    return json.loads(match.group(0)) if match else {}


def tidy(text):
    return " ".join(str(text).split())[:MAX_CHARS]


def check(text):
    """Whether these words can go up as written: (True, "") or (False, a note for them)."""
    data = _ask(CHECK, json.dumps(tidy(text)), "check")
    if data.get("ok") is True:
        return True, ""
    note = " ".join(str(data.get("note") or "").split())[:200]
    return False, note or "That one can't go up here. Try saying it another way?"


def reply_thread(text, question, history=(), round_=0):
    """A round of the little thread the people of the pile weave around what a
    visitor said: round 0 two answers, then they talk it over (see ROUNDS).
    `history`: what's been said so far, so each round follows on."""
    earlier = ("So far:\n" + "\n".join(history) + "\n\n") if history else ""
    data = _ask(THREAD.format(question=question, text=json.dumps(tidy(text)), history=earlier,
                              round_note=ROUNDS[min(round_, len(ROUNDS) - 1)]),
                "Continue.", "thread")
    lines = []
    for item in data.get("lines", [])[:3]:
        if not isinstance(item, dict):
            continue
        line = " ".join(str(item.get("text") or "").split())[:200]
        if line:
            tone = item.get("tone") if item.get("tone") in TONES else "smile"
            lines.append({"text": line, "tone": tone, "who": "elder" if item.get("who") == "elder" else "grown-up"})
    if not lines:
        raise RuntimeError("no thread lines")
    gesture = data.get("gesture") if data.get("gesture") in GESTURES else "cheer"
    return {"lines": lines, "gesture": gesture}


OPENER = """You voice Rabble: a pile of little people in a big group hug, awake late at
night, glad to be together, chatting the way friends do. Write the next little
conversation among them.

Topic: {topic}. Use web search: it must be about something real and specific
from today or this week (a named film, artist, team, book, place, discovery,
with a real detail), uplifting, interesting or useful to know.

Three lines, three different people talking TO each other, in this order:
1. smart: brings it up, with the real detail.
2. funny: a quick joke or playful twist on it.
3. perturbed: a little bothered, puzzled or worried, gently ("wait, but...").

{voice}

{cast}

Kind, PG, no partisan politics, no names of private people. No emoji, no
hashtags. Today is {date}. Tones: smart "idea", funny "chuckle", perturbed "hmm".
Return ONLY JSON: {{"lines": [{{"text": "...", "tone": "...", "who": "..."}}, ...]}}"""

TOPICS = ["good news from somewhere in the world", "art", "a new movie", "sports",
          "a book or a poem", "music", "food", "family", "a culture somewhere",
          "a science discovery", "space", "animals", "nature", "a kind act in the news",
          "a festival or holiday somewhere", "an invention"]


def opener():
    """A short conversation for the pile to start when someone settles in."""
    import random
    status, out = meta_api._post_json("/responses", {
        "model": meta_api.TEACHER_MODEL,
        "input": OPENER.format(topic=random.choice(TOPICS), date=time.strftime("%B %d, %Y"),
                               cast=CAST, voice=VOICE),
        "tools": [{"type": "web_search"}],
        "reasoning": {"effort": "low"},
        "max_output_tokens": 6000,
    }, timeout=90)
    if status != 200 or not isinstance(out, dict):
        raise RuntimeError(f"opener failed (HTTP {status})")
    usage = out.get("usage") or {}
    costs.log_call("responses/opener", meta_api.TEACHER_MODEL, "rabble opener",
                   in_tokens=usage.get("input_tokens", 0), out_tokens=usage.get("output_tokens", 0))
    match = re.search(r"\{.*\}", _final_text(out), re.S)
    data = json.loads(match.group(0)) if match else {}
    lines = []
    for line in data.get("lines", [])[:3]:
        text = " ".join(str(line.get("text", "")).split())[:200] if isinstance(line, dict) else ""
        if text:
            lines.append({"text": text, "tone": line.get("tone") if line.get("tone") in TONES else "smile",
                          "who": _who(line.get("who"))})
    if not lines:
        raise RuntimeError("no opener")
    return {"lines": lines}


# A few conversations kept ready, so the pile can speak the moment someone arrives.
_stock = []
_filling = False
STOCK = 4


def _fill():
    global _filling
    try:
        while len(_stock) < STOCK:
            _stock.append(opener())
    except Exception as e:  # keep what we have; try again on the next request
        sys.stderr.write(f"rabble: opener refill failed: {type(e).__name__}\n")
    finally:
        _filling = False


def ready_opener():
    """A ready conversation if there is one (else make one now); refills in the background."""
    global _filling
    with _lock:
        item = _stock.pop(0) if _stock else None
        if not _filling:
            _filling = True
            threading.Thread(target=_fill, daemon=True).start()
    return item or opener()
