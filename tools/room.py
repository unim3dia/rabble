"""One shared pile: who is in it, and everything that happens in it.

Every phone runs its own physics; what they share is a stream of events:
  arrive  {player}                 a real person dropped into the pile
  leave   {id}                     they left (or their phone went quiet)
  say     {id, you, youTone, replies}   a real person said something (via the AI)
  chat    {lines}                  the pile's own conversation, the same for everyone

Phones long-poll GET /api/events?since=N and get every event after N (or a
snapshot of who's here when they first connect). The pile's conversation is
driven here, once for everyone, so the AI cost doesn't grow with the crowd.

Players get a secret token when they join; only its holder can speak or leave
as them. Selfie figures are kept in memory only, and dropped when they leave.
"""
import secrets
import sys
import threading
import time

import chat

MAX_PLAYERS = 60           # beyond this, people can still watch the pile
KEEP_EVENTS = 300
POLL_WAIT_S = 25           # how long a long-poll waits for something to happen
QUIET_AFTER_S = 45         # no poll for this long: the phone is gone
CHAT_GAP_S = (5, 10)       # quiet between the pile's conversations
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


def _emit(kind, **data):
    global _seq
    _seq += 1
    _events.append({"seq": _seq, "type": kind, **data})
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


def figure(fid):
    with _lock:
        return _figures.get(fid)


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
        _emit("arrive", player=_public(p))
        return {"id": pid, "token": p["token"]}


def _by_token(token):
    for p in _players.values():
        if secrets.compare_digest(p["token"], str(token or "")):
            return p
    return None


def leave(token):
    with _lock:
        p = _by_token(token)
        if p:
            _drop(p)


def _drop(p):
    _players.pop(p["id"], None)
    if p["figure"]:
        _figures.pop(p["figure"], None)
        _claimed.discard(p["figure"])
    _emit("leave", id=p["id"])


def say(token, text):
    """A real person speaks: the AI says it for them, everyone sees it."""
    global _busy_until
    with _lock:
        p = _by_token(token)
        if not p:
            raise PermissionError("join the pile first")
        if chat.too_soon(p["id"]):
            raise ValueError("breathe for a moment first")
    if not SAY_LIMIT.acquire(timeout=30):
        raise TimeoutError("the pile is busy, try again in a moment")
    try:
        out = chat.speak(text)
    finally:
        SAY_LIMIT.release()
    with _lock:
        _busy_until = max(_busy_until, time.time()) + (len(out["replies"]) + 1) * LINE_S + READ_S
        _emit("say", id=p["id"], **out)
    return out


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
            return {"seq": _seq, "players": [_public(q) for q in _players.values()], "events": []}
        while _seq <= since and time.time() < deadline:
            _lock.wait(timeout=max(0.1, deadline - time.time()))
        return {"seq": _seq, "events": [e for e in _events if e["seq"] > since]}


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
            item = chat.ready_opener()
        except Exception as e:  # API failure; no key material in the message
            sys.stderr.write(f"rabble: pile chat failed: {type(e).__name__}\n")
            time.sleep(10)
            continue
        with _lock:
            if time.time() < _busy_until:     # someone spoke while we waited: keep it for later
                chat._stock.insert(0, item)
                continue
            _busy_until = time.time() + len(item["lines"]) * LINE_S + READ_S + random.uniform(*CHAT_GAP_S)
            _emit("chat", lines=item["lines"])


def start():
    threading.Thread(target=_conversations, daemon=True).start()
