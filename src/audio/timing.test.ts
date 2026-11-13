import { describe, expect, it } from 'vitest';
import { clampBpm, nextGridTime, repeatInterval, tapTempo } from './timing';

describe('repeatInterval', () => {
  it('1/16 at 120 BPM is 125ms', () => expect(repeatInterval(120, 4)).toBeCloseTo(0.125));
  it('1/8T at 90 BPM', () => expect(repeatInterval(90, 3)).toBeCloseTo(60 / 90 / 3));
});

describe('nextGridTime', () => {
  it('returns the anchor when now equals it', () => expect(nextGridTime(1, 1, 0.25)).toBeCloseTo(1));
  it('rounds up to the next grid point', () => expect(nextGridTime(1.1, 1, 0.25)).toBeCloseTo(1.25));
  it('works with an anchor in the future', () => expect(nextGridTime(1.1, 2, 0.25)).toBeCloseTo(1.25));
  it('does not skip a point sitting exactly on now despite float error', () =>
    expect(nextGridTime(0.1 + 0.2, 0, 0.1)).toBeCloseTo(0.3));
});

describe('tapTempo', () => {
  it('needs two taps', () => expect(tapTempo([], 0).bpm).toBeNull());
  it('computes 120 BPM from 0.5s taps', () => {
    let s = tapTempo([], 0);
    s = tapTempo(s.taps, 0.5);
    s = tapTempo(s.taps, 1.0);
    expect(s.bpm).toBe(120);
  });
  it('resets after a long gap', () => {
    const s = tapTempo([0, 0.5], 5);
    expect(s.taps).toEqual([5]);
    expect(s.bpm).toBeNull();
  });
  it('keeps only the last 5 taps', () => expect(tapTempo([0, 1, 2, 3, 4], 5).taps).toHaveLength(5));
});

describe('clampBpm', () => {
  it('clamps to 40–240', () => {
    expect(clampBpm(10)).toBe(40);
    expect(clampBpm(999)).toBe(240);
  });
  it('rounds to 0.1', () => expect(clampBpm(92.345)).toBe(92.3));
});
