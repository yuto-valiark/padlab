// Lightweight pub/sub so pads, LEDs and the inspector can react to hits
// without re-rendering React on every drum hit.
type Fn = (vel: number) => void;
type AnyFn = (pad: number, vel: number) => void;

const byPad = new Map<number, Set<Fn>>();
const any = new Set<AnyFn>();

export function onPadHit(pad: number, fn: Fn) {
  let set = byPad.get(pad);
  if (!set) byPad.set(pad, (set = new Set()));
  set.add(fn);
  return () => void set.delete(fn);
}

export function onAnyHit(fn: AnyFn) {
  any.add(fn);
  return () => void any.delete(fn);
}

export function emitHit(pad: number, vel: number) {
  byPad.get(pad)?.forEach((f) => f(vel));
  any.forEach((f) => f(pad, vel));
}
