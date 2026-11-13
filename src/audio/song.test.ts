import { describe, expect, it } from 'vitest';
import { BAR_TICKS } from './sequence';
import { segmentAt, songLayout } from './song';

const pats = [{ bars: 1, notes: [] }, { bars: 2, notes: [] }];

describe('songLayout', () => {
  it('lays steps end to end with repeats', () => {
    const { segments, total } = songLayout([{ pattern: 0, repeats: 2 }, { pattern: 1, repeats: 1 }], pats);
    expect(segments.map((s) => s.start)).toEqual([0, BAR_TICKS, 2 * BAR_TICKS]);
    expect(total).toBe(4 * BAR_TICKS);
  });
  it('skips missing patterns', () => expect(songLayout([{ pattern: 9, repeats: 1 }], pats).total).toBe(0));
});

describe('segmentAt', () => {
  const { segments, total } = songLayout([{ pattern: 0, repeats: 1 }, { pattern: 1, repeats: 1 }], pats);
  it('finds the segment', () => expect(segmentAt(segments, total, BAR_TICKS + 5)?.pattern).toBe(1));
  it('wraps past the end', () => expect(segmentAt(segments, total, total + 3)?.pattern).toBe(0));
  it('is null for an empty song', () => expect(segmentAt([], 0, 0)).toBeNull());
});
