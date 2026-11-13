// Starting and stopping pad voices. Shared by the live engine and the offline (export)
// renderer so an exported WAV sounds exactly like playback.
import type { FxState, PadParams } from '../state/store';
import type { MixGraph } from './mixer';
import { velToGain } from './timing';

export interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  pad: number;
  choke?: number;
  start: number;
  seq: boolean;
  gate: boolean;
  release: number;
}

export class VoicePlayer {
  readonly voices: Voice[] = [];
  private reversed = new WeakMap<AudioBuffer, AudioBuffer>();

  constructor(
    private ctx: BaseAudioContext,
    private mix: MixGraph,
    private maxVoices = 48,
  ) {}

  private reverseOf(buf: AudioBuffer) {
    let r = this.reversed.get(buf);
    if (!r) {
      r = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
      for (let c = 0; c < buf.numberOfChannels; c++) r.copyToChannel(buf.getChannelData(c).slice().reverse(), c);
      this.reversed.set(buf, r);
    }
    return r;
  }

  kill(v: Voice, t: number) {
    v.gain.gain.setTargetAtTime(0, t, 0.008);
    try {
      v.src.stop(t + 0.06);
    } catch {
      /* already stopped */
    }
  }

  play(o: {
    pad: number;
    vel: number;
    t: number;
    buf: AudioBuffer;
    p: PadParams;
    choke?: number;
    sidechain: FxState['sidechain'];
    seq: boolean;
  }) {
    const { pad, vel, t, p, choke, seq } = o;
    if (choke) for (const v of this.voices) if (v.choke === choke && v.start <= t) this.kill(v, t);
    if (this.voices.length >= this.maxVoices) this.kill(this.voices[0], t);

    const b = p.reverse ? this.reverseOf(o.buf) : o.buf;
    const lo = Math.min(p.start, p.end);
    const hi = Math.max(p.start, p.end);
    const offset = (p.reverse ? 1 - hi : lo) * b.duration;
    const length = Math.max(0.005, (hi - lo) * b.duration);
    const rate = Math.pow(2, (p.tune + p.fine / 100) / 12);
    const playDur = length / rate;

    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    // Amp envelope (ADSR). Defaults behave like a plain one-shot.
    const gain = this.ctx.createGain();
    const peak = velToGain(vel);
    if (p.attack > 0.001) {
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + p.attack);
    } else gain.gain.setValueAtTime(peak, t);
    if (p.sustain < 0.999) gain.gain.setTargetAtTime(peak * p.sustain, t + p.attack, Math.max(0.005, p.decay / 3));
    if (p.mode === 'oneshot' && p.release > 0.006 && playDur > p.attack + p.release)
      gain.gain.setTargetAtTime(0, t + playDur - p.release, p.release / 4);
    src.connect(gain).connect(this.mix.channels[pad].input);
    src.start(t, offset, length);

    if (o.sidechain.on && pad === o.sidechain.source) this.mix.pump(t, o.sidechain.depth, o.sidechain.release);

    const voice: Voice = { src, gain, pad, choke, start: t, seq, gate: p.mode === 'gate', release: p.release };
    this.voices.push(voice);
    src.onended = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
      gain.disconnect();
    };
    return voice;
  }
}
