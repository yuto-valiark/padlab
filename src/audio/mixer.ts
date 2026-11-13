// The mixing graph: 64 persistent pad channels, two send effects, sidechain ducking
// and a master chain. Voices plug into `channels[pad].input`.
//
//  voice → [ch.input → filter → pan → level] ─┬→ out → (duckBus | dryBus)
//                                             ├→ sendRev → reverb → tone → return ─┐
//                                             └→ sendDly → delay ⟲ tone → return ──┤
//  duckBus → duck gain (sidechain) ──────────────────────────────────────────────→ dryBus
//  dryBus → EQ(low/mid/high) → tape → lo-fi → comp → makeup → limiter → master → analyser → out
import type { FxState, PadParams } from '../state/store';
import { rng } from './dsp';

interface Channel {
  input: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  level: GainNode;
  out: GainNode;
  rev: GainNode;
  dly: GainNode;
  ducked: boolean | null;
}

const LOFI_WORKLET = `
class Lofi extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 16, minValue: 2, maxValue: 16 },
      { name: 'down', defaultValue: 1, minValue: 1, maxValue: 50 },
    ];
  }
  constructor() { super(); this.ph = 0; this.hold = [0, 0]; }
  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0];
    if (!inp.length) return true;
    const bits = p.bits[0], down = p.down[0];
    if (bits >= 15.99 && down <= 1.01) {
      for (let c = 0; c < out.length; c++) out[c].set(inp[Math.min(c, inp.length - 1)]);
      return true;
    }
    const step = Math.pow(2, bits - 1);
    const n = out[0].length;
    for (let i = 0; i < n; i++) {
      this.ph += 1;
      const take = this.ph >= down;
      if (take) this.ph -= down;
      for (let c = 0; c < out.length; c++) {
        const x = inp[Math.min(c, inp.length - 1)][i];
        if (take) this.hold[c] = Math.round(x * step) / step;
        out[c][i] = this.hold[c];
      }
    }
    return true;
  }
}
registerProcessor('padlab-lofi', Lofi);
`;

function tapeCurve(drive: number) {
  if (drive <= 0.001) return null;
  const k = 1 + drive * 8;
  const n = 2048;
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // Asymmetric soft clip = a touch of even harmonics, like tape.
    c[i] = Math.tanh(k * x + 0.15 * drive * x * x) / norm;
  }
  return c;
}

function impulse(ctx: BaseAudioContext, seconds: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  // Scale so the wet signal sits around the dry level regardless of length
  // (the convolver's own normalization makes long tails far too quiet).
  const amp = 1.4 / Math.sqrt((ctx.sampleRate * seconds) / 13.8);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(ch + 3);
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      // 60 dB down at `seconds`, with a short pre-delay fade-in.
      d[i] = amp * (r() * 2 - 1) * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.008);
    }
  }
  return b;
}

function crackle(ctx: BaseAudioContext) {
  const len = ctx.sampleRate * 4;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(40 + ch);
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += (r() * 2 - 1 - lp) * 0.05;
      d[i] = lp * 0.08;
      if (r() < 0.0004) {
        const a = (0.2 + r() * 0.6) * (r() < 0.5 ? -1 : 1);
        for (let k = 0; k < 30 && i + k < len; k++) d[i + k] += a * Math.exp(-k / 5) * (r() * 2 - 1);
      }
    }
  }
  return b;
}

export class MixGraph {
  readonly channels: Channel[] = [];
  readonly analyser: AnalyserNode;
  readonly master: GainNode;
  private dry: GainNode;
  private duck: GainNode;
  private revIn: GainNode;
  private convolver: ConvolverNode;
  private revTone: BiquadFilterNode;
  private revRet: GainNode;
  private dlyIn: GainNode;
  private delay: DelayNode;
  private dlyTone: BiquadFilterNode;
  private dlyFb: GainNode;
  private dlyRet: GainNode;
  private eqLow: BiquadFilterNode;
  private eqMid: BiquadFilterNode;
  private eqHigh: BiquadFilterNode;
  private tape: WaveShaperNode;
  private tapeTrim: GainNode;
  private lofi: AudioWorkletNode | null = null;
  private comp: DynamicsCompressorNode;
  private makeup: GainNode;
  private vinyl: GainNode;
  private prevPads: PadParams[] = [];
  private prevFx: FxState | null = null;
  private revSize = 0;
  private sidechainSource = -1;
  private sidechainOn = false;

