// Practice session: runs a lesson on the transport, judges the player's hits, keeps history.
import { create } from 'zustand';
import { engine } from '../audio/engine';
import { PPQ } from '../audio/sequence';
import { clampBpm } from '../audio/timing';
import { useStudio } from '../state/store';
import {
  accuracy, buildExpected, emptyCounts, grade, judge, matchHit, meanOffsetMs, WINDOW,
  type Counts, type Expected, type Judge,
} from './judge';
import { LESSONS, lessonTicks, type Lesson } from './lessons';

export type Status = 'idle' | 'running' | 'listening' | 'replaying' | 'done';

export interface HistoryEntry { t: number; acc: number; grade: string; bpm: number }

export interface Result {
  lessonId: string;
  acc: number;
  grade: string;
  counts: Counts;
  maxCombo: number;
  meanMs: number;
  bpm: number;
  newBest: boolean;
}

interface PracticeState {
  lessonId: string;
  loops: number;
  tempoPct: number;
  guide: boolean;
  status: Status;
  counts: Counts;
  combo: number;
  maxCombo: number;
  /** Signed offsets (ms) of recent judged hits, newest last — for the early/late meter. */
  recent: number[];
  last: { judge: Judge | 'extra'; ms: number; n: number } | null;
  result: Result | null;
  history: Record<string, HistoryEntry[]>;
  set: (p: Partial<Pick<PracticeState, 'lessonId' | 'loops' | 'tempoPct' | 'guide'>>) => void;
  closeResult: () => void;
}

const STORAGE_KEY = 'padlab.practice.v1';

