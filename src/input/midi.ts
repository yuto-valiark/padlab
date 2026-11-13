// Web MIDI input: play pads from a MIDI pad controller / keyboard.
import { create } from 'zustand';
import { engine } from '../audio/engine';
import { useStudio } from '../state/store';

export type MidiMap = 'bank' | 'fixed';

interface MidiState {
  status: 'off' | 'connecting' | 'on' | 'unsupported' | 'denied';
  inputs: string[];
  map: MidiMap;
  last: { note: number; vel: number; n: number } | null;
  setMap: (m: MidiMap) => void;
}

export const useMidi = create<MidiState>()((set) => ({
  status: 'off',
  inputs: [],
  map: 'bank',
  last: null,
  setMap: (map) => set({ map }),
}));

const BASE = 36; // C1 — the usual first drum pad note

/**
 * Note → pad.
 * bank:  36–51 play Pad 1–16 of the bank you're on (like the keyboard).
 * fixed: 36–99 map to all 64 pads (A01…D16), whatever bank is showing.
 */
export function noteToPad(note: number, map: MidiMap, bank: number): number {
  const i = note - BASE;
  if (map === 'fixed') return i >= 0 && i < 64 ? i : -1;
  return i >= 0 && i < 16 ? bank * 16 + i : -1;
}

const held = new Map<number, number>(); // note → pad

function onMessage(e: MIDIMessageEvent) {
  const d = e.data;
  if (!d || d.length < 3) return;
  const cmd = d[0] & 0xf0;
  const note = d[1];
  const vel = d[2];
  const s = useStudio.getState();
  if (s.phase !== 'on') return;
  if (cmd === 0x90 && vel > 0) {
    const pad = noteToPad(note, useMidi.getState().map, s.bank);
    useMidi.setState((m) => ({ last: { note, vel, n: (m.last?.n ?? 0) + 1 } }));
    if (pad < 0) return;
    if (s.erasing) {
      s.clearPad(pad);
      return;
    }
    held.set(note, pad);
    s.select(pad);
    engine.padDown(pad, vel / 127, s.repeatOn);
  } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
    const pad = held.get(note);
    if (pad === undefined) return;
    held.delete(note);
    engine.padUp(pad);
  }
}

let access: MIDIAccess | null = null;

function attach() {
  if (!access) return;
  const names: string[] = [];
  access.inputs.forEach((input) => {
    input.onmidimessage = onMessage;
    names.push(input.name ?? 'MIDI input');
  });
  useMidi.setState({ inputs: names });
}

export async function connectMidi() {
  if (!('requestMIDIAccess' in navigator)) {
    useMidi.setState({ status: 'unsupported' });
    return;
  }
  useMidi.setState({ status: 'connecting' });
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
    access.onstatechange = attach;
    attach();
    useMidi.setState({ status: 'on' });
  } catch {
    useMidi.setState({ status: 'denied' });
  }
}
