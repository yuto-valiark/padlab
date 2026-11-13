import { describe, expect, it } from 'vitest';
import { BAR_TICKS, STEP_TICKS } from '../audio/sequence';
import { accuracy, buildExpected, emptyCounts, grade, judge, matchHit, meanOffsetMs } from './judge';
import { LESSONS, lessonTicks } from './lessons';

describe('judge', () => {
  it('grades by distance from the target', () => {
    expect(judge(0.01)).toBe('perfect');
    expect(judge(-0.05)).toBe('great');
    expect(judge(0.1)).toBe('good');
    expect(judge(0.2)).toBeNull();
  });
});

describe('lessons', () => {
  it('stay inside their bank and length', () => {
    for (const l of LESSONS) {
      expect(l.hits.length).toBeGreaterThan(0);
      for (const h of l.hits) {
        expect(h.slot).toBeGreaterThanOrEqual(0);
        expect(h.slot).toBeLessThan(16);
        expect(h.step * STEP_TICKS).toBeLessThan(lessonTicks(l));
      }
    }
  });
  it('have unique ids', () => expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length));
});

describe('buildExpected', () => {
  it('repeats the lesson per loop, sorted', () => {
    const l = LESSONS[0];
    const ex = buildExpected(l, 2);
    expect(ex).toHaveLength(l.hits.length * 2);
    expect(ex[ex.length - 1].abs).toBeGreaterThanOrEqual(BAR_TICKS);
    for (let i = 1; i < ex.length; i++) expect(ex[i].abs).toBeGreaterThanOrEqual(ex[i - 1].abs);
  });
  it('applies the lesson swing to off-16ths', () => {
    const l = LESSONS.find((x) => x.swing > 50)!;
    const off = buildExpected(l, 1).find((e) => e.abs > STEP_TICKS - 1 && e.abs < STEP_TICKS * 2)!;
    expect(off.abs).toBeGreaterThan(STEP_TICKS);
  });
});

describe('matchHit', () => {
  const spt = 60 / 120 / 96;
  const ex = buildExpected(LESSONS[0], 1); // kick at 0 and 192
  it('finds the closest target on the same pad', () => expect(ex[matchHit(ex, 0, 3, spt)].abs).toBe(0));
  it('ignores other pads', () => expect(matchHit(ex, 15, 0, spt)).toBe(-1));
  it('rejects hits outside the window', () => expect(matchHit(ex, 0, 96, spt)).toBe(-1));
});

describe('scoring', () => {
  it('computes weighted accuracy', () => {
    expect(accuracy({ ...emptyCounts(), perfect: 10 })).toBe(100);
    expect(accuracy({ ...emptyCounts(), perfect: 5, miss: 5 })).toBe(50);
    expect(accuracy({ ...emptyCounts(), perfect: 4, extra: 100 })).toBe(0);
  });
  it('grades', () => {
    expect(grade(96)).toBe('S');
    expect(grade(40)).toBe('D');
  });
  it('averages offsets in ms', () => {
    const ex = buildExpected(LESSONS[0], 1);
    ex[0].delta = 0.01;
    ex[1].delta = 0.03;
    expect(meanOffsetMs(ex)).toBeCloseTo(20);
  });
});
