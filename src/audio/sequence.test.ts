import { describe, expect, it } from 'vitest';
import { BAR_TICKS, formatPosition, PPQ, quantizeTick, STEP_TICKS, swingOffset } from './sequence';

describe('quantizeTick', () => {
  const L = BAR_TICKS;
  it('snaps fully at strength 1', () => expect(quantizeTick(30, STEP_TICKS, 1, L)).toBe(24));
  it('moves halfway at strength 0.5', () => expect(quantizeTick(30, STEP_TICKS, 0.5, L)).toBe(27));
  it('leaves ticks alone when off', () => expect(quantizeTick(30.5, 0, 1, L)).toBe(30.5));
  it('wraps a late-loop hit to the downbeat', () => expect(quantizeTick(L - 3, STEP_TICKS, 1, L)).toBe(0));
  it('wraps ticks beyond the loop', () => expect(quantizeTick(L + 24, STEP_TICKS, 1, L)).toBe(24));
  it('handles triplet grids', () => expect(quantizeTick(30, PPQ / 6, 1, L)).toBe(32));
});

describe('swingOffset', () => {
  it('is zero at 50%', () => expect(swingOffset(STEP_TICKS, 50)).toBeCloseTo(0));
  it('delays only off-16ths', () => {
    expect(swingOffset(0, 66)).toBe(0);
    expect(swingOffset(STEP_TICKS * 2, 66)).toBe(0);
    expect(swingOffset(STEP_TICKS, 66)).toBeCloseTo(0.66 * 48 - 24);
    expect(swingOffset(STEP_TICKS * 3, 60)).toBeCloseTo(0.6 * 48 - 24);
  });
  it('ignores unquantized notes', () => expect(swingOffset(STEP_TICKS + 3, 66)).toBe(0));
});

describe('formatPosition', () => {
  it('formats the downbeat', () => expect(formatPosition(0)).toBe('001.1.1'));
  it('formats bar 2 beat 3 step 4', () => expect(formatPosition(BAR_TICKS + 2 * PPQ + 3 * STEP_TICKS)).toBe('002.3.4'));
  it('shows count-in beats as negative', () => expect(formatPosition(-PPQ * 2)).toBe('-2'));
});
