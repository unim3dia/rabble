"""One shared pile: who is in it, and everything that happens in it.

Each visitor's pile is their own. Phones long-poll a stream of events; only
the pile's own conversation is shared, everything else reaches one visitor:
  arrive  {player}                 you dropped into the pile          (yours only)
  leave   {id}                     the pile let you go (phone quiet)   (yours only)
  reply   {to, sid, text, tone, who, gesture}   a clay person answered you (yours only)
  missed  {to, sid}                the answer didn't come; try again   (yours only)
  chat    {lines}                  the pile's own conversation, the same for everyone

What you say comes back to you in the reply to POST /api/say; no one else sees
it. Everyone gets the same question each day (app/questions.json).

Phones long-poll GET /api/events?since=N and get every event after N (or a
snapshot of who's here when they first connect). The pile's conversation is
driven here, once for everyone, so the AI cost doesn't grow with the crowd.

Players get a secret token when they join; only its holder can speak or leave
as them. Selfie figures are kept in memory only, and dropped when they leave.
"""
import json
import os
import secrets
import sys
import threading
import time

import chat
import journey

MAX_PLAYERS = 60           # beyond this, people can still watch the pile
KEEP_EVENTS = 300
POLL_WAIT_S = 25           # how long a long-poll waits for something to happen
QUIET_AFTER_S = 45         # no poll for this long: the phone is gone
CHAT_GAP_S = (12, 25)      # a breath between the Journey's exchanges
ALONE_S = 5                # a companion answers after this
SAYS_KEPT = 50
LINE_S, READ_S = 3.6, 7    # how long a conversation takes to play (matches the app)
SAY_LIMIT = threading.BoundedSemaphore(6)   # AI calls for players at once

_lock = threading.Condition()
_events = []               # [{"seq": n, "type": ..., ...}]
_seq = 0
_players = {}              # id -> {"id", "token", "figure", "seen", "joined"}
_figures = {}              # figure id -> png bytes (selfies)
_claimed = set()           # figure ids someone has joined as (each can be used once)
_viewers = {}              # viewer key -> last poll time (people watching, joined or not)
_busy_until = 0.0          # the pile is mid-conversation (or someone's speaking) until then
_says = {}                 # sid -> {"id", "text", "answered"}: recent things people said
_talks = {}                # player id -> their last few lines with the companions, for continuity
_latest = {}               # player id -> their newest message (sid): the thread that's live
TALK_KEPT = 14

QUESTIONS = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                        "app", "questions.json"), encoding="utf-8"))


