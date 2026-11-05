"""The Journey: the pile's one ongoing conversation, the same for everyone.

Five characters with jobs talk their way through the day's theme toward a
goal, chapter by chapter: the Guide opens a question, the Curator brings
something real (Muse Spark searches the web), the Storyteller makes it
personal, the Skeptic pushes back, the Wonderer asks the simple thing, and now
and then the Guide ties a knot: a "thread", one line kept in the night's
tapestry that later chapters call back to. Each exchange sees the theme, the
goal, a running summary, the last lines and the threads, so it continues the
story instead of restarting. It runs as long as the server does.

next_exchange() -> {"lines": [{"text", "tone", "who", "persona"}], "thread": str|"",
                    "theme": str}
"""
import json
import re
import sys
import threading
import time

import chat
import costs
import meta_api

# Who speaks, how, and as which age of clay person (the app casts the same face each time).
CAST = {
    "guide": ("elder", "The Guide: warm, calm, unhurried. Keeps the thread, asks the big question, "
                       "sums up what the room has found. Never preachy."),
    "curator": ("grown-up", "The Curator: curious and specific. Brings something real and current: a song, "
                            "an artist, a tradition, a dish, a book, a place, with one true detail."),
    "storyteller": ("grown-up", "The Storyteller: tender and a bit funny. Turns it personal: family, "
                                "grandparents, small remembered moments (invented, never about real private people)."),
    "skeptic": ("grown-up", "The Skeptic: a grown-up, dry, blunt, a little grumpy tonight. Challenges ideas and keeps it "
                        "honest, then sometimes grudgingly comes around. Never mean."),
    "wonderer": ("grown-up", "The Wonderer: a grown-up who's childlike at heart, not the sharpest, totally sincere. Asks simple questions "
                        "that turn out to be profound, and gets things a bit wrong in sweet ways."),
}
TONES = {"guide": "aww", "curator": "idea", "storyteller": "chuckle", "skeptic": "hmm", "wonderer": "smile"}

# One track a day: a theme, and a goal the room works toward.
THEMES = [
    ("the songs that raised us", "build a song together, one line at a time, out of what everyone remembers"),
    ("family bonds", "find the thread that connects everyone's grandparents"),
    ("rest and a good night's sleep", "put together a recipe for a good night, ingredient by ingredient"),
    ("art in everyday life", "collect a small museum of everyday things that are secretly art"),
    ("food and the people who feed us", "write a menu for a dinner where everyone you miss is invited"),
    ("home", "draw a map of all the places people call home, and what makes them home"),
    ("small kindnesses", "keep a count of the small kind things that changed someone's day"),
    ("being healthy in small ways", "make a list of tiny habits that make a body and mind feel looked after"),
]
CHAPTER_EXCHANGES = 6            # after this many exchanges, the Guide opens a new question
RECENT_LINES = 12
MAX_THREADS = 12
PER_HOUR = 90                    # a spending cap: at most this many exchanges an hour

PROMPT = """You are the director of Rabble's Journey: one ongoing, meaningful conversation
among little clay people in a pile, keeping each other company at night. It must feel
like a story that keeps going, never random, never repeating.

The cast (use their keys):
{cast}

Tonight's theme: {theme}.
The room's goal: {goal}.
Chapter {chapter}. {chapter_note}

The journey so far: {summary}

Threads already found (call back to them when it fits): {threads}

The last lines:
{recent}

The chapter's question: {question}

Write the NEXT short exchange: {count} lines, each by a different character (the Guide
need not speak every time). Someone reading along must be able to follow it like a
story: every line clearly answers or builds on the line right before it (pick up its
words or idea), and the exchange as a whole moves the chapter's question toward the goal.
{recap} Mix it up: a real detail from the Curator (use web
search for something true and current when it helps), a personal memory, a pushback, a
simple question.

How they talk: like real people half-asleep in a heap at 1am, not like writers. Spoken,
casual, imperfect: contractions, fragments, "wait", "ha", "okay but", "honestly",
trailing off, interrupting, teasing each other, reacting before adding. Each line at
most 14 words. Never sound like a guidebook, a poem, a greeting card or a TED talk: no
"Evening, friends", no flowery metaphors, no tidy morals. The Curator shares a fact the
way you'd tell a friend something cool you read ("did you know in Japan they…"), never
like an encyclopedia. Never repeat a fact, place, food or example that's already in the last lines or the
threads: always bring something new. No emoji, no hashtags, no names of real private people.

Rules: kind and PG; no partisan politics, no religion; "helpful" means gentle everyday
wisdom, never medical advice or health claims, and never name doctors, experts, brands
or products; real facts only (if unsure, stay general).

A "thread" is rare and precious: only when this exchange truly lands a new piece of the
goal (about one exchange in three or four, never two in a row), add one short line (at
most 12 words) that will be kept. Otherwise "thread": "". Last exchange had a thread: {had_thread}.
Also return an updated two-sentence "summary" of the whole journey so far.

If this exchange OPENS a chapter, also return "question": the chapter's question in at
most 10 words (otherwise repeat the current one).

Return ONLY JSON: {{"lines": [{{"persona": "guide|curator|storyteller|skeptic|wonderer",
"text": "..."}}], "thread": "...", "summary": "...", "question": "..."}}"""

