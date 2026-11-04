"""An original music bed for the promo, synthesized from scratch: light and
welcoming. A soft, airy pad in G major, a marimba-ish melody, a gentle shaker,
and a little chime each time a cutaway card appears. It sits under the app's
own sound effects. Writes demo/promo/out/music.wav when run on its own.

  python demo/promo/music.py [seconds]   (compose.py runs it and mixes it in)
"""
import os
import wave

import numpy as np

SR = 44100
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(11)

# I – V – vi – IV in G major, voiced high and open so it stays light (MIDI notes).
CHORDS = [
    [55, 62, 67, 71, 74],   # G(add9-ish)
    [50, 57, 62, 66, 69],   # D
    [52, 59, 64, 67, 71],   # Em7
    [48, 55, 60, 64, 67],   # Cmaj
]
# Bouncy little phrases, two bars each: (beat, MIDI note).
PHRASES = [
    [(0, 79), (0.5, 81), (1, 83), (2, 86), (3, 83), (4, 81), (4.5, 83), (5, 81), (6, 78), (7, 79)],
    [(0, 76), (0.5, 79), (1, 83), (2, 81), (3, 79), (4, 76), (5, 79), (5.5, 81), (6, 79)],
    [(0, 79), (1, 83), (1.5, 86), (2, 88), (3, 86), (4, 83), (5, 81), (6, 83), (6.5, 81), (7, 79)],
    [(0, 76), (1, 79), (2, 83), (3, 81), (4, 79), (4.5, 81), (5, 79), (6, 74)],
]
ARP = [0, 2, 3, 4, 3, 2, 1, 2]       # which chord tone, eighth by eighth


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def env(n, attack, release):
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    e[:a] = np.linspace(0, 1, a)
    e[n - r:] *= np.linspace(1, 0, r)
    return e


def pad(note, secs):
    t = np.arange(int(secs * SR)) / SR
    f = hz(note)
    tone = sum(np.sin(2 * np.pi * f * d * t + rng.uniform(0, 6)) for d in (0.996, 1.0, 1.004))
    return tone * env(len(t), 0.9, 1.4) / 3


def marimba(note, secs=1.0):
    t = np.arange(int(secs * SR)) / SR
    f = hz(note)
    tone = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 30) \
        + 0.12 * np.sin(2 * np.pi * 10 * f * t) * np.exp(-t * 60)
    return tone * np.exp(-t * 5.5) * env(len(t), 0.003, 0.1)


def shaker(secs=0.12):
    n = int(secs * SR)
    x = rng.standard_normal(n)
    x = x - np.concatenate([[0], x[:-1]])           # tilt toward the highs
    return x * np.exp(-np.arange(n) / SR * 40) * 0.5


def chime(secs=2.0):
    t = np.arange(int(secs * SR)) / SR
    return sum(a * np.sin(2 * np.pi * hz(m) * t) * np.exp(-t * k)
               for m, a, k in ((91, 0.5, 2.8), (98, 0.3, 3.8), (103, 0.15, 5)))


def place(track, sound, at, gain):
    i = int(at * SR)
    if i >= len(track):
        return
    sound = sound[: len(track) - i]
    track[i:i + len(sound)] += gain * sound


def reverb(x, secs=1.8, mix=0.3):
    n = int(secs * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.5)
    ir /= np.sqrt((ir ** 2).sum())
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return (1 - mix) * x + mix * wet


def make(total, card_times):
    n = int(total * SR)
    pads, keys, perc, chimes = (np.zeros(n) for _ in range(4))
    bars = int(np.ceil(total / BAR))
    for b in range(bars):
        start = b * BAR
        chord = CHORDS[b % 4]
        for note in chord:
            place(pads, pad(note, BAR + 1.0), start, 0.05)
        for k, tone in enumerate(ARP):                         # a soft arpeggio under everything
            place(keys, marimba(chord[tone] + 12, 0.7), start + k * BEAT / 2, 0.05)
        if b >= 2:
            for k in range(8):
                place(perc, shaker(), start + k * BEAT / 2 + 0.01, 0.05 if k % 2 else 0.03)
        if b >= 2 and b % 2 == 0 and b < bars - 1:            # the tune, from the third bar
            for at, note in PHRASES[(b // 2) % 4]:
                place(keys, marimba(note), start + at * BEAT, 0.11)
    for t in card_times:
        place(chimes, chime(), t, 0.10)
    mix = reverb(pads + keys + chimes, mix=0.28) + perc
    mix *= env(n, 1.2, 3.5)                                    # fade in, and out under the end card
    return mix / (np.abs(mix).max() / 0.8)


def read(path):
    with wave.open(path) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32767
        return data.reshape(-1, w.getnchannels())


def write(path, stereo):
    if stereo.ndim == 1:
        d = int(0.012 * SR)                                   # a little width
        stereo = np.stack([stereo, np.concatenate([np.zeros(d), stereo[:-d]])], 1)
    data = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


if __name__ == "__main__":
    import sys
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
    os.makedirs(out, exist_ok=True)
    write(os.path.join(out, "music.wav"), make(float(sys.argv[1]) if len(sys.argv) > 1 else 90, []))
