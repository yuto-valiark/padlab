// Pure timing math — kept free of Web Audio so it can be unit-tested.

export interface RepeatRate { label: string; div: number }

/** Note-repeat rates, expressed as hits per beat. */
export const REPEAT_RATES: RepeatRate[] = [
  { label: '1/4', div: 1 },
  { label: '1/8', div: 2 },
  { label: '1/8T', div: 3 },
  { label: '1/16', div: 4 },
  { label: '1/16T', div: 6 },
  { label: '1/32', div: 8 },
];

export const repeatInterval = (bpm: number, div: number) => 60 / bpm / div;

/** First grid point at or after `now` on a grid of `interval` passing through `anchor`. */
export function nextGridTime(now: number, anchor: number, interval: number) {
  const k = Math.ceil((now - anchor) / interval - 1e-9);
  return anchor + k * interval;
}

/** Tap tempo: averages the last few taps; a gap longer than `resetAfter` seconds starts over. */
export function tapTempo(taps: number[], now: number, resetAfter = 2): { taps: number[]; bpm: number | null } {
  const last = taps[taps.length - 1];
  const next = last !== undefined && now - last <= resetAfter && now > last ? [...taps, now].slice(-5) : [now];
  if (next.length < 2) return { taps: next, bpm: null };
  const iv = (next[next.length - 1] - next[0]) / (next.length - 1);
  return { taps: next, bpm: clampBpm(Math.round(600 / iv) / 10) };
}

export const clampBpm = (bpm: number) => Math.min(240, Math.max(40, Math.round(bpm * 10) / 10));

/** Velocity (0–1) → linear gain. Squared so soft hits sit well under full hits. */
export const velToGain = (v: number) => 0.12 + 0.88 * v * v;

export const FULL_VEL = 1;
export const SOFT_VEL = 0.42;
