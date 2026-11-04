"""An original music bed for the promo, synthesized from scratch: a warm,
slow chord pad, a music-box melody, a soft heartbeat pulse, and a little chime
each time a cutaway card appears. Writes demo/promo/out/music.wav.

  python demo/promo/music.py   (compose.py runs it and mixes it in)
"""
import os
import wave

import numpy as np

DIR = os.path.dirname(os.path.abspath(__file__))
SR = 44100
BPM = 84
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)

# I – vi – IV – V in D major, with sevenths and ninths for warmth (MIDI notes).
CHORDS = [
    [50, 57, 61, 64, 66],   # Dmaj9
    [47, 54, 57, 62, 66],   # Bm7(add11-ish)
    [43, 50, 54, 57, 64],   # Gmaj7(9)
    [45, 52, 55, 61, 64],   # A7sus-ish
]
# The melody, one phrase per two bars: (beat, MIDI note) pairs, plucked.
PHRASES = [
    [(0, 74), (1, 76), (1.5, 78), (2.5, 81), (4, 78), (5, 76), (6, 74), (6.5, 73)],
    [(0, 71), (1, 74), (1.5, 76), (2.5, 78), (4, 79), (5, 78), (5.5, 76), (6.5, 74)],
]


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
    tone = sum(np.sin(2 * np.pi * f * d * t + rng.uniform(0, 6)) for d in (0.997, 1.0, 1.003))
    tone += 0.25 * np.sin(2 * np.pi * 2 * f * t)
    wobble = 1 + 0.08 * np.sin(2 * np.pi * 0.21 * t + rng.uniform(0, 6))
    return tone * wobble * env(len(t), 1.2, 1.6) / 3


def pluck(note, secs=1.6):
    t = np.arange(int(secs * SR)) / SR
    f = hz(note)
    tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 9) \
        + 0.15 * np.sin(2 * np.pi * 4.2 * f * t) * np.exp(-t * 14)
    return tone * np.exp(-t * 3.2) * env(len(t), 0.004, 0.2)


def thump(secs=0.35):
    t = np.arange(int(secs * SR)) / SR
    return np.sin(2 * np.pi * (55 + 40 * np.exp(-t * 30)) * t) * np.exp(-t * 11)


def chime(secs=2.2):
    t = np.arange(int(secs * SR)) / SR
    return sum(a * np.sin(2 * np.pi * hz(m) * t) * np.exp(-t * k)
               for m, a, k in ((86, 0.5, 2.5), (93, 0.3, 3.5), (98, 0.18, 5)))


def place(track, sound, at, gain):
    i = int(at * SR)
    if i >= len(track):
        return
    sound = sound[: len(track) - i]
    track[i:i + len(sound)] += gain * sound


def reverb(x, secs=2.4, mix=0.3):
    n = int(secs * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 3.0)
    ir /= np.sqrt((ir ** 2).sum())
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return (1 - mix) * x + mix * wet


def make(total, card_times):
    n = int(total * SR)
    pads, melody, beat, chimes = (np.zeros(n) for _ in range(4))
    bars = int(np.ceil(total / BAR))
    for b in range(bars):
        start = b * BAR
        for note in CHORDS[b % 4]:
            place(pads, pad(note, BAR + 1.4), start, 0.11)
        if b >= 1:                                    # the heartbeat comes in after the first bar
            for k in range(4):
                place(beat, thump(), start + k * BEAT, 0.5 if k % 2 == 0 else 0.28)
        if b >= 2 and b % 2 == 0 and b < bars - 1:    # the melody from bar 3 to near the end
            for at, note in PHRASES[(b // 2) % 2]:
                place(melody, pluck(note), start + at * BEAT, 0.16)
    for t in card_times:
        place(chimes, chime(), t, 0.12)
    mix = reverb(pads + melody + chimes, mix=0.35) + 0.6 * beat
    mix *= env(n, 1.5, 3.0)                           # fade in, and out under the end card
    mix /= np.abs(mix).max() / 0.8
    return mix


def write(path, mono):
    left = mono
    right = np.concatenate([np.zeros(int(0.012 * SR)), mono[: -int(0.012 * SR)]])   # a little width
    data = (np.stack([left, right], 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


if __name__ == "__main__":
    import sys
    total = float(sys.argv[1]) if len(sys.argv) > 1 else 65
    os.makedirs(os.path.join(DIR, "out"), exist_ok=True)
    write(os.path.join(DIR, "out", "music.wav"), make(total, []))
