import { describe, expect, it } from 'vitest';
import { GRID_ORDER, PAD_CODES, PAD_LABELS, slotFromCode } from './keymap';

describe('keymap', () => {
  it('Z is pad 1 (bottom-left), 4 is pad 16 (top-right)', () => {
    expect(slotFromCode('KeyZ')).toBe(0);
    expect(slotFromCode('Digit4')).toBe(15);
  });
  it('unknown keys map to -1', () => expect(slotFromCode('KeyP')).toBe(-1));
  it('has 16 unique codes and labels', () => {
    expect(new Set(PAD_CODES).size).toBe(16);
    expect(PAD_LABELS).toHaveLength(16);
  });
  it('grid order covers every slot once, top row first', () => {
    expect([...GRID_ORDER].sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
    expect(GRID_ORDER.slice(0, 4)).toEqual([12, 13, 14, 15]);
  });
});
