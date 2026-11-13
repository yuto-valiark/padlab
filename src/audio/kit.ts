// The stock kit: 4 banks × 16 pads, every sound synthesized in code (license-free).
import {
  adGain, chain, end, filt, finishBuffer, gain, metal, mtof, noiseSrc, osc, rng, shaper,
} from './dsp';

export type Category = 'kick' | 'snare' | 'hat' | 'perc' | 'bass' | 'keys' | 'fx';

type Render = (c: BaseAudioContext, out: AudioNode) => void;

export interface SoundDef {
  name: string;
  cat: Category;
  dur: number;
  /** Pads in the same choke group cut each other off (open/closed hat, mono 808). */
  choke?: number;
  reverse?: boolean;
  level?: number;
  render: Render;
}

export interface BankDef {
  letter: string;
  name: string;
  sounds: SoundDef[];
}

// ─── Drum voices ────────────────────────────────────────────────────────────

const kick = (o: { f0: number; f1: number; pd: number; decay: number; click: number; drive: number }): Render =>
  (c, out) => {
    const o1 = osc(c, 'sine', o.f0);
    o1.frequency.exponentialRampToValueAtTime(o.f1, o.pd);
    chain(o1, adGain(c, 0.002, 1, o.decay), shaper(c, o.drive), out);
    if (o.click > 0) chain(noiseSrc(c, 7), filt(c, 'highpass', 2500), adGain(c, 0.0005, o.click, 0.012), out);
  };

const e808 = (m: number, decay = 1.6, drive = 3): Render => (c, out) => {
  const f = mtof(m);
  const o = osc(c, 'sine', f * 2.2);
  o.frequency.exponentialRampToValueAtTime(f, 0.045);
  chain(o, adGain(c, 0.003, 1, decay), shaper(c, drive), filt(c, 'lowpass', 2200), out);
};

const snare = (o: { tone: number; toneDecay: number; noiseDecay: number; hp: number; noise: number }): Render =>
  (c, out) => {
    const t1 = osc(c, 'triangle', o.tone * 1.3);
    t1.frequency.exponentialRampToValueAtTime(o.tone, 0.03);
    chain(t1, adGain(c, 0.001, 0.9, o.toneDecay), out);
    chain(osc(c, 'sine', o.tone * 1.85), adGain(c, 0.001, 0.35, o.toneDecay * 0.6), out);
    chain(noiseSrc(c, 3), filt(c, 'highpass', o.hp), filt(c, 'lowpass', 9500), adGain(c, 0.001, o.noise, o.noiseDecay), out);
  };

const clap = (decay = 0.22, f = 1150, seed = 11): Render => (c, out) => {
  const g = c.createGain();
  const bursts = [0, 0.011, 0.023, 0.035];
  bursts.forEach((b, i) => {
    g.gain.setValueAtTime(1, b);
    if (i < bursts.length - 1) g.gain.exponentialRampToValueAtTime(0.12, b + 0.009);
    else g.gain.exponentialRampToValueAtTime(0.0001, b + decay);
  });
  chain(noiseSrc(c, seed), filt(c, 'bandpass', f, 1.3), g, out);
};

const hat = (decay: number, base = 40): Render => (c, out) => {
  chain(metal(c, base), filt(c, 'bandpass', 10000, 0.9), filt(c, 'highpass', 7000), adGain(c, 0.0005, 1, decay), out);
  chain(noiseSrc(c, 5), filt(c, 'highpass', 9000), adGain(c, 0.0005, 0.35, decay * 0.8), out);
};

const tom = (f: number, decay = 0.45): Render => (c, out) => {
  const o = osc(c, 'sine', f * 1.4);
  o.frequency.exponentialRampToValueAtTime(f, 0.03);
  o.frequency.exponentialRampToValueAtTime(f * 0.8, decay);
  chain(o, adGain(c, 0.001, 1, decay), out);
  chain(noiseSrc(c, 9), filt(c, 'lowpass', 2500), adGain(c, 0.001, 0.2, 0.05), out);
};