  private constructor(private ctx: BaseAudioContext, lofiOk: boolean) {
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.dry = g(0.8);
    this.duck = g();
    this.duck.connect(this.dry);

    // Reverb send
    this.revIn = g();
    this.convolver = ctx.createConvolver();
    this.convolver.normalize = false;
    this.revTone = ctx.createBiquadFilter();
    this.revTone.type = 'lowpass';
    this.revRet = g();
    this.revIn.connect(this.convolver).connect(this.revTone).connect(this.revRet).connect(this.dry);

    // Delay send (feedback loop through a tone filter)
    this.dlyIn = g();
    this.delay = ctx.createDelay(4);
    this.dlyTone = ctx.createBiquadFilter();
    this.dlyTone.type = 'lowpass';
    this.dlyFb = g(0.35);
    this.dlyRet = g();
    this.dlyIn.connect(this.delay);
    this.delay.connect(this.dlyTone).connect(this.dlyFb).connect(this.delay);
    this.dlyTone.connect(this.dlyRet).connect(this.dry);

    // Vinyl bed
    this.vinyl = g(0);
    const v = ctx.createBufferSource();
    v.buffer = crackle(ctx);
    v.loop = true;
    v.connect(this.vinyl).connect(this.dry);
    v.start();

    // Master chain
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 120;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.Q.value = 0.9;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 8000;
    this.tape = ctx.createWaveShaper();
    this.tape.oversample = '2x';
    this.tapeTrim = g();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.knee.value = 8;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.15;
    this.makeup = g();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    this.master = g();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;

    let node: AudioNode = this.dry.connect(this.eqLow).connect(this.eqMid).connect(this.eqHigh).connect(this.tape).connect(this.tapeTrim);
    if (lofiOk) {
      this.lofi = new AudioWorkletNode(ctx, 'padlab-lofi', { outputChannelCount: [2] });
      node = node.connect(this.lofi);
    }
    node.connect(this.comp).connect(this.makeup).connect(limiter).connect(this.master).connect(this.analyser).connect(ctx.destination);

    for (let i = 0; i < 64; i++) {
      const ch: Channel = {
        input: g(),
        filter: ctx.createBiquadFilter(),
        pan: ctx.createStereoPanner(),
        level: g(),
        out: g(),
        rev: g(0),
        dly: g(0),
        ducked: null,
      };
      ch.filter.type = 'allpass';
      ch.input.connect(ch.filter).connect(ch.pan).connect(ch.level);
      ch.level.connect(ch.out);
      ch.level.connect(ch.rev).connect(this.revIn);
      ch.level.connect(ch.dly).connect(this.dlyIn);
      this.channels.push(ch);
    }
  }

