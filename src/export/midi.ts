// Standard MIDI File (format 0) writer.

export interface MidiNote { tick: number; note: number; vel: number; length: number }

/** Variable-length quantity. */
export function vlq(n: number): number[] {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return out;
}

/**
 * One track, drums on channel 10 (index 9). Pad p → note 36 + p
 * (Pad 1 of bank A = C1 = 36, the usual drum-pad layout).
 */
export function encodeMidi(notes: MidiNote[], bpm: number, ppq: number, name = 'PADLAB'): Uint8Array {
  type Ev = { t: number; bytes: number[]; order: number };
  const evs: Ev[] = [];
  const mpq = Math.round(60000000 / bpm);
  evs.push({ t: 0, order: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...[...name].map((c) => c.charCodeAt(0) & 0x7f)] });
  evs.push({ t: 0, order: 0, bytes: [0xff, 0x51, 0x03, (mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff] });
  evs.push({ t: 0, order: 0, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] });
  for (const n of notes) {
    const t = Math.max(0, Math.round(n.tick));
    const v = Math.max(1, Math.min(127, Math.round(n.vel * 127)));
    evs.push({ t, order: 2, bytes: [0x99, n.note & 0x7f, v] });
    evs.push({ t: t + Math.max(1, Math.round(n.length)), order: 1, bytes: [0x89, n.note & 0x7f, 0] });
  }
  // Note-offs before note-ons at the same tick so retriggers work.
  evs.sort((a, b) => a.t - b.t || a.order - b.order);
  const track: number[] = [];
  let last = 0;
  for (const e of evs) {
    track.push(...vlq(e.t - last), ...e.bytes);
    last = e.t;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const out: number[] = [];
  const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
  out.push(...[...'MThd'].map((c) => c.charCodeAt(0)), ...u32(6), ...u16(0), ...u16(1), ...u16(ppq));
  out.push(...[...'MTrk'].map((c) => c.charCodeAt(0)), ...u32(track.length), ...track);
  return new Uint8Array(out);
}