const conga = (f: number, decay = 0.25): Render => (c, out) => {
  const o = osc(c, 'sine', f * 1.5);
  o.frequency.exponentialRampToValueAtTime(f, 0.012);
  chain(o, adGain(c, 0.0008, 1, decay), out);
  chain(noiseSrc(c, 13), filt(c, 'bandpass', f * 4, 2), adGain(c, 0.0005, 0.3, 0.015), out);
};

const cowbell = (f1 = 540, f2 = 800, decay = 0.35): Render => (c, out) => {
  const sum = gain(c, 0.5);
  osc(c, 'square', f1).connect(sum);
  osc(c, 'square', f2).connect(sum);
  const g = c.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(1, 0.001);
  g.gain.exponentialRampToValueAtTime(0.3, 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, decay);
  chain(sum, filt(c, 'bandpass', (f1 + f2) / 1.6, 1.2), g, out);
};

const shaker: Render = (c, out) => {
  chain(noiseSrc(c, 21), filt(c, 'highpass', 6000), adGain(c, 0.025, 1, 0.09), out);
};

const rim = (f = 1750): Render => (c, out) => {
  const sum = gain(c, 1);
  osc(c, 'triangle', f).connect(sum);
  chain(osc(c, 'square', f * 0.27), gain(c, 0.3), sum);
  chain(sum, filt(c, 'highpass', 500), adGain(c, 0.0005, 0.7, 0.035), out);
};

const snap: Render = (c, out) => {
  chain(noiseSrc(c, 31), filt(c, 'bandpass', 2800, 1.5), adGain(c, 0.0005, 1.1, 0.07), out);
  chain(osc(c, 'sine', 1900), adGain(c, 0.0005, 0.3, 0.02), out);
};

const ride: Render = (c, out) => {
  chain(metal(c, 75), filt(c, 'bandpass', 7500, 0.6), filt(c, 'highpass', 5000), adGain(c, 0.001, 0.35, 1.4), out);
  chain(osc(c, 'sine', 3150), adGain(c, 0.001, 0.08, 0.9), out);
  chain(osc(c, 'sine', 4820), adGain(c, 0.001, 0.05, 0.7), out);
};

const crash = (decay = 2.0): Render => (c, out) => {
  chain(metal(c, 60), filt(c, 'highpass', 4500), adGain(c, 0.002, 0.5, decay), out);
  chain(noiseSrc(c, 41), filt(c, 'highpass', 4500), adGain(c, 0.002, 0.6, decay * 0.9), out);
};

const tamb: Render = (c, out) => {
  const g = c.createGain();
  [0, 0.012, 0.025].forEach((b, i, a) => {
    g.gain.setValueAtTime(1, b);
    g.gain.exponentialRampToValueAtTime(i < a.length - 1 ? 0.2 : 0.0001, b + (i < a.length - 1 ? 0.01 : 0.18));
  });
  const sum = gain(c, 1);
  chain(noiseSrc(c, 51), filt(c, 'highpass', 8000), sum);
  chain(metal(c, 110), filt(c, 'bandpass', 9000, 2), gain(c, 0.6), sum);
  chain(sum, g, out);
};

const woodblock: Render = (c, out) => {
  chain(osc(c, 'sine', 1150), adGain(c, 0.0005, 0.8, 0.06), out);
  chain(osc(c, 'triangle', 2300), adGain(c, 0.0005, 0.3, 0.04), out);
};

const triangleInst: Render = (c, out) => {
  chain(osc(c, 'sine', 2650), adGain(c, 0.002, 0.25, 1.6), out);
  chain(osc(c, 'sine', 2650 * 2.76), adGain(c, 0.002, 0.1, 1.1), out);
};

// ─── Keys (FM electric piano) & bass ────────────────────────────────────────

