"""The 3-minute demo's score: chill, funky, sparse. 92 BPM, swung sixteenths,
an A minor vamp (Am7 → D9) that lifts to C major at the very end. Mostly
bass and air; parts come in and drop out bar by bar. A plan gives each bar
a level:

  0    silence
  "r"  rest: one soft electric-piano chord held, nothing else
  1    bass and kick
  2    + rimshot on 2 and 4, an electric-piano chord now and then
  3    + swung hi-hat and short guitar chords on the offbeats (the full groove)
  4    the ending: one warm C major chord that rings out

Synthesized from scratch (no samples). make(plan) returns a stereo track.
"""
import numpy as np

from music import SR, env, hz, place, reverb

BPM = 92
BEAT = 60 / BPM
BAR = 4 * BEAT
STEP = BEAT / 4
SWING = 0.18                       # every other sixteenth, a little late
rng = np.random.default_rng(23)

CHORDS = [  # (bass root, guitar voicing, electric-piano voicing)
    (45, [57, 60, 64, 67], [57, 60, 64, 67, 71]),      # Am7(9)
    (50, [54, 57, 60, 64], [54, 57, 60, 64, 66]),      # D9
]
END = (48, [55, 59, 64, 67], [48, 55, 59, 62, 64, 67, 71])   # Cmaj9
# The bass: (sixteenth, semitones above the root, length in sixteenths, loudness).
BASS = [(0, 0, 3, 1.0), (3, 0, 1, 0.55), (6, 12, 1, 0.5), (7, 3, 2, 0.7), (10, 5, 2, 0.75), (14, 7, 1, 0.5)]
KICK_STEPS = [0, 10]
RIM_STEPS = [4, 12]
CHANK_STEPS = [6, 14]


def at(bar, step):
    return bar * BAR + step * STEP + (SWING * STEP if step % 2 else 0)


def t(secs):
    return np.arange(int(secs * SR)) / SR


def kick():
    x = t(0.35)
    return np.sin(2 * np.pi * (45 + 75 * np.exp(-x * 30)) * x) * np.exp(-x * 11)


def rim():
    x = t(0.06)
    click = np.sin(2 * np.pi * 1750 * x) * np.exp(-x * 90)
    noise = np.diff(rng.standard_normal(len(x) + 1)) * np.exp(-x * 140) * 0.25
    return click + noise


def hat(open_=False):
    x = t(0.14 if open_ else 0.04)
    n = np.diff(np.diff(rng.standard_normal(len(x) + 2)))
    return n * np.exp(-x * (25 if open_ else 110)) * 0.18


def bass(note, secs):
    x = t(secs)
    f = hz(note)
    tone = np.sin(2 * np.pi * f * x) + 0.3 * np.sin(2 * np.pi * 2 * f * x) + 0.08 * np.sin(2 * np.pi * 3 * f * x)
    muted = tone * np.exp(-x * 5.5) * env(len(x), 0.004, 0.03)       # round, short, palm-muted
    return np.tanh(1.6 * muted) / 1.2


def pluck(note, secs=0.13):
    """One guitar string (Karplus-Strong), damped quickly: a "chank"."""
    n, period = int(secs * SR), int(SR / hz(note))
    buf = rng.uniform(-1, 1, period)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % period]
        buf[i % period] = 0.5 * (buf[i % period] + buf[(i + 1) % period]) * 0.985
    return out * env(n, 0.002, 0.04)


def chank(voicing):
    s = sum(np.concatenate([np.zeros(int(k * 0.006 * SR)), pluck(nt)])[: int(0.13 * SR)] for k, nt in enumerate(voicing))
    return np.diff(np.concatenate([[0], s])) * 3        # thinner, like a clean single-coil


def keys(voicing, secs):
    """Electric piano: a soft sine with a little bell on the attack, and tremolo."""
    x = t(secs)
    out = np.zeros(len(x))
    for nt in voicing:
        f = hz(nt)
        out += (np.sin(2 * np.pi * f * x) + 0.2 * np.sin(2 * np.pi * 2 * f * x)) * np.exp(-x * 0.9)
        out += 0.12 * np.sin(2 * np.pi * 14 * f * x) * np.exp(-x * 18)
    return out * (1 + 0.12 * np.sin(2 * np.pi * 4.5 * x)) * env(len(x), 0.005, 0.6) / len(voicing)


def make(plan):
    """plan: one level per bar (see above). Returns stereo (n, 2)."""
    total = len(plan) * BAR + 4.0
    n = int(total * SR)
    tracks = {k: np.zeros(n) for k in ("kick", "rim", "hat", "bass", "gtr", "keys")}
    for b, level in enumerate(plan):
        if level == 0:
            continue
        if level == 4:
            root, gtr, ep = END
            place(tracks["keys"], keys(ep, 4.0), at(b, 0), 0.9)
            place(tracks["bass"], bass(root - 12, 1.2), at(b, 0), 0.9)
            place(tracks["kick"], kick(), at(b, 0), 0.6)
            continue
        root, gtr, ep = CHORDS[b % 2]
        if level == "r":
            if b % 2 == 0:
                place(tracks["keys"], keys(ep[:3], 2 * BAR), at(b, 0), 0.6)
            continue
        for step, up, length, vel in BASS:
            place(tracks["bass"], bass(root - 12 + up, length * STEP * 0.9), at(b, step), 0.8 * vel)
        for step in KICK_STEPS:
            place(tracks["kick"], kick(), at(b, step), 0.9)
        if level >= 2:
            for step in RIM_STEPS:
                place(tracks["rim"], rim(), at(b, step), 0.45)
            if b % 2 == 0:
                place(tracks["keys"], keys(ep, 1.6 * BAR), at(b, 0), 0.55)
        if level >= 3:
            for step in range(0, 16, 2):
                place(tracks["hat"], hat(step == 14), at(b, step), 1.0 if step % 4 else 0.6)
            for step in (5, 13):
                place(tracks["hat"], hat(), at(b, step), 0.35)                 # ghost notes
            for step in CHANK_STEPS:
                place(tracks["gtr"], chank(gtr), at(b, step), 0.35)
    tracks["keys"] = reverb(tracks["keys"], secs=2.2, mix=0.3)
    tracks["gtr"] = reverb(tracks["gtr"], secs=1.2, mix=0.2)
    pans = {"kick": 0, "rim": 0.15, "hat": 0.35, "bass": 0, "gtr": -0.35, "keys": 0.1}
    left = sum(tr * (1 - max(0, pans[k])) for k, tr in tracks.items())
    right = sum(tr * (1 + min(0, pans[k])) for k, tr in tracks.items())
    mix = np.stack([left, right], 1)
    return mix / (np.abs(mix).max() / 0.85)
