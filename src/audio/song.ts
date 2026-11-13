// Song arrangement: an ordered list of patterns (each repeated N times) laid end to end.
import { loopTicks, type Pattern } from './sequence';

export interface SongStep { pattern: number; repeats: number }

export interface Segment {
  step: number; // index into the song list
  pattern: number;
  start: number; // absolute tick
  length: number; // ticks
}

/** Lay the song out on a timeline. Missing patterns are skipped. */
export function songLayout(song: SongStep[], patterns: Pattern[]): { segments: Segment[]; total: number } {
  const segments: Segment[] = [];
  let t = 0;
  song.forEach((s, step) => {
    const p = patterns[s.pattern];
    if (!p) return;
    const length = loopTicks(p.bars);
    for (let r = 0; r < Math.max(1, s.repeats); r++) {
      segments.push({ step, pattern: s.pattern, start: t, length });
      t += length;
    }
  });
  return { segments, total: t };
}

/** Which segment a tick falls in (tick wrapped into the song). */
export function segmentAt(segments: Segment[], total: number, tick: number): Segment | null {
  if (!segments.length || total <= 0) return null;
  const t = ((tick % total) + total) % total;
  for (const s of segments) if (t >= s.start && t < s.start + s.length) return s;
  return segments[segments.length - 1];
}
