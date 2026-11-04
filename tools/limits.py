"""Limits that keep a public Rabble server from running up the Meta bill.

Each visitor (by address) gets a few tries per window, and the whole server
gets a daily budget for each kind of AI call, whatever the addresses say.
In memory only; a restart starts fresh.
"""
import threading
import time

# kind -> (tries per visitor, window in seconds, tries per day for everyone)
RULES = {
    "selfie": (4, 3600, 150),       # each is a few Muse Image + SAM calls
    "say": (12, 300, 1500),         # Muse Spark replies
    "join": (20, 600, 5000),        # no AI cost, but each join is a fresh name to speak as
    "ack": (40, 300, 50000),        # squeezes: no AI cost, just keep them from flooding
}
DAY_S = 24 * 3600

_lock = threading.Lock()
_recent = {}               # (kind, visitor) -> [times]
_daily = {}                # kind -> (day number, count)


def allow(kind, visitor):
    """True if this visitor may do this now; counts the try if so."""
    per_visitor, window, per_day = RULES[kind]
    now = time.time()
    day = int(now // DAY_S)
    with _lock:
        today, used = _daily.get(kind, (day, 0))
        if today != day:
            used = 0
        if used >= per_day:
            return False
        key = (kind, visitor)
        times = [t for t in _recent.get(key, []) if now - t < window]
        if len(times) >= per_visitor:
            _recent[key] = times
            return False
        _recent[key] = times + [now]
        _daily[kind] = (day, used + 1)
        if len(_recent) > 20000:                 # forget visitors who've gone quiet
            for k in [k for k, v in _recent.items() if not v or now - v[-1] > DAY_S]:
                _recent.pop(k)
        return True
