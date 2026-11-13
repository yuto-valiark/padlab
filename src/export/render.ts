// Offline bounce: renders the song (or a pattern) faster than real time through the
// exact same voice + mixer code as live playback.
import { engine } from '../audio/engine';
import { BANKS, SOUNDS } from '../audio/kit';
import { MixGraph } from '../audio/mixer';
import { loopTicks, PPQ, STEP_TICKS, swingOffset } from '../audio/sequence';
import { songLayout } from '../audio/song';
import { VoicePlayer } from '../audio/voices';
import { padName, useStudio } from '../state/store';
import { encodeMidi } from './midi';
import { encodeWav } from './wav';
import { zip } from './zip';

export type Source = { kind: 'song' } | { kind: 'pattern'; loops: number };

export interface Ev { pad: number; vel: number; tick: number }

/** All note events for the source, in ticks from the start, swing applied. */
export function collectEvents(source: Source): { events: Ev[]; total: number } {
  const s = useStudio.getState();
  const events: Ev[] = [];
  const push = (base: number, notes: { pad: number; vel: number; tick: number }[]) => {
    for (const n of notes) events.push({ pad: n.pad, vel: n.vel, tick: base + n.tick + swingOffset(n.tick, s.swing) });
  };
  let total: number;
  if (source.kind === 'song') {
    const lay = songLayout(s.song, s.patterns);
    for (const seg of lay.segments) push(seg.start, s.patterns[seg.pattern].notes);
    total = lay.total;
  } else {
    const L = loopTicks(s.pattern.bars);
    for (let k = 0; k < source.loops; k++) push(k * L, s.pattern.notes);
    total = L * source.loops;
  }
  events.sort((a, b) => a.tick - b.tick);
  return { events, total };
}

const TAIL = 2.5; // seconds after the last bar for reverb/delay tails

/** Render to a stereo AudioBuffer. `only` = render just these pads (others still drive the sidechain). */
export async function bounce(source: Source, only?: Set<number>): Promise<AudioBuffer> {
  const s = useStudio.getState();
  const { events, total } = collectEvents(source);
  const sr = engine.ctx?.sampleRate ?? 48000;
  const spt = 60 / s.bpm / PPQ;
  const ctx = new OfflineAudioContext(2, Math.ceil((total * spt + TAIL) * sr), sr);
  const mix = await MixGraph.create(ctx);
  // For a stem, silence every other channel (they still play, so sidechain pumping is kept)
  // and leave the vinyl bed out.
  const pads = only ? s.pads.map((p, i) => (only.has(i) ? p : { ...p, mute: true, solo: false })) : s.pads;
  const fx = only ? { ...s.fx, vinyl: { level: 0 } } : s.fx;
  mix.apply(pads, fx, s.bpm);
  mix.master.gain.value = s.master;
  const player = new VoicePlayer(ctx, mix, Infinity);
  const start = 0.05;
  for (const e of events) {
    const buf = engine.buffers[e.pad];
    if (!buf) continue;
    const choke = s.samples[e.pad]?.user ? undefined : SOUNDS[e.pad].choke;
    player.play({ pad: e.pad, vel: e.vel, t: start + e.tick * spt, buf, p: s.pads[e.pad], choke, sidechain: s.fx.sidechain, seq: true });
  }
  return ctx.startRendering();
}

const channelsOf = (b: AudioBuffer) => Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));

const safe = (x: string) => x.replace(/[^\w\-.ぁ-んァ-ヶ一-龠]+/g, '_').replace(/^_+|_+$/g, '') || 'pad';

export async function exportWav(source: Source, bits: 16 | 24) {
  const buf = await bounce(source);
  return new Blob([encodeWav(channelsOf(buf), buf.sampleRate, bits)], { type: 'audio/wav' });
}

/** One WAV per pad that has notes, zipped. */
export async function exportStems(source: Source, bits: 16 | 24, onProgress?: (done: number, total: number) => void) {
  const s = useStudio.getState();
  const used = [...new Set(collectEvents(source).events.map((e) => e.pad))].sort((a, b) => a - b);
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < used.length; i++) {
    const pad = used[i];
    const buf = await bounce(source, new Set([pad]));
    const label = `${BANKS[Math.floor(pad / 16)].letter}${String((pad % 16) + 1).padStart(2, '0')}_${safe(padName(s, pad, SOUNDS[pad].name))}`;
    files.push({ name: `${label}.wav`, data: new Uint8Array(encodeWav(channelsOf(buf), buf.sampleRate, bits)) });
    onProgress?.(i + 1, used.length);
  }
  const z = zip(files);
  return new Blob([z.buffer as ArrayBuffer], { type: 'application/zip' });
}

/** Drum-map MIDI: pad p → note 36 + p, one 1/16 long. */
export function exportMidi(source: Source) {
  const s = useStudio.getState();
  const { events } = collectEvents(source);
  const midi = encodeMidi(
    events.map((e) => ({ tick: e.tick, note: 36 + e.pad, vel: e.vel, length: STEP_TICKS })),
    s.bpm,
    PPQ,
  );
  return new Blob([midi.buffer as ArrayBuffer], { type: 'audio/midi' });
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
