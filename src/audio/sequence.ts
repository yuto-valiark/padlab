// Pure sequencing math. Positions are in ticks; PPQ ticks per quarter note.

export const PPQ = 96;
export const BAR_TICKS = PPQ * 4;
export const STEP_TICKS = PPQ / 4; // one 1/16 step

export interface Note {
  id: number;
  pad: number;
  tick: number;
  vel: number;
}

export interface Pattern {
  bars: number;
  notes: Note[];
  name?: string;
}

export interface TcGrid { label: string; ticks: number }

/** Timing-correct grids. ticks = 0 means quantize off. */
export const TC_GRIDS: TcGrid[] = [
  { label: '1/8', ticks: PPQ / 2 },
  { label: '1/8T', ticks: PPQ / 3 },
  { label: '1/16', ticks: PPQ / 4 },
  { label: '1/16T', ticks: PPQ / 6 },
  { label: '1/32', ticks: PPQ / 8 },
  { label: 'OFF', ticks: 0 },
];

export const mod = (a: number, n: number) => ((a % n) + n) % n;

export const loopTicks = (bars: number) => bars * BAR_TICKS;

/**
 * Move `tick` toward the nearest grid line by `strength` (0–1), wrapped into the loop.
 * strength 1 = hard quantize, 0.5 = halfway (keeps some human feel).
 */
export function quantizeTick(tick: number, grid: number, strength: number, loopLen: number) {
  if (grid <= 0 || strength <= 0) return mod(tick, loopLen);
  const q = Math.round(tick / grid) * grid;
  const t = tick + (q - tick) * Math.min(1, strength);
  return mod(Math.abs(t - Math.round(t)) < 1e-6 ? Math.round(t) : t, loopLen);
}

/**
 * MPC-style swing: delays every second 1/16 inside each 1/8.
 * 50 = straight, 66 ≈ triplet shuffle, 75 = max. Only notes sitting on that off-16th move.
 */
export function swingOffset(tick: number, swing: number) {
  const pair = STEP_TICKS * 2;
  if (Math.abs(mod(tick, pair) - STEP_TICKS) > 1e-6) return 0;
  return (swing / 100) * pair - STEP_TICKS;
}

/** "BAR.BEAT.STEP", 1-based, for the transport counter. */
export function formatPosition(tick: number) {
  if (tick < 0) return `-${Math.ceil(-tick / PPQ)}`;
  const bar = Math.floor(tick / BAR_TICKS) + 1;
  const beat = Math.floor(mod(tick, BAR_TICKS) / PPQ) + 1;
  const step = Math.floor(mod(tick, PPQ) / STEP_TICKS) + 1;
  return `${String(bar).padStart(3, '0')}.${beat}.${step}`;
}
