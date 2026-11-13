import { create } from 'zustand';
import { loopTicks, mod, quantizeTick, STEP_TICKS, TC_GRIDS, type Note, type Pattern } from '../audio/sequence';
import type { SongStep } from '../audio/song';
import { clampBpm, REPEAT_RATES } from '../audio/timing';

export type FilterType = 'off' | 'lp' | 'hp' | 'bp';

export interface PadParams {
  volume: number; // 0–1.5 (channel fader)
  tune: number; // semitones, -24–24
  fine: number; // cents, -50–50
  pan: number; // -1–1
  start: number; // 0–1 of the sample
  end: number; // 0–1 of the sample
  reverse: boolean;
  attack: number; // s
  decay: number; // s
  sustain: number; // 0–1
  release: number; // s
  /** oneshot: plays to the end. gate: stops (with release) when you let go of the pad. */
  mode: 'oneshot' | 'gate';
  filter: FilterType;
  cutoff: number; // Hz
  reso: number; // Q
  sendRev: number; // 0–1
  sendDly: number; // 0–1
  mute: boolean;
  solo: boolean;
}

export const DEFAULT_PAD: PadParams = {
  volume: 1, tune: 0, fine: 0, pan: 0,
  start: 0, end: 1, reverse: false,
  attack: 0, decay: 0.3, sustain: 1, release: 0.05, mode: 'oneshot',
  filter: 'off', cutoff: 8000, reso: 0.7,
  sendRev: 0, sendDly: 0, mute: false, solo: false,
};

/** Where a pad's sound came from. `user` = loaded by you (rights are your responsibility). */
export interface SampleInfo { name: string; user: boolean }

export interface FxState {
  reverb: { size: number; tone: number; level: number };
  delay: { div: number; feedback: number; tone: number; level: number };
  sidechain: { on: boolean; source: number; depth: number; release: number };
  eq: { low: number; mid: number; midFreq: number; high: number };
  comp: { threshold: number; ratio: number; makeup: number };
  tape: { drive: number };
  lofi: { bits: number; down: number };
  vinyl: { level: number };
}

/** Display name of a pad: your sample's name, or the stock sound's. */
export const padName = (s: { samples: SampleInfo[] }, pad: number, fallback: string) => s.samples[pad]?.name ?? fallback;

export const DEFAULT_FX: FxState = {
  reverb: { size: 2.2, tone: 6000, level: 0.8 },
  delay: { div: 0.75, feedback: 0.35, tone: 3500, level: 0.7 },
  sidechain: { on: false, source: 0, depth: 0.6, release: 0.18 },
  eq: { low: 0, mid: 0, midFreq: 1000, high: 0 },
  comp: { threshold: -14, ratio: 2.5, makeup: 0 },
  tape: { drive: 0 },
  lofi: { bits: 16, down: 1 },
  vinyl: { level: 0 },
};

export type Phase = 'loading' | 'ready' | 'on';

export interface Held { pad: number; vel: number }

export type WorkTab = 'seq' | 'song' | 'pad' | 'mixer' | 'fx' | 'practice';

export const MAX_PATTERNS = 16;
export const patternLabel = (i: number) => `P${String(i + 1).padStart(2, '0')}`;

const HISTORY_MAX = 100;
let nextId = 1;
const newId = () => nextId++;

/** Two notes on the same pad closer than this (in ticks) count as the same hit. */
const SAME_HIT = 2;

interface StudioState {
  phase: Phase;
  progress: number;
  bank: number;
  bpm: number;
  repeatIndex: number;
  repeatOn: boolean;
  master: number;
  pads: PadParams[];
  selected: number;
  held: Record<number, Held>;
  lastHit: { pad: number; vel: number; n: number } | null;
  latencyMs: number | null;
  samples: SampleInfo[];
  fx: FxState;
  notice: string | null;

  // Sequencer. `pattern` is the one being edited; it is always patterns[current].
  pattern: Pattern;
  patterns: Pattern[];
  current: number;
  song: SongStep[];
  songMode: boolean;
  past: Pattern[];
  future: Pattern[];
  playing: boolean;
  recording: boolean;
  metronome: boolean;
  countIn: boolean;
  swing: number; // 50–75
  tcIndex: number;
  tcStrength: number; // 0–1
  tab: WorkTab;
  erasing: boolean;

