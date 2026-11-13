import { describe, expect, it } from 'vitest';
import { detectTransients, equalSlices, extractSlice, sliceRanges } from './chop';

const SR = 44100;

/** Silence with decaying noise bursts at the given seconds. */
function hits(times: number[], len = 2) {
  const d = new Float32Array(SR * len);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const t of times) {
    const s = Math.floor(t * SR);
    for (let i = 0; i < SR * 0.15 && s + i < d.length; i++) d[s + i] += rnd() * Math.exp(-i / (SR * 0.03));
  }
  return d;
}

describe('detectTransients', () => {
  it('finds each hit within ~10ms', () => {
    const times = [0.25, 0.75, 1.1, 1.6];
    const found = detectTransients(hits(times), SR, 0.5).map((s) => s / SR);
    for (const t of times) expect(found.some((f) => Math.abs(f - t) < 0.012)).toBe(true);
  });
  it('always starts at 0', () => expect(detectTransients(hits([0.5]), SR)[0]).toBe(0));
  it('folds a short lead-in into the first slice', () => {
    const found = detectTransients(hits([0.1, 0.8]), SR);
    expect(found).toHaveLength(2);
    expect(found[0]).toBe(0);
  });
  it('handles silence', () => expect(detectTransients(new Float32Array(SR), SR)).toEqual([0]));
  it('respects the minimum gap', () => {
    const found = detectTransients(hits([0.5, 0.52]), SR, 1, 0.08);
    expect(found.filter((s) => s > 0.4 * SR && s < 0.6 * SR)).toHaveLength(1);
  });
});

describe('slices', () => {
  it('equal slices', () => expect(equalSlices(4, 100)).toEqual([0, 25, 50, 75]));
  it('ranges cover the whole sample, sorted and deduped', () =>
    expect(sliceRanges([50, 0, 50, 20], 100)).toEqual([[0, 20], [20, 50], [50, 100]]));
  it('adds a start marker if missing', () => expect(sliceRanges([40], 100)[0]).toEqual([0, 40]));
  it('extracts with fades at the edges', () => {
    const ch = new Float32Array(1000).fill(1);
    const [s] = extractSlice([ch], 100, 600, SR);
    expect(s.length).toBe(500);
    expect(s[0]).toBe(0);
    expect(s[250]).toBe(1);
  });
});
