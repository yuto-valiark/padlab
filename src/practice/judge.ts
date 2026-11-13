// Pure scoring logic for practice mode.
import { STEP_TICKS, swingOffset } from '../audio/sequence';
import type { Lesson } from './lessons';
import { lessonTicks } from './lessons';

export type Judge = 'perfect' | 'great' | 'good' | 'miss';

/** Hit windows in seconds (± from the target). */
export const WINDOW = { perfect: 0.035, great: 0.07, good: 0.11 };

export function judge(deltaSec: number): Exclude<Judge, 'miss'> | null {
  const a = Math.abs(deltaSec);
  if (a <= WINDOW.perfect) return 'perfect';
  if (a <= WINDOW.great) return 'great';
  if (a <= WINDOW.good) return 'good';
  return null;
}

export interface Expected {
  pad: number;
  slot: number;
  abs: number; // ticks from the start of the run
  vel: number;
  result: Judge | null;
  delta?: number; // seconds, + = late
}

/** Every note the player should hit across `loops` repetitions. */
export function buildExpected(lesson: Lesson, loops: number): Expected[] {
  const L = lessonTicks(lesson);
  const out: Expected[] = [];
  for (let k = 0; k < loops; k++)
    for (const h of lesson.hits) {
      const tick = h.step * STEP_TICKS;
      out.push({
        pad: lesson.bank * 16 + h.slot,
        slot: h.slot,
        abs: k * L + tick + swingOffset(tick, lesson.swing),
        vel: h.vel ?? 1,
        result: null,
      });
    }
  return out.sort((a, b) => a.abs - b.abs);
}

/** Closest unjudged target on the same pad within the hit window, or -1. */
export function matchHit(expected: Expected[], pad: number, tick: number, secPerTick: number) {
  let best = -1;
  let bestAbs = Infinity;
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    if (e.result || e.pad !== pad) continue;
    const d = Math.abs(tick - e.abs) * secPerTick;
    if (d <= WINDOW.good && d < bestAbs) {
      best = i;
      bestAbs = d;
    }
  }
  return best;
}

export interface Counts { perfect: number; great: number; good: number; miss: number; extra: number }

export const emptyCounts = (): Counts => ({ perfect: 0, great: 0, good: 0, miss: 0, extra: 0 });

/** 0–100. Wrong/extra hits cost a little so mashing doesn't pay. */
export function accuracy(c: Counts) {
  const total = c.perfect + c.great + c.good + c.miss;
  if (!total) return 0;
  const score = c.perfect + c.great * 0.8 + c.good * 0.5 - c.extra * 0.25;
  return Math.max(0, Math.round((score / total) * 1000) / 10);
}

export function grade(acc: number) {
  if (acc >= 95) return 'S';
  if (acc >= 85) return 'A';
  if (acc >= 70) return 'B';
  if (acc >= 50) return 'C';
  return 'D';
}

/** Mean signed offset in ms (+ = you play late). */
export function meanOffsetMs(expected: Expected[]) {
  const d = expected.filter((e) => e.delta !== undefined).map((e) => e.delta!);
  if (!d.length) return 0;
  return (d.reduce((a, b) => a + b, 0) / d.length) * 1000;
}
