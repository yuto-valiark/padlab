// Projects: everything you made (patterns, song, pad settings, FX, your samples) saved
// in the browser's IndexedDB, with autosave.
import { create } from 'zustand';
import { engine } from '../audio/engine';
import { SOUNDS } from '../audio/kit';
import { db } from './db';
import { DEFAULT_FX, DEFAULT_PAD, useStudio, type SampleInfo } from './store';

const LAST_KEY = 'padlab.lastProject';
const AUTOSAVE_MS = 1200;

/** Fields of the studio store that belong to a project. */
const KEYS = [
  'bpm', 'swing', 'tcIndex', 'tcStrength', 'metronome', 'countIn', 'master', 'repeatIndex',
  'pads', 'fx', 'patterns', 'current', 'song', 'songMode', 'bank', 'samples',
] as const;
type Snapshot = Pick<ReturnType<typeof useStudio.getState>, (typeof KEYS)[number]>;

export interface ProjectDoc {
  id: string;
  name: string;
  updatedAt: number;
  version: 1;
  state: Snapshot;
}

interface AudioRec { sampleRate: number; channels: Float32Array[] }

export interface ProjectMeta { id: string; name: string; updatedAt: number }

interface ProjectState {
  id: string | null;
  name: string;
  status: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  savedAt: number | null;
  list: ProjectMeta[];
}

export const useProject = create<ProjectState>()(() => ({ id: null, name: 'UNTITLED', status: 'idle', savedAt: null, list: [] }));

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function snapshot(): Snapshot {
  const s = useStudio.getState();
  return Object.fromEntries(KEYS.map((k) => [k, s[k]])) as Snapshot;
}

function defaults(): Snapshot {
  const p = { bars: 1, notes: [] };
  return {
    bpm: 90, swing: 50, tcIndex: 2, tcStrength: 1, metronome: true, countIn: true, master: 0.8, repeatIndex: 3,
    pads: Array.from({ length: 64 }, () => ({ ...DEFAULT_PAD })),
    fx: DEFAULT_FX,
    patterns: [p],
    current: 0,
    song: [{ pattern: 0, repeats: 4 }],
    songMode: false,
    bank: 0,
    samples: [],
  };
}

/** Last buffer written to the DB per pad, so autosave only re-writes audio that changed. */
let savedAudio = new Map<number, AudioBuffer>();
let suspend = false; // true while loading, so the load itself doesn't trigger a save
let timer: ReturnType<typeof setTimeout> | undefined;

async function writeAudio(id: string, force: boolean) {
  const s = useStudio.getState();
  for (let pad = 0; pad < 64; pad++) {
    const key = `${id}:${pad}`;
    const buf = engine.buffers[pad];
    if (s.samples[pad]?.user && buf) {
      if (!force && savedAudio.get(pad) === buf) continue;
      const rec: AudioRec = {
        sampleRate: buf.sampleRate,
        channels: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice()),
      };
      await db.put('audio', rec, key);
      savedAudio.set(pad, buf);
    } else if (savedAudio.has(pad) || force) {
      await db.del('audio', key);
      savedAudio.delete(pad);
    }
  }
}

export async function save(force = false) {
  const p = useProject.getState();
  if (!p.id) return;
  useProject.setState({ status: 'saving' });
  try {
    const doc: ProjectDoc = { id: p.id, name: p.name, updatedAt: Date.now(), version: 1, state: snapshot() };
    await db.put('projects', doc);
    await writeAudio(p.id, force);
    useProject.setState({ status: 'saved', savedAt: doc.updatedAt });
    localStorage.setItem(LAST_KEY, p.id);
    refreshList();
  } catch (e) {
    console.error(e);
    useProject.setState({ status: 'error' });
  }
}

export async function refreshList() {
  try {
    const all = await db.all<ProjectDoc>('projects');
    useProject.setState({ list: all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt) });
  } catch {
    /* IndexedDB unavailable */
  }
}