_lock = threading.Lock()
_state = {"day": None, "theme": None, "goal": None, "exchange": 0, "summary": "It's just beginning.",
          "recent": [], "threads": [], "calls": []}


def _today():
    day = int(time.time() // 86400)
    if _state["day"] != day:
        theme, goal = THEMES[day % len(THEMES)]
        _state.update(day=day, theme=theme, goal=goal, exchange=0, summary="It's just beginning.",
                      recent=[], threads=[])
    return _state


def now():
    """Where the Journey is: tonight's theme and goal, and the chapter's question."""
    with _lock:
        s = _today()
        return {"theme": s["theme"], "goal": s["goal"], "question": s.get("question", "")}


def _call(prompt):
    status, out = meta_api._post_json("/responses", {
        "model": meta_api.TEACHER_MODEL,
        "input": prompt,
        "tools": [{"type": "web_search"}],
        "reasoning": {"effort": "low"},
        "max_output_tokens": 6000,
    }, timeout=90)
    if status != 200 or not isinstance(out, dict):
        raise RuntimeError(f"journey failed (HTTP {status})")
    usage = out.get("usage") or {}
    costs.log_call("responses/journey", meta_api.TEACHER_MODEL, "rabble journey",
                   in_tokens=usage.get("input_tokens", 0), out_tokens=usage.get("output_tokens", 0))
    match = re.search(r"\{.*\}", chat._final_text(out), re.S)
    return json.loads(match.group(0)) if match else {}


def next_exchange():
    """The next short exchange of the Journey (and remember it)."""
    with _lock:
        s = _today()
        now = time.time()
        s["calls"] = [t for t in s["calls"] if now - t < 3600]
        if len(s["calls"]) >= PER_HOUR:
            raise RuntimeError("journey: hourly cap reached")
        s["calls"].append(now)
        chapter = s["exchange"] // CHAPTER_EXCHANGES + 1
        opening = s["exchange"] % CHAPTER_EXCHANGES == 0
        note = ("This exchange OPENS the chapter: the Guide asks a fresh, thought-provoking question "
                "that moves the goal forward" + (" and gently welcomes everyone to tonight's theme." if chapter == 1 else ", building on the threads.")
                if opening else "Keep exploring this chapter's question.")
        prompt = PROMPT.format(
            cast="\n".join(f'"{k}": {d}' for k, (_, d) in CAST.items()),
            theme=s["theme"], goal=s["goal"], chapter=chapter, chapter_note=note,
            summary=s["summary"], threads="; ".join(s["threads"]) or "none yet",
            recent="\n".join(s["recent"]) or "(nothing yet: this is the very first exchange)",
            count=3 if opening else 4, had_thread="yes" if s.get("last_thread") else "no",
            question="(this exchange sets it)" if opening else s.get("question") or "(not set yet)",
            recap=("This exchange ends with the Guide briefly recapping what the room has found so far."
                   if s["exchange"] % CHAPTER_EXCHANGES == CHAPTER_EXCHANGES - 1 else ""))
    data = _call(prompt)
    lines = []
    for item in data.get("lines", [])[:5]:
        if not isinstance(item, dict):
            continue
        persona = item.get("persona") if item.get("persona") in CAST else "guide"
        text = " ".join(str(item.get("text", "")).split())[:200]
        if text:
            lines.append({"text": text, "tone": TONES[persona], "who": CAST[persona][0], "persona": persona})
    if not lines:
        raise RuntimeError("journey: no lines")
    thread = " ".join(str(data.get("thread") or "").split())[:120]
    with _lock:
        s = _today()
        s["exchange"] += 1
        s["recent"] = (s["recent"] + [f"{l['persona']}: {l['text']}" for l in lines])[-RECENT_LINES:]
        if thread:
            s["threads"] = (s["threads"] + [thread])[-MAX_THREADS:]
        s["last_thread"] = bool(thread)
        if data.get("question"):
            s["question"] = " ".join(str(data["question"]).split())[:90]
        if data.get("summary"):
            s["summary"] = " ".join(str(data["summary"]).split())[:600]
        sys.stderr.write(f"rabble: journey chapter {s['exchange'] // CHAPTER_EXCHANGES + 1}, "
                         f"exchange {s['exchange']}{' + thread' if thread else ''}\n")
        return {"lines": lines, "thread": thread, "theme": s["theme"], "goal": s["goal"],
                "question": s.get("question", "")}