function epNote(c: BaseAudioContext, out: AudioNode, m: number, t0: number, amp: number, dur: number, pan: number) {
  const f = mtof(m);
  const car = osc(c, 'sine', f, t0, t0 + dur);
  const mod = osc(c, 'sine', f, t0, t0 + dur);
  const mg = c.createGain();
  mg.gain.setValueAtTime(f * 1.8, t0);
  mg.gain.exponentialRampToValueAtTime(f * 0.2, t0 + 1.5);
  mod.connect(mg).connect(car.frequency);
  // A tine at 14× gives the bell-like attack of a tine piano.
  const tine = osc(c, 'sine', f * 14, t0, t0 + dur);
  const tg = c.createGain();
  tg.gain.setValueAtTime(f * 0.9, t0);
  tg.gain.exponentialRampToValueAtTime(0.01, t0 + 0.12);
  tine.connect(tg).connect(car.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(amp, t0 + 0.005);
  g.gain.setTargetAtTime(amp * 0.3, t0 + 0.005, 0.35);
  g.gain.setTargetAtTime(0, t0 + dur - 0.35, 0.08);
  const p = c.createStereoPanner();
  p.pan.value = pan;
  chain(car, g, p, out);
}

const chord = (notes: number[], dur = 2.6): Render => (c, out) => {
  const bus = gain(c, 1);
  chain(bus, filt(c, 'lowpass', 4800), out);
  // A 7ms strum between voices makes the stab feel played, not pasted.
  notes.forEach((m, i) => epNote(c, bus, m, i * 0.007, 0.22, dur, (i / Math.max(1, notes.length - 1) - 0.5) * 0.5));
};

const bass = (m: number, dur = 1.3): Render => (c, out) => {
  const f = mtof(m);
  const sum = gain(c, 1);
  osc(c, 'sine', f).connect(sum);
  chain(osc(c, 'triangle', f * 2), gain(c, 0.25), sum);
  const lp = filt(c, 'lowpass', 2200, 1);
  lp.frequency.exponentialRampToValueAtTime(500, 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(1, 0.004);
  g.gain.setTargetAtTime(0.55, 0.004, 0.25);
  g.gain.setTargetAtTime(0, dur - 0.2, 0.05);
  chain(sum, lp, shaper(c, 1.8), g, out);
};

// ─── FX & textures ──────────────────────────────────────────────────────────

const vinyl: Render = (c, out) => {
  const n = Math.ceil(end(c) * c.sampleRate);
  const b = c.createBuffer(2, n, c.sampleRate);
  const r = rng(77);
  const fade = Math.floor(c.sampleRate * 0.2);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += (r() * 2 - 1 - lp) * 0.08;
      d[i] = lp * 0.15;
    }
    for (let i = 0; i < n; i++) {
      if (r() < 0.00035) {
        const amp = (0.3 + r() * 0.7) * (r() < 0.5 ? -1 : 1);
        const len = 8 + Math.floor(r() * 40);
        for (let k = 0; k < len && i + k < n; k++) d[i + k] += amp * Math.exp(-k / 6) * (r() * 2 - 1);
      }
    }
    for (let i = 0; i < fade; i++) {
      d[i] *= i / fade;
      d[n - 1 - i] *= i / fade;
    }
  }
  const s = c.createBufferSource();
  s.buffer = b;
  s.start(0);
  s.connect(out);
};

const riser: Render = (c, out) => {
  const bp = filt(c, 'bandpass', 200, 3);
  bp.frequency.exponentialRampToValueAtTime(9000, 2.4);
  const g = c.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(0.9, 2.4);
  g.gain.linearRampToValueAtTime(0, 2.5);
  chain(noiseSrc(c, 61), bp, g, out);
  const s = osc(c, 'sawtooth', 110);
  s.frequency.exponentialRampToValueAtTime(880, 2.4);
  chain(s, filt(c, 'lowpass', 3000), gain(c, 0.15), g);
};

const downlifter: Render = (c, out) => {
  const bp = filt(c, 'bandpass', 8000, 2);
  bp.frequency.exponentialRampToValueAtTime(200, 2.0);
  chain(noiseSrc(c, 62), bp, adGain(c, 0.01, 0.9, 2.0), out);
  const s = osc(c, 'sine', 600);
  s.frequency.exponentialRampToValueAtTime(60, 2.0);
  chain(s, adGain(c, 0.01, 0.3, 2.0), out);
};