  static async create(ctx: BaseAudioContext) {
    let ok = false;
    try {
      const url = URL.createObjectURL(new Blob([LOFI_WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      ok = true;
    } catch {
      /* no worklet support — lo-fi stays off */
    }
    return new MixGraph(ctx, ok);
  }

  private route(i: number) {
    const ch = this.channels[i];
    const ducked = this.sidechainOn && i !== this.sidechainSource;
    if (ch.ducked === ducked) return;
    ch.out.disconnect();
    ch.out.connect(ducked ? this.duck : this.dry);
    ch.ducked = ducked;
  }

  /** Push store state into the graph. Cheap to call often: only changed parts are touched. */
  apply(pads: PadParams[], fx: FxState, bpm: number) {
    const t = this.ctx.currentTime;
    const ramp = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.015);
    const anySolo = pads.some((p) => p.solo);
    const soloChanged = anySolo !== this.prevPads.some((p) => p?.solo);

    const sc = fx.sidechain;
    const scChanged = sc.on !== this.sidechainOn || sc.source !== this.sidechainSource;
    this.sidechainOn = sc.on;
    this.sidechainSource = sc.source;

    pads.forEach((p, i) => {
      const prev = this.prevPads[i];
      const ch = this.channels[i];
      if (scChanged || ch.ducked === null) this.route(i);
      if (p === prev && !soloChanged) return;
      if (!prev || p.filter !== prev.filter) ch.filter.type = p.filter === 'off' ? 'allpass' : p.filter === 'lp' ? 'lowpass' : p.filter === 'hp' ? 'highpass' : 'bandpass';
      ramp(ch.filter.frequency, p.filter === 'off' ? 1000 : p.cutoff);
      ramp(ch.filter.Q, p.filter === 'off' ? 0.0001 : p.reso);
      ramp(ch.pan.pan, p.pan);
      const audible = !p.mute && (!anySolo || p.solo);
      ramp(ch.level.gain, audible ? p.volume : 0);
      ramp(ch.rev.gain, p.sendRev);
      ramp(ch.dly.gain, p.sendDly);
    });
    this.prevPads = pads;

    const pf = this.prevFx;
    if (!pf || fx.reverb !== pf.reverb) {
      if (Math.abs(fx.reverb.size - this.revSize) > 0.01) {
        this.convolver.buffer = impulse(this.ctx, fx.reverb.size);
        this.revSize = fx.reverb.size;
      }
      ramp(this.revTone.frequency, fx.reverb.tone);
      ramp(this.revRet.gain, fx.reverb.level);
    }
    // Delay time follows the tempo: div is in beats (0.75 = dotted 1/8).
    ramp(this.delay.delayTime, Math.min(3.9, (60 / bpm) * fx.delay.div));
    if (!pf || fx.delay !== pf.delay) {
      ramp(this.dlyFb.gain, Math.min(0.92, fx.delay.feedback));
      ramp(this.dlyTone.frequency, fx.delay.tone);
      ramp(this.dlyRet.gain, fx.delay.level);
    }
    if (!pf || fx.eq !== pf.eq) {
      ramp(this.eqLow.gain, fx.eq.low);
      ramp(this.eqMid.gain, fx.eq.mid);
      ramp(this.eqMid.frequency, fx.eq.midFreq);
      ramp(this.eqHigh.gain, fx.eq.high);
    }
    if (!pf || fx.tape !== pf.tape) {
      this.tape.curve = tapeCurve(fx.tape.drive);
      ramp(this.tapeTrim.gain, 1 / (1 + fx.tape.drive * 0.6));
    }
    if (this.lofi && (!pf || fx.lofi !== pf.lofi)) {
      this.lofi.parameters.get('bits')!.setValueAtTime(fx.lofi.bits, t);
      this.lofi.parameters.get('down')!.setValueAtTime(fx.lofi.down, t);
    }
    if (!pf || fx.comp !== pf.comp) {
      ramp(this.comp.threshold, fx.comp.threshold);
      ramp(this.comp.ratio, fx.comp.ratio);
      ramp(this.makeup.gain, Math.pow(10, fx.comp.makeup / 20));
    }
    if (!pf || fx.vinyl !== pf.vinyl) ramp(this.vinyl.gain, fx.vinyl.level);
    this.prevFx = fx;
  }

  /** Sidechain: dip everything except the source pad when the source hits at time t. */
  pump(t: number, depth: number, release: number) {
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(1 - depth, t, 0.004);
    g.setTargetAtTime(1, t + 0.03, release / 3);
  }

  isSidechainSource(pad: number) {
    return this.sidechainOn && pad === this.sidechainSource;
  }

  lofiAvailable() {
    return !!this.lofi;
  }
}
