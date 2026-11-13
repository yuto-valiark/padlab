import { describe, expect, it } from 'vitest';
import { noteToPad } from './midi';

describe('noteToPad', () => {
  it('bank mode follows the current bank', () => {
    expect(noteToPad(36, 'bank', 0)).toBe(0);
    expect(noteToPad(51, 'bank', 2)).toBe(47);
    expect(noteToPad(52, 'bank', 0)).toBe(-1);
  });
  it('fixed mode covers all 64 pads', () => {
    expect(noteToPad(36, 'fixed', 3)).toBe(0);
    expect(noteToPad(99, 'fixed', 0)).toBe(63);
    expect(noteToPad(100, 'fixed', 0)).toBe(-1);
    expect(noteToPad(35, 'fixed', 0)).toBe(-1);
  });
});
