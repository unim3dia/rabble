// Soft sounds, all made in the browser with Web Audio: a pillowy thump when
// someone lands, a two-note chime when you join, a whoosh for the close-up, a
// soft tumble when someone rolls out, a boop for a tap, a swish when the ring
// changes, and little human expressions without words (a smile, a chuckle, an
// idea, a cough, a puzzled "hmm", a sigh, an "aww"). Everything quiet and warm.

export function createSfx() {
  const sfx = { on: true, ctx: null };

  sfx.unlock = () => {
    if (sfx.ctx) {
      if (sfx.ctx.state === "suspended") sfx.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) sfx.ctx = new AC();
  };

  const ready = () => sfx.on && sfx.ctx;

  function envelope(gain, now, peak, attack, release) {
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.setTargetAtTime(0, now + attack, release);
  }

  function noise(seconds) {
    const ctx = sfx.ctx;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.02) / 1.02;
      data[i] = brown * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  function tone(freq, { type = "sine", peak = 0.06, attack = 0.02, release = 0.2, at = 0, glide = 1 } = {}) {
    const ctx = sfx.ctx;
    const now = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * glide, now + attack + release * 3);
    envelope(amp, now, peak, attack, release);
    osc.connect(amp).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + attack + release * 6);
  }

  function hush(seconds, { peak = 0.12, from = 300, to = 300, q = 0.8, at = 0 } = {}) {
    const ctx = sfx.ctx;
    const now = ctx.currentTime + at;
    const src = noise(seconds);
    const bp = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(from, now);
    bp.frequency.exponentialRampToValueAtTime(to, now + seconds);
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(peak, now + seconds * 0.4);
    amp.gain.linearRampToValueAtTime(0, now + seconds);
    src.connect(bp).connect(amp).connect(ctx.destination);
    src.start(now);
    src.stop(now + seconds);
  }

  sfx.thump = () => {
    if (!ready()) return;
    tone(92, { peak: 0.14, attack: 0.008, release: 0.09, glide: 0.6 });
    hush(0.18, { peak: 0.08, from: 260, to: 120 });
  };

  sfx.chime = () => {
    if (!ready()) return;
    tone(523.25, { peak: 0.045, attack: 0.01, release: 0.5 });
    tone(783.99, { peak: 0.035, attack: 0.01, release: 0.7, at: 0.16 });
  };

  sfx.whoosh = (inward = true) => {
    if (!ready()) return;
    hush(0.7, { peak: 0.1, from: inward ? 220 : 1400, to: inward ? 1400 : 220, q: 1.4 });
  };

  sfx.tumble = () => {
    if (!ready()) return;
    for (let i = 0; i < 4; i++) {
      tone(110 - i * 8, { peak: 0.06 - i * 0.012, attack: 0.006, release: 0.06, at: i * 0.22, glide: 0.7 });
    }
  };

  sfx.boop = () => {
    if (!ready()) return;
    tone(420 + Math.random() * 120, { peak: 0.05, attack: 0.005, release: 0.07, glide: 1.25 });
  };

  // Tapping people plays music: everyone holds one of three notes that sound
  // good together (G, B, D), in the same soft "boop" voice.
  const NOTES = [392.0, 493.88, 587.33];
  sfx.note = (slug) => {
    if (!ready()) return;
    let h = 0;
    for (const c of slug) h = (h * 31 + c.charCodeAt(0)) % 9973;
    tone(NOTES[h % NOTES.length], { peak: 0.06, attack: 0.005, release: 0.12, glide: 1.12 });
  };

  // Someone new lands in the pile: a soft plop.
  sfx.arrive = () => {
    if (!ready()) return;
    tone(330, { peak: 0.05, attack: 0.004, release: 0.07, glide: 0.55 });
    hush(0.12, { peak: 0.04, from: 500, to: 200 });
  };

  // The ring button: a little wheel of chance that slows down, then a sparkle.
  sfx.chance = () => {
    if (!ready()) return;
    let at = 0;
    for (let i = 0; i < 11; i++) {
      tone(1700 + (i % 2) * 260, { peak: 0.02, attack: 0.002, release: 0.02, at });
      at += 0.035 + i * i * 0.0024;
    }
    [1046.5, 1318.5, 1568].forEach((f, i) =>
      tone(f, { peak: 0.03, attack: 0.004, release: 0.45, at: at + i * 0.07 }));
  };

  // A soft click for the menu.
  sfx.click = () => {
    if (!ready()) return;
    tone(1250, { peak: 0.035, attack: 0.002, release: 0.025, glide: 0.8 });
  };

  sfx.swish = () => {
    if (!ready()) return;
    hush(0.4, { peak: 0.07, from: 600, to: 2400, q: 2 });
  };

  // A wordless voice: a soft buzzy tone shaped by two vowel resonances, plus a
  // little breath. f0 is a list of pitches it glides through.
  function voice({ f0, dur, formants, peak = 0.05, breath = 0.3, at = 0, pitch = 1 }) {
    const ctx = sfx.ctx;
    const now = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    f0.forEach((f, i) => {
      const when = now + (dur * i) / Math.max(1, f0.length - 1);
      if (i === 0) osc.frequency.setValueAtTime(f * pitch, when);
      else osc.frequency.linearRampToValueAtTime(f * pitch, when);
    });
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(peak, now + Math.min(0.05, dur * 0.25));
    amp.gain.setTargetAtTime(0, now + dur * 0.7, dur * 0.18);
    const air = noise(dur + 0.2);
    const airGain = ctx.createGain();
    airGain.gain.value = breath;
    const mix = ctx.createGain();
    osc.connect(mix);
    air.connect(airGain).connect(mix);
    for (const [freq, q] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = q;
      mix.connect(bp).connect(amp);
    }
    amp.connect(ctx.destination);
    osc.start(now); air.start(now);
    osc.stop(now + dur + 0.5); air.stop(now + dur + 0.2);
  }

  const someone = () => 0.85 + Math.random() * 0.4;   // everyone's voice is a little different

  const EXPRESSIONS = {
    // a closed-mouth "hm!" that lifts, like a smile you can hear
    smile: (p) => voice({ f0: [190, 270], dur: 0.22, formants: [[280, 6], [1100, 8]], peak: 0.06, breath: 0.2, pitch: p }),
    // three soft breathy "heh"s, falling
    chuckle: (p) => [0, 0.13, 0.26].forEach((at, i) =>
      voice({ f0: [250 - i * 15, 230 - i * 15], dur: 0.08, formants: [[650, 5], [1250, 7]], peak: 0.05, breath: 0.6, at, pitch: p })),
    // an "oh!" that rises, then a small bright ding
    idea: (p) => {
      voice({ f0: [190, 330], dur: 0.2, formants: [[520, 6], [880, 7]], peak: 0.055, breath: 0.25, pitch: p });
      tone(1318.5, { peak: 0.025, attack: 0.004, release: 0.35, at: 0.16 });
    },
    // a polite little cough: two dry bursts
    cough: (p) => {
      hush(0.09, { peak: 0.09, from: 700 * p, to: 500 * p, q: 1.2 });
      hush(0.07, { peak: 0.06, from: 650 * p, to: 450 * p, q: 1.2, at: 0.16 });
    },
    // "hmm?": low, wobbling, then asking upward
    hmm: (p) => voice({ f0: [165, 150, 158, 200], dur: 0.6, formants: [[300, 7], [950, 8]], peak: 0.05, breath: 0.15, pitch: p }),
    // a contented sigh, mostly breath, falling
    sigh: (p) => {
      hush(0.8, { peak: 0.06, from: 1100 * p, to: 380 * p, q: 0.9 });
      voice({ f0: [150, 110], dur: 0.7, formants: [[600, 4], [1000, 5]], peak: 0.015, breath: 0.8, pitch: p });
    },
    // "aww": warm and falling
    aww: (p) => voice({ f0: [280, 230, 190], dur: 0.5, formants: [[750, 6], [1150, 7]], peak: 0.05, breath: 0.3, pitch: p }),
  };
  sfx.expressions = Object.keys(EXPRESSIONS);

  sfx.express = (kind) => {
    if (!ready() || !EXPRESSIONS[kind]) return;
    EXPRESSIONS[kind](someone());
  };

  return sfx;
}