function apply(state: Snapshot) {
  suspend = true;
  engine.stop();
  const s = useStudio.getState();
  // Old saves may lack newer pad fields — fill them from defaults.
  const pads = state.pads.map((p) => ({ ...DEFAULT_PAD, ...p }));
  const fx = { ...DEFAULT_FX, ...state.fx };
  const patterns = state.patterns.length ? state.patterns : [{ bars: 1, notes: [] }];
  const current = Math.min(state.current, patterns.length - 1);
  useStudio.setState({ ...state, pads, fx, patterns, current, pattern: patterns[current], past: [], future: [], recording: false });
  const maxId = patterns.reduce((m, p) => p.notes.reduce((mm, n) => Math.max(mm, n.id), m), 0);
  s.bumpIds(maxId);
  suspend = false;
}

async function loadAudio(id: string, samples: SampleInfo[]) {
  engine.buffers = engine.kitBuffers.slice();
  savedAudio = new Map();
  const fixed = samples.slice();
  for (let pad = 0; pad < 64; pad++) {
    if (!samples[pad]?.user) continue;
    const rec = await db.get<AudioRec>('audio', `${id}:${pad}`);
    if (!rec) {
      fixed[pad] = { name: SOUNDS[pad].name, user: false }; // audio missing: fall back to the kit
      continue;
    }
    const buf = new AudioBuffer({ length: rec.channels[0].length, numberOfChannels: rec.channels.length, sampleRate: rec.sampleRate });
    rec.channels.forEach((d, c) => buf.copyToChannel(d as Float32Array<ArrayBuffer>, c));
    engine.buffers[pad] = buf;
    savedAudio.set(pad, buf);
  }
  suspend = true;
  useStudio.setState({ samples: fixed });
  suspend = false;
}

export async function openProject(id: string) {
  const doc = await db.get<ProjectDoc>('projects', id);
  if (!doc) throw new Error('プロジェクトが見つかりません');
  await flush();
  apply({ ...defaults(), ...doc.state });
  await loadAudio(id, doc.state.samples ?? []);
  useProject.setState({ id, name: doc.name, status: 'saved', savedAt: doc.updatedAt });
  localStorage.setItem(LAST_KEY, id);
}

export async function newProject(name?: string) {
  await flush();
  engine.buffers = engine.kitBuffers.slice();
  savedAudio = new Map();
  apply(defaults());
  const n = name ?? nextName();
  useProject.setState({ id: newId(), name: n, status: 'dirty' });
  await save(true);
}

export async function saveAs(name: string) {
  await flush();
  useProject.setState({ id: newId(), name: name.slice(0, 40) || nextName() });
  savedAudio = new Map();
  await save(true);
}

export function rename(name: string) {
  useProject.setState({ name: name.slice(0, 40) || 'UNTITLED' });
  schedule();
}

export async function deleteProject(id: string) {
  await db.del('projects', id);
  const keys = await db.keys('audio', IDBKeyRange.bound(`${id}:`, `${id}:￿`));
  for (const k of keys) await db.del('audio', k);
  await refreshList();
  if (useProject.getState().id === id) {
    const next = useProject.getState().list[0];
    if (next) await openProject(next.id);
    else await newProject();
  }
}

function nextName() {
  const names = new Set(useProject.getState().list.map((p) => p.name));
  let i = 1;
  while (names.has(`BEAT ${String(i).padStart(2, '0')}`)) i++;
  return `BEAT ${String(i).padStart(2, '0')}`;
}

function schedule() {
  if (suspend || !useProject.getState().id) return;
  useProject.setState({ status: 'dirty' });
  clearTimeout(timer);
  timer = setTimeout(() => save(), AUTOSAVE_MS);
}

/** Save now if there are pending changes. */
export async function flush() {
  if (timer !== undefined && useProject.getState().status === 'dirty') {
    clearTimeout(timer);
    timer = undefined;
    await save();
  }
}

let booted: Promise<void> | null = null;

/** Called once after the kit is ready: reopen the last project or start a new one. */
export function bootProjects() {
  booted ??= doBoot();
  return booted;
}

async function doBoot() {
  await refreshList();
  const last = localStorage.getItem(LAST_KEY);
  try {
    if (last && useProject.getState().list.some((p) => p.id === last)) await openProject(last);
    else await newProject();
  } catch (e) {
    console.error(e);
    useProject.setState({ status: 'error' });
  }

  useStudio.subscribe((s, prev) => {
    if (KEYS.some((k) => s[k] !== prev[k])) schedule();
  });
  window.addEventListener('beforeunload', () => {
    if (useProject.getState().status === 'dirty') void save();
  });
}