def question():
    """Today's question, the same for everyone (and for the server-free page)."""
    return QUESTIONS[int(time.time() // 86400) % len(QUESTIONS)]


def _emit(kind, only=None, **data):
    """Add an event; `only` (a player id) keeps it to that one visitor."""
    global _seq
    _seq += 1
    _events.append({"seq": _seq, "type": kind, "only": only, **data})
    del _events[:-KEEP_EVENTS]
    _lock.notify_all()


def _public(p):
    return {"id": p["id"], "figure": p["figure"]}


def add_figure(png):
    """Keep a selfie figure for the pile to show; returns its id."""
    fid = secrets.token_urlsafe(9)
    with _lock:
        _figures[fid] = png
        while len(_figures) > MAX_PLAYERS * 3:
            oldest = next(iter(_figures))
            _figures.pop(oldest)
            _claimed.discard(oldest)
    return fid


def join(figure_id):
    with _lock:
        if len(_players) >= MAX_PLAYERS:
            raise OverflowError("the pile is full right now, but you can watch")
        if not isinstance(figure_id, str) or figure_id not in _figures or figure_id in _claimed:
            figure_id = None       # unknown, or already someone else's: join without it
        if figure_id:
            _claimed.add(figure_id)
        pid = secrets.token_urlsafe(6)
        p = {"id": pid, "token": secrets.token_urlsafe(18), "figure": figure_id,
             "seen": time.time(), "joined": time.time()}
        _players[pid] = p
        _emit("arrive", only=pid, player=_public(p))
        return {"id": pid, "token": p["token"]}


def _by_token(token):
    for p in _players.values():
        if secrets.compare_digest(p["token"], str(token or "")):
            return p
    return None


def is_player(token):
    with _lock:
        return _by_token(token) is not None


def leave(token):
    with _lock:
        p = _by_token(token)
        if p:
            _drop(p)


def _drop(p):
    _players.pop(p["id"], None)
    _talks.pop(p["id"], None)
    _latest.pop(p["id"], None)
    if p["figure"]:
        _figures.pop(p["figure"], None)
        _claimed.discard(p["figure"])
    _emit("leave", only=p["id"], id=p["id"])


def say(token, text):
    """A real person speaks: once it's checked, everyone sees their own words."""
    global _busy_until
    text = chat.tidy(text)
    if not text:
        raise ValueError("say something first")
    with _lock:
        p = _by_token(token)
        if not p:
            raise PermissionError("join the pile first")
        if chat.too_soon(p["id"]):
            raise ValueError("breathe for a moment first")
    if not SAY_LIMIT.acquire(timeout=30):
        raise TimeoutError("the pile is busy, try again in a moment")
    try:
        ok, note = chat.check(text)
    finally:
        SAY_LIMIT.release()
    if not ok:
        raise ValueError(note)
    with _lock:
        sid = secrets.token_urlsafe(6)
        _says[sid] = {"id": p["id"], "text": text, "answered": False}
        _latest[p["id"]] = sid                 # a new message: any older thread winds down
        while len(_says) > SAYS_KEPT:
            _says.pop(next(iter(_says)))
        _busy_until = max(_busy_until, time.time()) + ALONE_S + READ_S
    # Each visitor's pile is their own: start the answer now, and let it land after a breath.
    threading.Thread(target=_companion_answers, args=(sid, time.time() + ALONE_S), daemon=True).start()
    return {"sid": sid, "text": text}


THREAD_GAPS_S = (9, 12)    # the pauses between a thread's rounds


def _companion_answers(sid, not_before=0):
    """Two people of the pile answer a visitor, then (after a pause, and again)
    they talk it over with each other: a little thread around what was said.
    It stops if the visitor leaves or says something new (that starts its own)."""
    with _lock:
        said = _says.get(sid)
        if not said or said["answered"] or said["id"] not in _players:
            return
        said["answered"] = True
        history = list(_talks.get(said["id"], [])) + [f"Visitor: {said['text']}"]
    rounds = len(chat.ROUNDS)
    for round_ in range(rounds):
        if round_:
            time.sleep(THREAD_GAPS_S[round_ - 1])
        with _lock:
            if said["id"] not in _players or _latest.get(said["id"]) != sid:
                return                        # gone, or onto something new
        if not SAY_LIMIT.acquire(timeout=30):
            if not round_:
                with _lock:
                    _emit("missed", only=said["id"], to=said["id"], sid=sid)
            return
        try:
            part = chat.reply_thread(said["text"], question(), history, round_)
        except Exception as e:  # API failure; no key material in the message
            sys.stderr.write(f"rabble: thread failed: {type(e).__name__}\n")
            if not round_:
                with _lock:
                    _emit("missed", only=said["id"], to=said["id"], sid=sid)
            return
        finally:
            SAY_LIMIT.release()
        if not round_:
            time.sleep(max(0, not_before - time.time()))
        history += [f"Person: {l['text']}" for l in part["lines"]]
        with _lock:
            if said["id"] not in _players:
                return
            global _busy_until
            _busy_until = max(_busy_until, time.time()) + len(part["lines"]) * LINE_S + THREAD_GAPS_S[0]
            _talks[said["id"]] = history[-TALK_KEPT:]
            _emit("reply", only=said["id"], to=said["id"], sid=sid, round=round_,
                  lines=part["lines"], gesture=part["gesture"] if not round_ else None)


def events(since, viewer, token=None):
    """Everything after `since`; waits a while if nothing has happened yet."""
    deadline = time.time() + POLL_WAIT_S
    with _lock:
        now = time.time()
        if viewer in _viewers or len(_viewers) < MAX_PLAYERS * 50:
            _viewers[viewer] = now
        p = _by_token(token) if token else None
        if p:
            p["seen"] = now
        if since < 0 or since > _seq or (_events and since < _events[0]["seq"] - 1):
            # New here, too far behind, or from before a server restart:
            # who's in the pile, from now on.
            return {"seq": _seq, "players": [], "events": [], "question": question(), "journey": journey.now()}
        while _seq <= since and time.time() < deadline:
            _lock.wait(timeout=max(0.1, deadline - time.time()))
        me = p["id"] if p else None
        return {"seq": _seq, "events": [{k: v for k, v in e.items() if k != "only"}
                                        for e in _events if e["seq"] > since and e["only"] in (None, me)]}


def counts():
    with _lock:
        return {"players": len(_players), "watching": len(_viewers)}


def _tidy():
    """Drop players whose phones have gone quiet, and forget old viewers."""
    now = time.time()
    with _lock:
        for p in [p for p in _players.values() if now - p["seen"] > QUIET_AFTER_S]:
            _drop(p)
        for v in [v for v, t in _viewers.items() if now - t > QUIET_AFTER_S]:
            _viewers.pop(v)


def _conversations():
    """The pile's own talk: one conversation at a time, for everyone watching."""
    import random
    global _busy_until
    while True:
        time.sleep(1)
        _tidy()
        with _lock:
            idle = not _viewers or time.time() < _busy_until
        if idle:
            continue
        try:
            item = journey.next_exchange()     # the next step of tonight's Journey
        except Exception as e:  # API failure or the hourly cap; no key material in the message
            sys.stderr.write(f"rabble: journey failed: {type(e).__name__}\n")
            time.sleep(20)
            continue
        with _lock:
            _busy_until = max(_busy_until, time.time()) + len(item["lines"]) * LINE_S + READ_S + random.uniform(*CHAT_GAP_S)
            _emit("chat", lines=item["lines"], thread=item["thread"], journey={
                "theme": item["theme"], "goal": item["goal"], "question": item["question"]})


def start():
    threading.Thread(target=_conversations, daemon=True).start()
