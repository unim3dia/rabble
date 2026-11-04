"""Scores for the short commercials, synthesized from scratch at 100 BPM so
every cut can land on a bar (2.4 s) or a half bar. A plan says how full the
music is in each half bar:

  0  quiet: a few marimba notes
  1  building: soft bass and shaker come in
  2  rising: as 1, plus a noise riser into the next half bar
  3  full: kick, claps, bass and the hook
  4  button: one warm chord that rings out
  -  silence (a breath before a hit)

Uses music.py's instruments.
"""
import numpy as np

import music
from music import SR, chime, env, hz, marimba, pad, place, reverb, shaker

BPM = 100
BEAT = 60 / BPM
HALF = 2 * BEAT                      # a half bar
rng = np.random.default_rng(5)

# I – vi – IV – V in C, one chord per bar.
CHORDS = [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62]]
HOOK = [(0, 76), (0.5, 79), (1, 84), (1.5, 83), (2, 79), (3, 76), (3.5, 74)]   # one bar, in beats


def kick(secs=0.4):
    t = np.arange(int(secs * SR)) / SR
    return np.sin(2 * np.pi * (48 + 90 * np.exp(-t * 35)) * t) * np.exp(-t * 9)


def clap(secs=0.25):
    n = int(secs * SR)
    x = rng.standard_normal(n)
    x = x - np.concatenate([[0], x[:-1]])
    e = np.zeros(n)
    for k, d in enumerate((0, 0.011, 0.022)):            # a few hands, not quite together
        i = int(d * SR)
        e[i:] += np.exp(-np.arange(n - i) / SR * (60 if k < 2 else 18))
    return x * e * 0.35


def bass(note, secs):
    t = np.arange(int(secs * SR)) / SR
    f = hz(note)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * np.exp(-t * 2.2) * env(len(t), 0.005, 0.08)


def riser(secs):
    n = int(secs * SR)
    x = rng.standard_normal(n)
    x = x - np.concatenate([[0], x[:-1]])
    return x * np.linspace(0, 1, n) ** 2 * 0.25


def make(plan):
    """plan: one level per half bar (see above). Returns a mono track."""
    total = len(plan) * HALF + 3.0
    n = int(total * SR)
    tonal, drums = np.zeros(n), np.zeros(n)
    for h, level in enumerate(plan):
        start = h * HALF
        chord = CHORDS[(h // 2) % 4]
        if level == "-":
            continue
        if level == 4:
            for note in chord + [chord[-1] + 12]:
                place(tonal, pad(note, 3.0), start, 0.09)
                place(tonal, marimba(note + 12, 1.6), start, 0.06)
            place(tonal, chime(), start, 0.12)
            continue
        # marimba: a sparse pick on quiet halves, the arpeggio otherwise
        for k in range(4):
            if level == 0 and k % 2:
                continue
            place(tonal, marimba(chord[(k + h) % 5] + 12, 0.8), start + k * BEAT / 2, 0.07)
        if level >= 1:
            place(drums, bass(chord[0] - 12, BEAT * 1.9), start, 0.35)
            for k in range(4):
                place(drums, shaker(), start + k * BEAT / 2 + 0.01, 0.05 if k % 2 else 0.03)
        if level == 2:
            place(drums, riser(HALF), start, 0.6)
        if level == 3:
            for k in range(2):
                place(drums, kick(), start + k * BEAT, 0.7)
            place(drums, clap(), start + BEAT, 0.6)
            place(tonal, pad(chord[2] + 12, HALF + 0.6), start, 0.04)
            if h % 2 == 0:
                for at, note in HOOK:
                    place(tonal, marimba(note, 1.0), start + at * BEAT, 0.12)
    mix = reverb(tonal, mix=0.25) + drums
    mix *= env(n, 0.02, 2.5)
    return mix / (np.abs(mix).max() / 0.85)


def stereo(mono):
    d = int(0.012 * SR)
    return np.stack([mono, np.concatenate([np.zeros(d), mono[:-d]])], 1)


__all__ = ["make", "stereo", "HALF", "music"]