  setPhase: (p: Phase) => void;
  setProgress: (p: number) => void;
  setBank: (b: number) => void;
  setBpm: (bpm: number) => void;
  stepRepeat: (d: number) => void;
  setRepeatOn: (on: boolean) => void;
  setMaster: (v: number) => void;
  setPadParam: <K extends keyof PadParams>(pad: number, key: K, v: PadParams[K]) => void;
  select: (pad: number) => void;
  press: (slot: number, h: Held) => void;
  release: (slot: number) => void;
  releaseAll: () => void;
  setLastHit: (pad: number, vel: number) => void;
  setLatency: (ms: number) => void;
  setPad: (pad: number, p: Partial<PadParams>) => void;
  resetPad: (pad: number) => void;
  setSample: (pad: number, info: SampleInfo) => void;
  setFx: <K extends keyof FxState>(k: K, v: Partial<FxState[K]>) => void;
  setNotice: (n: string | null) => void;

  setTab: (t: WorkTab) => void;
  setTransport: (p: Partial<Pick<StudioState, 'playing' | 'recording'>>) => void;
  toggle: (k: 'metronome' | 'countIn') => void;
  setSwing: (v: number) => void;
  setTc: (index: number) => void;
  setTcStrength: (v: number) => void;
  setErasing: (on: boolean) => void;
  /** Save an undo point. Call once before a group of edits (e.g. at the start of a take). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  setBars: (bars: number) => void;
  /** Live-record a hit (no undo point; the take's checkpoint covers it). Returns the note id. */
  recordNote: (pad: number, tick: number, vel: number) => number;
  toggleStep: (pad: number, step: number, vel: number, mode?: 'add' | 'remove') => 'add' | 'remove';
  clearPad: (pad: number) => void;
  clearPattern: () => void;
  quantizeAll: () => void;

  selectPattern: (i: number) => void;
  addPattern: (copyCurrent: boolean) => void;
  deletePattern: (i: number) => void;
  renamePattern: (i: number, name: string) => void;
  setSongMode: (on: boolean) => void;
  addSongStep: (pattern: number) => void;
  removeSongStep: (i: number) => void;
  moveSongStep: (i: number, d: number) => void;
  setSongStep: (i: number, p: Partial<SongStep>) => void;
  /** Make sure new note ids won't collide with loaded ones. */
  bumpIds: (maxId: number) => void;
}