const laser: Render = (c, out) => {
  const s = osc(c, 'sawtooth', 2800);
  s.frequency.exponentialRampToValueAtTime(90, 0.3);
  chain(s, filt(c, 'lowpass', 3000), adGain(c, 0.001, 0.4, 0.3), out);
};

const subDrop: Render = (c, out) => {
  const s = osc(c, 'sine', 160);
  s.frequency.exponentialRampToValueAtTime(32, 1.6);
  chain(s, adGain(c, 0.003, 0.9, 1.7), shaper(c, 2), out);
};

const impact: Render = (c, out) => {
  kick({ f0: 120, f1: 35, pd: 0.15, decay: 1.2, click: 0.5, drive: 3 })(c, out);
  chain(noiseSrc(c, 63), filt(c, 'lowpass', 1200), adGain(c, 0.002, 0.8, 0.9), out);
  chain(noiseSrc(c, 64), filt(c, 'highpass', 5000), adGain(c, 0.002, 0.25, 1.4), out);
};

const tapeStop: Render = (c, out) => {
  const lp = filt(c, 'lowpass', 2500);
  lp.frequency.setValueAtTime(2500, 0.05);
  lp.frequency.exponentialRampToValueAtTime(200, 0.75);
  const g = c.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(0.3, 0.01);
  g.gain.setValueAtTime(0.3, 0.4);
  g.gain.linearRampToValueAtTime(0, 0.8);
  chain(lp, g, out);
  for (const m of [65, 69, 72]) {
    const s = osc(c, 'sawtooth', mtof(m));
    s.frequency.setValueAtTime(mtof(m), 0.05);
    s.frequency.exponentialRampToValueAtTime(mtof(m) * 0.15, 0.75);
    s.connect(lp);
  }
};

const glitch: Render = (c, out) => {
  const r = rng(91);
  const s = osc(c, 'square', 400);
  const g = c.createGain();
  g.gain.setValueAtTime(0, 0);
  for (let i = 0; i < 12; i++) {
    const t = i * 0.035;
    s.frequency.setValueAtTime(200 + Math.floor(r() * 8) * 180, t);
    g.gain.setValueAtTime(r() < 0.75 ? 0.4 : 0, t);
    g.gain.setValueAtTime(0, t + 0.028);
  }
  chain(s, filt(c, 'lowpass', 4000), g, out);
};