function loadHistory(): Record<string, HistoryEntry[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveHistory(h: Record<string, HistoryEntry[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
  } catch {
    /* private mode etc. — history just won't persist */
  }
}

export const usePractice = create<PracticeState>()((set) => ({
  lessonId: LESSONS[0].id,
  loops: 4,
  tempoPct: 1,
  guide: false,
  status: 'idle',
  counts: emptyCounts(),
  combo: 0,
  maxCombo: 0,
  recent: [],
  last: null,
  result: null,
  history: typeof localStorage === 'undefined' ? {} : loadHistory(),
  set: (p) => set(p),
  closeResult: () => set({ result: null, status: 'idle' }),
}));

/** Mutable run data read every frame by the highway (kept out of React state on purpose). */
export const run = {
  lesson: LESSONS[0] as Lesson,
  expected: [] as Expected[],
  take: [] as { pad: number; vel: number; tick: number }[],
  endTick: 0,
  judgedAt: new Map<Expected, number>(),
};

export const currentLesson = () => LESSONS.find((l) => l.id === usePractice.getState().lessonId) ?? LESSONS[0];

function prepare(lesson: Lesson) {
  const p = usePractice.getState();
  const s = useStudio.getState();
  s.setBank(lesson.bank);
  s.setBpm(clampBpm(lesson.bpm * p.tempoPct));
  run.lesson = lesson;
  run.endTick = p.loops * lessonTicks(lesson) + PPQ / 2;
}

export function startPractice() {
  const lesson = currentLesson();
  prepare(lesson);
  const p = usePractice.getState();
  run.expected = buildExpected(lesson, p.loops);
  run.take = [];
  run.judgedAt.clear();
  usePractice.setState({ status: 'running', counts: emptyCounts(), combo: 0, maxCombo: 0, recent: [], last: null, result: null });
  engine.startPractice({
    notes: run.expected.map((e) => ({ pad: e.pad, vel: e.vel * 0.3, abs: e.abs })),
    play: p.guide,
    endTick: run.endTick,
    onEnd: finish,
  });
}

/** Play the lesson so you can hear how it should sound (not scored). */
export function listen() {
  const lesson = currentLesson();
  prepare(lesson);
  run.expected = buildExpected(lesson, 2);
  run.take = [];
  run.judgedAt.clear();
  run.endTick = 2 * lessonTicks(lesson) + PPQ / 2;
  usePractice.setState({ status: 'listening', result: null, last: null });
  engine.startPractice({
    notes: run.expected.map((e) => ({ pad: e.pad, vel: e.vel, abs: e.abs })),
    play: true,
    endTick: run.endTick,
    onEnd: () => usePractice.setState({ status: 'idle' }),
  });
}

/** Play back exactly what you played in the last run, with your timing. */
export function replayTake() {
  if (!run.take.length) return;
  usePractice.setState({ status: 'replaying', result: null });
  engine.startPractice({
    // Keep slightly-early downbeat hits; they sound just before bar 1.
    notes: run.take.filter((h) => h.tick >= -PPQ / 4).map((h) => ({ pad: h.pad, vel: h.vel, abs: h.tick })),
    play: true,
    endTick: run.endTick,
    onEnd: () => usePractice.setState({ status: 'idle' }),
  });
}

export function stopPractice() {
  engine.stop();
  usePractice.setState({ status: 'idle' });
}

export function togglePractice() {
  if (usePractice.getState().status === 'idle' || usePractice.getState().status === 'done') startPractice();
  else stopPractice();
}

/** Mark targets that slid past the hit window as misses. */
export function scanMisses(nowTick: number, force = false) {
  if (!force && usePractice.getState().status !== 'running') return;
  const late = WINDOW.good / engine.secPerTick();
  let misses = 0;
  for (const e of run.expected) {
    if (e.result || nowTick - e.abs <= late) continue;
    e.result = 'miss';
    run.judgedAt.set(e, performance.now());
    misses++;
  }
  if (misses)
    usePractice.setState((s) => ({
      counts: { ...s.counts, miss: s.counts.miss + misses },
      combo: 0,
      last: { judge: 'miss', ms: 0, n: (s.last?.n ?? 0) + 1 },
    }));
}

function onHit(pad: number, vel: number, tick: number) {
  const st = usePractice.getState();
  if (st.status !== 'running') return;
  run.take.push({ pad, vel, tick });
  if (tick < -PPQ / 4) return; // count-in noodling doesn't count
  const spt = engine.secPerTick();
  const i = matchHit(run.expected, pad, tick, spt);
  if (i < 0) {
    usePractice.setState((s) => ({
      counts: { ...s.counts, extra: s.counts.extra + 1 },
      combo: 0,
      last: { judge: 'extra', ms: 0, n: (s.last?.n ?? 0) + 1 },
    }));
    return;
  }
  const e = run.expected[i];
  const delta = (tick - e.abs) * spt;
  const j = judge(delta)!;
  e.result = j;
  e.delta = delta;
  run.judgedAt.set(e, performance.now());
  usePractice.setState((s) => {
    const combo = s.combo + 1;
    return {
      counts: { ...s.counts, [j]: s.counts[j] + 1 },
      combo,
      maxCombo: Math.max(s.maxCombo, combo),
      recent: [...s.recent, delta * 1000].slice(-24),
      last: { judge: j, ms: delta * 1000, n: (s.last?.n ?? 0) + 1 },
    };
  });
}

function finish() {
  // The engine has already stopped (status may read idle), so scan regardless.
  scanMisses(Infinity, true);
  const s = usePractice.getState();
  const acc = accuracy(s.counts);
  const lesson = run.lesson;
  const prev = s.history[lesson.id] ?? [];
  const best = prev.reduce((m, h) => Math.max(m, h.acc), 0);
  const bpm = useStudio.getState().bpm;
  const entry: HistoryEntry = { t: Date.now(), acc, grade: grade(acc), bpm };
  const history = { ...s.history, [lesson.id]: [...prev, entry].slice(-30) };
  saveHistory(history);
  usePractice.setState({
    status: 'done',
    history,
    result: {
      lessonId: lesson.id,
      acc,
      grade: grade(acc),
      counts: s.counts,
      maxCombo: s.maxCombo,
      meanMs: meanOffsetMs(run.expected),
      bpm,
      newBest: prev.length > 0 && acc > best,
    },
  });
}

engine.onUserHit(onHit);

// If the transport gets stopped some other way (Space, STOP button), drop out of the run.
useStudio.subscribe((s, prev) => {
  if (prev.playing && !s.playing) {
    const st = usePractice.getState().status;
    if (st === 'running' || st === 'listening' || st === 'replaying') usePractice.setState({ status: 'idle' });
  }
});
