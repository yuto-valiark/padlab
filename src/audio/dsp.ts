// Small building blocks for rendering sounds inside an OfflineAudioContext.
// Every sound in the stock kit is synthesized from these — no third-party samples.

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Deterministic PRNG (mulberry32) so the kit renders identically every time. */
export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Length of the offline render in seconds. */
export const end = (c: BaseAudioContext) => (c as OfflineAudioContext).length / c.sampleRate;

export function osc(c: BaseAudioContext, type: OscillatorType, f: number, start = 0, stop = end(c)) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, start);
  o.start(start);
  o.stop(stop);
  return o;
}

export function noiseSrc(c: BaseAudioContext, seed = 1, start = 0) {
  const n = Math.max(1, Math.ceil(end(c) * c.sampleRate));
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  const r = rng(seed);
  for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = b;
  s.start(start);
  return s;
}

export function gain(c: BaseAudioContext, v: number) {
  const g = c.createGain();
  g.gain.value = v;
  return g;
}

/** Attack (linear) → exponential decay envelope. */
export function adGain(c: BaseAudioContext, a: number, peak: number, d: number, t0 = 0) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + Math.max(a, 0.0002));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  return g;
}

export function filt(c: BaseAudioContext, type: BiquadFilterType, f: number, Q = 0.707) {
  const b = c.createBiquadFilter();
  b.type = type;
  b.frequency.setValueAtTime(f, 0);
  b.Q.value = Q;
  return b;
}

/** Soft-clip saturation. Adds harmonics so low sounds read on laptop speakers. */
export function shaper(c: BaseAudioContext, k: number) {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  const ws = c.createWaveShaper();
  ws.curve = curve;
  ws.oversample = '4x';
  return ws;
}

export function chain(...nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

/** Six detuned squares at inharmonic ratios — the classic analog cymbal/hat source. */
export function metal(c: BaseAudioContext, base: number, start = 0) {
  const sum = gain(c, 0.18);
  for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) osc(c, 'square', base * r, start).connect(sum);
  return sum;
}

/** Peak-normalize, optionally reverse, and fade edges to avoid clicks. */
export function finishBuffer(buf: AudioBuffer, level: number, reverse = false) {
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    if (reverse) d.reverse();
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  const g = peak > 0 ? level / peak : 1;
  const fadeOut = Math.min(buf.length, Math.floor(buf.sampleRate * 0.006));
  const fadeIn = reverse ? Math.min(buf.length, Math.floor(buf.sampleRate * 0.01)) : 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= g;
    for (let i = 0; i < fadeOut; i++) d[d.length - 1 - i] *= i / fadeOut;
    for (let i = 0; i < fadeIn; i++) d[i] *= i / fadeIn;
  }
  return buf;
}