const scratch: Render = (c, out) => {
  const s = osc(c, 'sawtooth', 150);
  const pts: [number, number][] = [[0.08, 700], [0.16, 120], [0.22, 900], [0.32, 100]];
  for (const [t, f] of pts) s.frequency.linearRampToValueAtTime(f, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(0.5, 0.01);
  g.gain.setValueAtTime(0.5, 0.15);
  g.gain.linearRampToValueAtTime(0.1, 0.17);
  g.gain.linearRampToValueAtTime(0.5, 0.2);
  g.gain.linearRampToValueAtTime(0, 0.34);
  const sum = gain(c, 1);
  s.connect(sum);
  chain(noiseSrc(c, 93), gain(c, 0.3), sum);
  chain(sum, filt(c, 'bandpass', 1500, 1), g, out);
};

const brass: Render = (c, out) => {
  const lp = filt(c, 'lowpass', 600, 2);
  lp.frequency.linearRampToValueAtTime(3500, 0.03);
  lp.frequency.exponentialRampToValueAtTime(900, 0.4);
  chain(lp, adGain(c, 0.01, 0.3, 0.45), out);
  for (const m of [65, 69, 72]) for (const cents of [-7, 0, 7]) {
    const s = osc(c, 'sawtooth', mtof(m) * Math.pow(2, cents / 1200));
    chain(s, gain(c, 0.3), lp);
  }
};

const pluck: Render = (c, out) => {
  const lp = filt(c, 'lowpass', 5000, 3);
  lp.frequency.exponentialRampToValueAtTime(400, 0.15);
  chain(lp, adGain(c, 0.001, 0.5, 0.35), out);
  osc(c, 'sawtooth', mtof(72)).connect(lp);
  chain(osc(c, 'square', mtof(84)), gain(c, 0.2), lp);
};

const vox = (f1: number, f2: number): Render => (c, out) => {
  const s = osc(c, 'sawtooth', 196);
  const lfo = osc(c, 'sine', 5.5);
  lfo.connect(gain(c, 3)).connect(s.frequency);
  const sum = gain(c, 1);
  chain(s, filt(c, 'bandpass', f1, 8), sum);
  chain(s, filt(c, 'bandpass', f2, 8), gain(c, 0.7), sum);
  chain(sum, adGain(c, 0.03, 1, 0.5), out);
};

const whiteHit: Render = (c, out) => {
  chain(noiseSrc(c, 99), filt(c, 'highpass', 400), adGain(c, 0.001, 0.6, 0.25), out);
};

// ─── Banks ──────────────────────────────────────────────────────────────────
// Pad order follows MPC convention: index 0 = Pad 1 (bottom-left).

const S = (name: string, cat: Category, dur: number, render: Render, extra: Partial<SoundDef> = {}): SoundDef =>
  ({ name, cat, dur, render, ...extra });

export const BANKS: BankDef[] = [
  {
    letter: 'A',
    name: 'BOOM BAP',
    sounds: [
      S('KICK BOOM', 'kick', 0.7, kick({ f0: 140, f1: 48, pd: 0.07, decay: 0.55, click: 0.35, drive: 2.2 })),
      S('KICK TIGHT', 'kick', 0.4, kick({ f0: 190, f1: 58, pd: 0.035, decay: 0.28, click: 0.6, drive: 3 })),
      S('SNARE FAT', 'snare', 0.45, snare({ tone: 185, toneDecay: 0.14, noiseDecay: 0.24, hp: 1200, noise: 0.9 })),
      S('CLAP', 'snare', 0.4, clap()),
      S('HAT CLOSED', 'hat', 0.15, hat(0.05), { choke: 1 }),
      S('HAT OPEN', 'hat', 0.6, hat(0.42), { choke: 1 }),
      S('SHAKER', 'hat', 0.2, shaker, { level: 0.6 }),
      S('RIM', 'perc', 0.12, rim()),
      S('SNAP', 'snare', 0.15, snap),
      S('TOM LOW', 'perc', 0.6, tom(95)),
      S('TOM MID', 'perc', 0.5, tom(140, 0.38)),
      S('TOM HIGH', 'perc', 0.45, tom(200, 0.32)),
      S('CONGA', 'perc', 0.35, conga(330)),
      S('COWBELL', 'perc', 0.4, cowbell(), { level: 0.7 }),
      S('RIDE', 'hat', 1.6, ride, { level: 0.6 }),
      S('CRASH', 'hat', 2.2, crash(), { level: 0.65 }),
    ],
  },
  {
    letter: 'B',
    name: '808 / TRAP',
    sounds: [
      ...([29, 31, 32, 34, 36, 37, 39, 41] as const).map((m, i) =>
        S(`808 ${['F', 'G', 'A♭', 'B♭', 'C', 'D♭', 'E♭', 'F'][i]}`, 'bass', 1.8, e808(m), { choke: 2 })),
      S('TRAP KICK', 'kick', 0.5, kick({ f0: 220, f1: 50, pd: 0.03, decay: 0.35, click: 0.8, drive: 4 })),
      S('TRAP SNARE', 'snare', 0.35, snare({ tone: 230, toneDecay: 0.08, noiseDecay: 0.17, hp: 2200, noise: 1 })),
      S('CLAP STACK', 'snare', 0.45, clap(0.28, 1400, 17)),
      S('RIM TRAP', 'perc', 0.1, rim(2100)),
      S('HAT TICK', 'hat', 0.1, hat(0.03, 46), { choke: 3 }),
      S('HAT OPEN', 'hat', 0.5, hat(0.3, 46), { choke: 3 }),
      S('NOISE HIT', 'fx', 0.3, whiteHit),
      S('BELL 808', 'perc', 0.5, cowbell(587, 845, 0.45), { level: 0.7 }),
    ],
  },
  {
    letter: 'C',
    name: 'KEYS · F MAJOR',
    sounds: [
      S('Fmaj9', 'keys', 2.6, chord([53, 57, 60, 64, 67]), { choke: 5 }),
      S('Gm9', 'keys', 2.6, chord([55, 58, 62, 65, 69]), { choke: 5 }),
      S('Am7', 'keys', 2.6, chord([57, 60, 64, 67]), { choke: 5 }),
      S('B♭maj9', 'keys', 2.6, chord([46, 57, 60, 62, 65]), { choke: 5 }),
      S('C9sus', 'keys', 2.6, chord([48, 58, 62, 65, 67]), { choke: 5 }),
      S('Dm9', 'keys', 2.6, chord([50, 53, 57, 60, 64]), { choke: 5 }),
      S('D♭maj7', 'keys', 2.6, chord([49, 53, 56, 60, 63]), { choke: 5 }),
      S('E7♭9', 'keys', 2.6, chord([52, 56, 62, 65]), { choke: 5 }),
      ...([41, 43, 45, 46, 48, 50, 52, 53] as const).map((m, i) =>
        S(`BASS ${['F', 'G', 'A', 'B♭', 'C', 'D', 'E', 'F'][i]}`, 'bass', 1.3, bass(m), { choke: 4 })),
    ],
  },
  {
    letter: 'D',
    name: 'FX · TEXTURE',
    sounds: [
      S('VINYL', 'fx', 3, vinyl, { level: 0.45 }),
      S('RISER', 'fx', 2.5, riser),
      S('DOWNLIFTER', 'fx', 2.1, downlifter),
      S('REV CYM', 'fx', 2.2, crash(2.0), { reverse: true, level: 0.6 }),
      S('LASER', 'fx', 0.35, laser),
      S('SUB DROP', 'fx', 1.8, subDrop),
      S('IMPACT', 'fx', 1.6, impact),
      S('TAPE STOP', 'fx', 0.85, tapeStop),
      S('GLITCH', 'fx', 0.45, glitch, { level: 0.6 }),
      S('SCRATCH', 'fx', 0.36, scratch),
      S('BRASS STAB', 'keys', 0.5, brass),
      S('PLUCK', 'keys', 0.4, pluck),
      S('VOX OH', 'fx', 0.6, vox(450, 800)),
      S('TAMBOURINE', 'perc', 0.25, tamb, { level: 0.7 }),
      S('WOODBLOCK', 'perc', 0.1, woodblock),
      S('TRIANGLE', 'perc', 1.7, triangleInst, { level: 0.5 }),
    ],
  },
];

export const SOUNDS: SoundDef[] = BANKS.flatMap((b) => b.sounds);

export const CAT_COLOR: Record<Category, string> = {
  kick: '#ff8a2a',
  snare: '#ff5a4e',
  hat: '#f4e3b8',
  perc: '#4fe3d1',
  bass: '#ff4f8b',
  keys: '#7fa8ff',
  fx: '#b8ff4a',
};

/** Render all 64 sounds. Runs in small parallel batches so the boot screen can show progress. */
export async function renderKit(sampleRate: number, onProgress?: (done: number, total: number) => void) {
  const out: AudioBuffer[] = new Array(SOUNDS.length);
  let done = 0;
  const BATCH = 8;
  for (let i = 0; i < SOUNDS.length; i += BATCH) {
    await Promise.all(
      SOUNDS.slice(i, i + BATCH).map(async (d, j) => {
        const c = new OfflineAudioContext(2, Math.ceil(d.dur * sampleRate), sampleRate);
        d.render(c, c.destination);
        const buf = await c.startRendering();
        out[i + j] = finishBuffer(buf, d.level ?? 0.9, d.reverse);
        onProgress?.(++done, SOUNDS.length);
      }),
    );
  }
  return out;
}
