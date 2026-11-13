// Sample chopping: transient detection and slice math. Pure functions on raw samples.

/**
 * Find hit onsets (in samples). Uses short-frame energy and fires when the energy
 * jumps well above the recent average. `sensitivity` 0–1: higher = more slices.
 */
export function detectTransients(data: Float32Array, sampleRate: number, sensitivity = 0.5, minGapSec = 0.08): number[] {
  const hop = 256;
  const frames = Math.floor(data.length / hop);
  if (frames < 2) return [0];
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += data[i] * data[i];
    energy[f] = Math.sqrt(e / hop);
  }
  let peak = 0;
  for (const e of energy) peak = Math.max(peak, e);
  if (peak === 0) return [0];

  const ratio = 4.5 - sensitivity * 3.3; // how far above the local average counts as a hit
  const floor = peak * (0.12 - sensitivity * 0.1); // ignore quiet noise
  const minGap = Math.max(1, Math.round((minGapSec * sampleRate) / hop));
  const win = 8;
  const out: number[] = [];
  let last = -Infinity;
  for (let f = 1; f < frames; f++) {
    let avg = 0;
    let n = 0;
    for (let k = Math.max(0, f - win); k < f; k++) {
      avg += energy[k];
      n++;
    }
    avg = avg / n + 1e-6;
    if (energy[f] > floor && energy[f] > avg * ratio && energy[f] > energy[f - 1] && f - last >= minGap) {
      out.push(f * hop);
      last = f;
    }
  }
  // Always start a slice at the very beginning. A short lead-in before the first hit
  // belongs to that hit's slice rather than becoming a tiny silent slice of its own.
  if (out.length && out[0] <= 0.15 * sampleRate) out[0] = 0;
  else out.unshift(0);
  return out;
}

/** n equal slices → start markers. */
export function equalSlices(n: number, length: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.round((i * length) / n));
}

/** Markers (sorted, any order) → [start, end) ranges covering the sample. */
export function sliceRanges(markers: number[], length: number): [number, number][] {
  const m = [...new Set(markers.map((x) => Math.max(0, Math.min(length - 1, Math.round(x)))))].sort((a, b) => a - b);
  if (m[0] !== 0) m.unshift(0);
  return m.map((s, i) => [s, i + 1 < m.length ? m[i + 1] : length]);
}

/** Copy a range out of channel data with tiny fades so slices don't click. */
export function extractSlice(channels: Float32Array[], start: number, end: number, sampleRate: number): Float32Array[] {
  const fade = Math.min(Math.floor(sampleRate * 0.002), Math.floor((end - start) / 4));
  return channels.map((ch) => {
    const out = ch.slice(start, end);
    for (let i = 0; i < fade; i++) {
      out[i] *= i / fade;
      out[out.length - 1 - i] *= i / fade;
    }
    return out;
  });
}