export const useStudio = create<StudioState>()((set, get) => ({
  phase: 'loading',
  progress: 0,
  bank: 0,
  bpm: 90,
  repeatIndex: 3,
  repeatOn: false,
  master: 0.8,
  pads: Array.from({ length: 64 }, () => ({ ...DEFAULT_PAD })),
  selected: 0,
  held: {},
  lastHit: null,
  latencyMs: null,

  setPhase: (phase) => set({ phase }),
  setProgress: (progress) => set({ progress }),
  setBank: (b) => set({ bank: (b + 4) % 4 }),
  setBpm: (bpm) => set({ bpm: clampBpm(bpm) }),
  stepRepeat: (d) =>
    set((s) => ({ repeatIndex: Math.min(REPEAT_RATES.length - 1, Math.max(0, s.repeatIndex + d)) })),
  setRepeatOn: (repeatOn) => set({ repeatOn }),
  setMaster: (master) => set({ master }),
  setPadParam: (pad, key, v) =>
    set((s) => {
      const pads = s.pads.slice();
      pads[pad] = { ...pads[pad], [key]: v };
      return { pads };
    }),
  select: (selected) => set({ selected }),
  press: (slot, h) => set((s) => ({ held: { ...s.held, [slot]: h } })),
  release: (slot) =>
    set((s) => {
      const held = { ...s.held };
      delete held[slot];
      return { held };
    }),
  releaseAll: () => set({ held: {} }),
  setLastHit: (pad, vel) => set((s) => ({ lastHit: { pad, vel, n: (s.lastHit?.n ?? 0) + 1 } })),
  setLatency: (latencyMs) => set({ latencyMs }),
  samples: [],
  fx: DEFAULT_FX,
  notice: null,
  setPad: (pad, p) =>
    set((s) => {
      const pads = s.pads.slice();
      pads[pad] = { ...pads[pad], ...p };
      return { pads };
    }),
  resetPad: (pad) =>
    set((s) => {
      const pads = s.pads.slice();
      pads[pad] = { ...DEFAULT_PAD };
      return { pads };
    }),
  setSample: (pad, info) =>
    set((s) => {
      const samples = s.samples.slice();
      samples[pad] = info;
      return { samples };
    }),
  setFx: (k, v) => set((s) => ({ fx: { ...s.fx, [k]: { ...s.fx[k], ...v } } })),
  setNotice: (notice) => set({ notice }),

  pattern: { bars: 1, notes: [] },
  patterns: [{ bars: 1, notes: [] }],
  current: 0,
  song: [{ pattern: 0, repeats: 4 }],
  songMode: false,
  past: [],
  future: [],
  playing: false,
  recording: false,
  metronome: true,
  countIn: true,
  swing: 50,
  tcIndex: 2,
  tcStrength: 1,
  tab: 'seq',
  erasing: false,

  setTab: (tab) => set({ tab }),
  setTransport: (p) => set(p),
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<StudioState>),
  setSwing: (swing) => set({ swing: Math.min(75, Math.max(50, swing)) }),
  setTc: (tcIndex) => set({ tcIndex: Math.min(TC_GRIDS.length - 1, Math.max(0, tcIndex)) }),
  setTcStrength: (tcStrength) => set({ tcStrength: Math.min(1, Math.max(0, tcStrength)) }),
  setErasing: (erasing) => set({ erasing }),

  checkpoint: () => set((s) => ({ past: [...s.past, s.pattern].slice(-HISTORY_MAX), future: [] })),
  undo: () =>
    set((s) => {
      if (!s.past.length) return {};
      return { pattern: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.pattern, ...s.future] };
    }),
  redo: () =>
    set((s) => {
      if (!s.future.length) return {};
      return { pattern: s.future[0], future: s.future.slice(1), past: [...s.past, s.pattern] };
    }),

  setBars: (bars) =>
    set((s) => {
      if (bars === s.pattern.bars) return {};
      const old = s.pattern;
      const L = loopTicks(bars);
      let notes: Note[];
      if (bars > old.bars) {
        // Growing the loop copies the existing bars forward, like an MPC "double".
        const oldL = loopTicks(old.bars);
        notes = [];
        for (let k = 0; k < bars / old.bars; k++)
          for (const n of old.notes) notes.push({ ...n, id: k === 0 ? n.id : newId(), tick: n.tick + k * oldL });
      } else notes = old.notes.filter((n) => n.tick < L);
      return { past: [...s.past, old].slice(-HISTORY_MAX), future: [], pattern: { bars, notes } };
    }),

  recordNote: (pad, tick, vel) => {
    const s = get();
    const dup = s.pattern.notes.find((n) => n.pad === pad && Math.abs(n.tick - tick) < SAME_HIT);
    if (dup) {
      set({ pattern: { ...s.pattern, notes: s.pattern.notes.map((n) => (n === dup ? { ...n, vel } : n)) } });
      return dup.id;
    }
    const id = newId();
    set({ pattern: { ...s.pattern, notes: [...s.pattern.notes, { id, pad, tick, vel }] } });
    return id;
  },

  toggleStep: (pad, step, vel, mode) => {
    const s = get();
    const t0 = step * STEP_TICKS;
    const inStep = (n: Note) => n.pad === pad && n.tick >= t0 - 0.5 && n.tick < t0 + STEP_TICKS - 0.5;
    const has = s.pattern.notes.some(inStep);
    const action = mode ?? (has ? 'remove' : 'add');
    if ((action === 'add') === has) return action; // nothing to do (drag-painting over same state)
    const notes =
      action === 'remove' ? s.pattern.notes.filter((n) => !inStep(n)) : [...s.pattern.notes, { id: newId(), pad, tick: t0, vel }];
    set({ past: [...s.past, s.pattern].slice(-HISTORY_MAX), future: [], pattern: { ...s.pattern, notes } });
    return action;
  },

  clearPad: (pad) =>
    set((s) => {
      if (!s.pattern.notes.some((n) => n.pad === pad)) return {};
      return {
        past: [...s.past, s.pattern].slice(-HISTORY_MAX),
        future: [],
        pattern: { ...s.pattern, notes: s.pattern.notes.filter((n) => n.pad !== pad) },
      };
    }),

  clearPattern: () =>
    set((s) =>
      s.pattern.notes.length
        ? { past: [...s.past, s.pattern].slice(-HISTORY_MAX), future: [], pattern: { ...s.pattern, notes: [] } }
        : {},
    ),

  selectPattern: (i) =>
    set((s) => (i === s.current || !s.patterns[i] ? {} : { current: i, pattern: s.patterns[i], past: [], future: [] })),
  addPattern: (copyCurrent) =>
    set((s) => {
      if (s.patterns.length >= MAX_PATTERNS) return {};
      const p: Pattern = copyCurrent
        ? { bars: s.pattern.bars, notes: s.pattern.notes.map((n) => ({ ...n, id: newId() })) }
        : { bars: s.pattern.bars, notes: [] };
      const patterns = [...s.patterns, p];
      return { patterns, current: patterns.length - 1, pattern: p, past: [], future: [] };
    }),
  deletePattern: (i) =>
    set((s) => {
      if (s.patterns.length <= 1) return {};
      const patterns = s.patterns.filter((_, k) => k !== i);
      // Song steps pointing past the deleted one shift down; ones pointing at it go away.
      const song = s.song.filter((st) => st.pattern !== i).map((st) => ({ ...st, pattern: st.pattern > i ? st.pattern - 1 : st.pattern }));
      const current = Math.min(patterns.length - 1, s.current > i ? s.current - 1 : s.current === i ? Math.max(0, i - 1) : s.current);
      return { patterns, song, current, pattern: patterns[current], past: [], future: [] };
    }),
  renamePattern: (i, name) =>
    set((s) => {
      const patterns = s.patterns.slice();
      patterns[i] = { ...patterns[i], name: name.slice(0, 16) || undefined };
      return i === s.current ? { patterns, pattern: patterns[i] } : { patterns };
    }),
  setSongMode: (songMode) => set({ songMode }),
  addSongStep: (pattern) => set((s) => ({ song: [...s.song, { pattern, repeats: 1 }] })),
  removeSongStep: (i) => set((s) => ({ song: s.song.filter((_, k) => k !== i) })),
  moveSongStep: (i, d) =>
    set((s) => {
      const j = i + d;
      if (j < 0 || j >= s.song.length) return {};
      const song = s.song.slice();
      [song[i], song[j]] = [song[j], song[i]];
      return { song };
    }),
  setSongStep: (i, p) =>
    set((s) => {
      const song = s.song.slice();
      song[i] = { ...song[i], ...p, repeats: Math.min(16, Math.max(1, p.repeats ?? song[i].repeats)) };
      return { song };
    }),
  bumpIds: (maxId) => {
    nextId = Math.max(nextId, maxId + 1);
  },

  quantizeAll: () =>
    set((s) => {
      const grid = TC_GRIDS[s.tcIndex].ticks;
      if (!grid) return {};
      const L = loopTicks(s.pattern.bars);
      const notes = s.pattern.notes.map((n) => ({ ...n, tick: quantizeTick(n.tick, grid, s.tcStrength, L) }));
      // Merge hits that landed on the same spot.
      const seen = new Set<string>();
      const merged = notes.filter((n) => {
        const k = `${n.pad}:${Math.round(mod(n.tick, L))}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { past: [...s.past, s.pattern].slice(-HISTORY_MAX), future: [], pattern: { ...s.pattern, notes: merged } };
    }),
}));

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __studio: typeof useStudio }).__studio = useStudio;

// Keep patterns[current] in sync with the pattern being edited.
useStudio.subscribe((s, prev) => {
  if (s.pattern !== prev.pattern && s.patterns[s.current] !== s.pattern) {
    const patterns = s.patterns.slice();
    patterns[s.current] = s.pattern;
    useStudio.setState({ patterns });
  }
});
