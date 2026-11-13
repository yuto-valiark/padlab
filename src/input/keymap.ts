// Physical-key → pad slot. Uses KeyboardEvent.code so it works regardless of
// keyboard layout or IME. Slot 0 = Pad 1 = bottom-left, like an MPC.

export const PAD_CODES = [
  'KeyZ', 'KeyX', 'KeyC', 'KeyV',
  'KeyA', 'KeyS', 'KeyD', 'KeyF',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR',
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
] as const;

export const PAD_LABELS = ['Z', 'X', 'C', 'V', 'A', 'S', 'D', 'F', 'Q', 'W', 'E', 'R', '1', '2', '3', '4'];

const lookup = new Map<string, number>(PAD_CODES.map((c, i) => [c, i]));

export const slotFromCode = (code: string) => lookup.get(code) ?? -1;

/** Slots in on-screen order: top row first (13–16), bottom row last (1–4). */
export const GRID_ORDER = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];
