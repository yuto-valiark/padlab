// The audio engine. Design goals, in order:
//  1. A key press must reach the speaker as fast as the OS allows. Every sound is a
//     pre-rendered AudioBuffer, so a hit is just "start this buffer now".
//  2. Everything timed (sequencer, metronome, note repeat) uses the AudioContext clock
//     (sample-accurate), driven by a look-ahead scheduler — never setTimeout timing.
import { renderKit, SOUNDS } from './kit';
import { MixGraph } from './mixer';
import { segmentAt, songLayout } from './song';
import { VoicePlayer } from './voices';
import { BAR_TICKS, loopTicks, PPQ, quantizeTick, STEP_TICKS, swingOffset, TC_GRIDS } from './sequence';
import { nextGridTime, REPEAT_RATES, repeatInterval } from './timing';
import { useStudio } from '../state/store';

export interface HitEvent { pad: number; vel: number; time: number; seq?: boolean }


/** While set, the transport plays these notes instead of the sequencer pattern. */
export interface PracticeRun {
  notes: { pad: number; vel: number; abs: number }[];
  play: boolean;
  endTick: number;
  onEnd: () => void;
}

type UserHitFn = (pad: number, vel: number, tick: number) => void;

const LOOKAHEAD = 0.08; // seconds scheduled ahead of the clock
const HISTORY = 400;

async function renderClick(sampleRate: number, f: number) {
  const c = new OfflineAudioContext(1, Math.ceil(0.05 * sampleRate), sampleRate);
  const o = c.createOscillator();
  o.frequency.value = f;
  const g = c.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(1, 0.001);
  g.gain.exponentialRampToValueAtTime(0.001, 0.045);
  o.connect(g).connect(c.destination);
  o.start(0);
  return c.startRendering();
}

class Engine {
  ctx: AudioContext | null = null;
  buffers: AudioBuffer[] = [];
  /** The synthesized stock kit, kept so a pad can be reset after loading a sample. */
  kitBuffers: AudioBuffer[] = [];
  analyser!: AnalyserNode;
  mix!: MixGraph;
  private player!: VoicePlayer;
  private metroOut!: GainNode;
  private clicks: AudioBuffer[] = [];
  private repeats = new Map<number, { next: number; vel: number }>();
  private pending: HitEvent[] = [];
  /** Recent hits (already sounded), newest last. Read by the visualizers. */
  readonly history: HitEvent[] = [];
  private worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;

  // Transport. Position (ticks) = anchorTick + (time - anchorTime) / secondsPerTick.
  private playing = false;
  private anchorTime = 0;
  private anchorTick = 0;
  private scheduledTo = 0; // absolute tick up to which notes are scheduled
  private bpm = useStudio.getState().bpm;
  /** Note ids recorded this pass that must not be re-triggered in loop iteration `k`. */
  private skip = new Map<number, number>();
  private practice: PracticeRun | null = null;
  private userHitFns = new Set<UserHitFn>();

  init(onProgress: (done: number, total: number) => void) {
    this.initPromise ??= this.doInit(onProgress);
    return this.initPromise;
  }

  private async doInit(onProgress: (done: number, total: number) => void) {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.mix = await MixGraph.create(ctx);
    this.analyser = this.mix.analyser;
    this.player = new VoicePlayer(ctx, this.mix);
    const st = useStudio.getState();
    this.mix.master.gain.value = st.master;
    this.mix.apply(st.pads, st.fx, st.bpm);
    // The click skips the analyser so it doesn't clutter the meters.
    this.metroOut = ctx.createGain();
    this.metroOut.gain.value = 0.35;
    this.metroOut.connect(ctx.destination);

    useStudio.subscribe((s, prev) => {
      if (s.master !== prev.master) this.mix.master.gain.setTargetAtTime(s.master, ctx.currentTime, 0.02);
      if (s.bpm !== prev.bpm) this.changeTempo(s.bpm);
      if (s.pads !== prev.pads || s.fx !== prev.fx || s.bpm !== prev.bpm) this.mix.apply(s.pads, s.fx, s.bpm);
    });

    this.clicks = await Promise.all([renderClick(ctx.sampleRate, 1760), renderClick(ctx.sampleRate, 1180)]);
    this.kitBuffers = await renderKit(ctx.sampleRate, onProgress);
    this.buffers = this.kitBuffers.slice();
  }

  /** Put a new sound on a pad (a loaded file or a chop slice). */
  setBuffer(pad: number, buf: AudioBuffer, name: string) {
    this.buffers[pad] = buf;
    useStudio.getState().setSample(pad, { name, user: true });
  }

  /** Back to the stock synth sound and default settings. */
  resetPad(pad: number) {
    this.buffers[pad] = this.kitBuffers[pad];
    const s = useStudio.getState();
    s.setSample(pad, { name: SOUNDS[pad].name, user: false });
    s.resetPad(pad);
  }


  async powerOn() {
    const ctx = this.ctx;
    if (!ctx) return;
    await ctx.resume();
    if (!this.worker) {
      this.worker = new Worker(new URL('./clock.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = () => this.schedule();
      this.worker.postMessage({ cmd: 'start', ms: 15 });
    }
  }

  /** Output latency in ms as reported by the browser (base + device). */
  latencyMs() {
    const ctx = this.ctx;
    if (!ctx) return null;
    return ((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000;
  }

  now() {
    return this.ctx?.currentTime ?? 0;
  }

  // ─── Voices ───────────────────────────────────────────────────────────────

  /** Play a pad at `when` (AudioContext time; defaults to right now). */
  trigger(pad: number, vel: number, when = 0, seq = false) {
    const ctx = this.ctx;
    const buf = this.buffers[pad];
    if (!ctx || !buf) return;
    const t = Math.max(when, ctx.currentTime);
    const st = useStudio.getState();
    const p = st.pads[pad];
    // Stock sounds keep their kit choke groups (open/closed hat…); your own samples don't.
    const choke = st.samples[pad]?.user ? undefined : SOUNDS[pad].choke;

    this.player.play({ pad, vel, t, buf, p, choke, sidechain: st.fx.sidechain, seq });
    this.pending.push({ pad, vel, time: t, seq });
  }

  /** Drop voices (and their flashes) that were scheduled but haven't sounded yet. */
  private cancelFuture(match: (v: { pad: number; seq?: boolean }) => boolean) {
    const now = this.now() + 0.002;
    for (const v of this.player.voices) if (v.start > now && match(v)) v.src.stop();
    this.pending = this.pending.filter((h) => !(h.time > now && match(h)));
  }

  private click(t: number, accent: boolean) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.clicks[accent ? 0 : 1];
    src.connect(this.metroOut);
    src.start(t);
  }

  // ─── Pads & note repeat ───────────────────────────────────────────────────

  padDown(pad: number, vel: number, repeat: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.trigger(pad, vel, now);
    this.recordHit(pad, vel, now, true);
    this.emitUserHit(pad, vel, now, true);
    if (repeat) this.startRepeat(pad, vel, now, true);
  }

  padUp(pad: number) {
    this.stopRepeat(pad);
    // Gate-mode pads stop (with their release) when you let go.
    const now = this.now();
    for (const v of this.player.voices) {
      if (v.pad !== pad || v.seq || !v.gate || v.start > now) continue;
      const r = Math.max(0.01, v.release);
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0, now, r / 4);
      try {
        v.src.stop(now + r + 0.05);
      } catch {
        /* already stopped */
      }
    }
  }

  private interval() {
    const s = useStudio.getState();
    return repeatInterval(s.bpm, REPEAT_RATES[s.repeatIndex].div);
  }

  private startRepeat(pad: number, vel: number, now: number, justHit: boolean) {
    const iv = this.interval();
    const from = now + (justHit ? 0.01 : 0);
    // Lock to the grid of any pad already rolling, else to the song grid when playing.
    const other = this.repeats.values().next().value;
    let next: number;
    if (other) next = nextGridTime(from, other.next, iv);
    else if (this.playing) next = nextGridTime(from, this.timeAt(0), iv);
    else next = justHit ? now + iv : now;
    this.repeats.set(pad, { next, vel });
  }

  private stopRepeat(pad: number) {
    if (!this.repeats.delete(pad)) return;
    this.cancelFuture((v) => v.pad === pad && !v.seq);
  }

  setRepeat(on: boolean, held: { pad: number; vel: number }[]) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (on) for (const h of held) this.startRepeat(h.pad, h.vel, ctx.currentTime, false);
    else for (const pad of [...this.repeats.keys()]) this.stopRepeat(pad);
  }

  stopAll() {
    for (const pad of [...this.repeats.keys()]) this.stopRepeat(pad);
  }

  // ─── Transport ────────────────────────────────────────────────────────────

  private spt() {
    return 60 / this.bpm / PPQ;
  }
  private tickAt(t: number) {
    return this.anchorTick + (t - this.anchorTime) / this.spt();
  }
  private timeAt(tick: number) {
    return this.anchorTime + (tick - this.anchorTick) * this.spt();
  }

  private changeTempo(bpm: number) {
    if (this.playing && this.ctx) {
      // Re-anchor at "now" with the old tempo so the position doesn't jump.
      const now = this.ctx.currentTime;
      this.anchorTick = this.tickAt(now);
      this.anchorTime = now;
    }
    this.bpm = bpm;
  }

  secPerTick() {
    return this.spt();
  }

  /** Subscribe to the player's own hits while the transport runs (tick is latency-compensated). */
  onUserHit(fn: UserHitFn) {
    this.userHitFns.add(fn);
    return () => void this.userHitFns.delete(fn);
  }

  private emitUserHit(pad: number, vel: number, t: number, human: boolean) {
    if (!this.playing || !this.userHitFns.size) return;
    const lat = human ? (this.latencyMs() ?? 0) / 1000 : 0;
    const tick = this.tickAt(t - lat);
    this.userHitFns.forEach((f) => f(pad, vel, tick));
  }

  /** Start a practice run (count-in included). Pass null to leave practice mode. */
  startPractice(run: PracticeRun | null, countIn = true) {
    this.stop();
    this.practice = run;
    if (run) this.play(countIn);
  }

  /** In song mode: which arrangement segment is being heard right now. */
  songPosition() {
    const tick = this.position();
    const s = useStudio.getState();
    if (tick === null || tick < 0 || !s.songMode) return null;
    const { segments, total } = songLayout(s.song, s.patterns);
    const seg = segmentAt(segments, total, tick);
    if (!seg) return null;
    const t = ((tick % total) + total) % total;
    return { seg, local: t - seg.start, total, songTick: t };
  }

  isPlaying() {
    return this.playing;
  }

  /** Current position in ticks (negative during count-in), or null when stopped. */
  position() {
    if (!this.playing || !this.ctx) return null;
    // Show what is being HEARD, not what is being scheduled.
    const lat = (this.latencyMs() ?? 0) / 1000;
    return this.tickAt(this.ctx.currentTime - lat);
  }

  play(withCountIn = false) {
    const ctx = this.ctx;
    if (!ctx || this.playing) return;
    this.bpm = useStudio.getState().bpm;
    this.anchorTime = ctx.currentTime + 0.05;
    this.anchorTick = withCountIn ? -BAR_TICKS : 0;
    this.scheduledTo = this.anchorTick;
    this.skip.clear();
    this.playing = true;
    useStudio.getState().setTransport({ playing: true });
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.practice = null;
    this.cancelFuture((v) => !!v.seq);
    useStudio.getState().setTransport({ playing: false, recording: false });
  }

  /** Toggle record. If stopped, starts playback (with optional 1-bar count-in). */
  toggleRecord() {
    const s = useStudio.getState();
    if (this.practice) return;
    if (s.songMode && !s.recording) {
      s.setNotice('ソングモード中は録音できません。PATTERN モードに戻して、パターンごとに録音してください。');
      return;
    }
    if (s.recording) {
      s.setTransport({ recording: false });
      return;
    }
    s.checkpoint(); // the whole take is one undo step
    s.setTransport({ recording: true });
    if (!this.playing) this.play(s.countIn);
  }

  togglePlay() {
    if (this.playing) this.stop();
    else this.play(false);
  }

  /** Write a live hit into the pattern (with timing-correct), if recording. */
  private recordHit(pad: number, vel: number, t: number, human: boolean) {
    const s = useStudio.getState();
    if (!this.playing || !s.recording || this.practice) return;
    // A human hits along with what they HEAR, which is delayed by output latency.
    const lat = human ? (this.latencyMs() ?? 0) / 1000 : 0;
    let abs = this.tickAt(t - lat);
    const grid = TC_GRIDS[s.tcIndex].ticks || PPQ / 4;
    if (abs < 0) {
      if (abs < -grid / 2) return; // during count-in: not recorded
      abs = 0; // a hair early for the downbeat — that counts
    }
    const L = loopTicks(s.pattern.bars);
    const tick = quantizeTick(abs, TC_GRIDS[s.tcIndex].ticks, s.tcStrength, L);
    const id = s.recordNote(pad, tick, vel);
    // The hit already sounded. If its quantized spot is still ahead of the scheduler,
    // make sure this loop pass doesn't play it a second time.
    const k = Math.floor(abs / L);
    let noteAbs = k * L + tick;
    if (noteAbs < abs - L / 2) noteAbs += L; // quantized forward across the loop seam
    if (noteAbs >= this.scheduledTo) this.skip.set(id, Math.floor(noteAbs / L));
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;

    if (this.playing) {
      const s = useStudio.getState();
      const from = this.scheduledTo;
      const to = this.tickAt(now + LOOKAHEAD);
      if (to > from) {
        this.scheduledTo = to;

        // Metronome (always during count-in).
        for (let b = Math.ceil(from / PPQ); b * PPQ < to; b++) {
          if (b < 0 || s.metronome) this.click(this.timeAt(b * PPQ), b % 4 === 0);
        }

        const run = this.practice;
        const a = Math.max(from, 0);
        if (run) {
          if (run.play)
            for (const n of run.notes) if (n.abs >= from && n.abs < to) this.trigger(n.pad, n.vel, this.timeAt(n.abs), true);
          if (from >= run.endTick) {
            // Let the last notes ring out in the visuals before ending.
            const done = run.onEnd;
            this.stop();
            done();
          }
        } else if (a < to) {
          const song = s.songMode ? songLayout(s.song, s.patterns) : null;
          if (song && song.total > 0) {
            // Song mode: walk the arrangement, looping the whole song.
            for (let k = Math.floor(a / song.total); k * song.total < to; k++) {
              for (const seg of song.segments) {
                const base = k * song.total + seg.start;
                if (base >= to || base + seg.length + STEP_TICKS < a) continue;
                for (const n of s.patterns[seg.pattern].notes) {
                  const abs = base + n.tick + swingOffset(n.tick, s.swing);
                  if (abs >= a && abs < to) this.trigger(n.pad, n.vel, this.timeAt(abs), true);
                }
              }
            }
          } else {
          // Sequencer pattern.
          const L = loopTicks(s.pattern.bars);
          for (let k = Math.floor(a / L); k <= Math.floor(to / L); k++) {
            for (const n of s.pattern.notes) {
              const abs = k * L + n.tick + swingOffset(n.tick, s.swing);
              if (abs < a || abs >= to) continue;
              if (this.skip.get(n.id) === k) {
                this.skip.delete(n.id);
                continue;
              }
              this.trigger(n.pad, n.vel, this.timeAt(abs), true);
            }
          }
          }
        }
      }
    }

    if (this.repeats.size) {
      const horizon = now + LOOKAHEAD;
      const iv = this.interval();
      for (const [pad, r] of this.repeats) {
        // If the tab stalled, skip missed steps instead of firing a burst.
        if (r.next < now - iv) r.next = nextGridTime(now, r.next, iv);
        while (r.next < horizon) {
          this.trigger(pad, r.vel, r.next);
          this.recordHit(pad, r.vel, r.next, false);
          this.emitUserHit(pad, r.vel, r.next, false);
          r.next += iv;
        }
      }
    }
  }

  /** Hits whose time has come (for drawing). Moves them into `history`. */
  takeDueHits(): HitEvent[] {
    const ctx = this.ctx;
    if (!ctx || this.pending.length === 0) return [];
    const now = ctx.currentTime;
    const due: HitEvent[] = [];
    const rest: HitEvent[] = [];
    for (const h of this.pending) (h.time <= now + 0.004 ? due : rest).push(h);
    this.pending = rest;
    if (due.length) {
      this.history.push(...due);
      if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);
    }
    return due;
  }
}

export const engine = new Engine();

// Handy for debugging in the browser console during development.
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __engine: Engine }).__engine = engine;
