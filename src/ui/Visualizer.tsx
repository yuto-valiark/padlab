import { useRef } from 'react';
import { engine } from '../audio/engine';
import { CAT_COLOR, SOUNDS } from '../audio/kit';
import { useStudio } from '../state/store';
import { useCanvas } from './useCanvas';

const WINDOW = 4; // seconds of history shown in the trail

/** Scrolling "hit trail": every hit is drawn in its pad's lane, so you can SEE your timing. */
function Trail() {
  const ref = useCanvas((g, w, h) => {
    const now = engine.now();
    const bpm = useStudio.getState().bpm;
    const beat = 60 / bpm;
    const pxs = w / WINDOW;
    g.clearRect(0, 0, w, h);

    const lanes = 16;
    const lh = h / lanes;
    for (let i = 0; i < lanes; i++) {
      g.fillStyle = i % 4 === 0 ? 'rgba(239,230,212,0.035)' : 'rgba(0,0,0,0)';
      g.fillRect(0, h - (i + 1) * lh, w, lh);
    }

    // Beat grid scrolling with time (anchored to the audio clock).
    const first = Math.ceil((now - WINDOW) / beat);
    for (let k = first; k * beat <= now; k++) {
      const x = w - (now - k * beat) * pxs;
      const bar = k % 4 === 0;
      g.fillStyle = bar ? 'rgba(255,166,48,0.22)' : 'rgba(239,230,212,0.07)';
      g.fillRect(Math.round(x), 0, 1, h);
    }

    for (const hit of engine.history) {
      const age = now - hit.time;
      if (age > WINDOW || age < 0) continue;
      const x = w - age * pxs;
      const lane = hit.pad % 16;
      const y = h - (lane + 1) * lh;
      const c = CAT_COLOR[SOUNDS[hit.pad].cat];
      const fresh = Math.max(0, 1 - age * 3);
      g.globalAlpha = 0.35 + 0.65 * hit.vel;
      g.fillStyle = c;
      const bw = 3 + fresh * 5;
      g.fillRect(x - bw / 2, y + 2, bw, lh - 4);
      if (fresh > 0) {
        g.globalAlpha = fresh * 0.5;
        g.shadowColor = c;
        g.shadowBlur = 16;
        g.fillRect(x - bw / 2, y + 2, bw, lh - 4);
        g.shadowBlur = 0;
      }
      g.globalAlpha = 1;
    }

    // "Now" line
    const grad = g.createLinearGradient(w - 60, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,166,48,0)');
    grad.addColorStop(1, 'rgba(255,166,48,0.18)');
    g.fillStyle = grad;
    g.fillRect(w - 60, 0, 60, h);
    g.fillStyle = '#ffa630';
    g.fillRect(w - 2, 0, 2, h);
  }, true);
  return <canvas ref={ref} className="trail" />;
}

function Spectrum() {
  const buf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smooth = useRef<Float32Array | null>(null);
  const ref = useCanvas((g, w, h) => {
    g.clearRect(0, 0, w, h);
    // The analyser appears a moment after the AudioContext (the mixer is built async).
    if (!engine.ctx || !engine.analyser) return;
    const an = engine.analyser;
    buf.current ??= new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(buf.current);
    const bars = 48;
    smooth.current ??= new Float32Array(bars);
    const ny = engine.ctx.sampleRate / 2;
    const gap = 2;
    const bw = (w - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      // Log-spaced bands from 30Hz to 16kHz.
      const f0 = 30 * Math.pow(16000 / 30, i / bars);
      const f1 = 30 * Math.pow(16000 / 30, (i + 1) / bars);
      const b0 = Math.floor((f0 / ny) * buf.current.length);
      const b1 = Math.max(b0 + 1, Math.floor((f1 / ny) * buf.current.length));
      let m = 0;
      for (let b = b0; b < b1; b++) m = Math.max(m, buf.current[b]);
      const v = m / 255;
      smooth.current[i] = Math.max(v, smooth.current[i] * 0.9);
      const bh = Math.max(1, smooth.current[i] * (h - 4));
      const t = i / bars;
      g.fillStyle = `hsl(${32 - t * 20}, 100%, ${48 + smooth.current[i] * 22}%)`;
      g.globalAlpha = 0.35 + 0.65 * smooth.current[i];
      g.fillRect(i * (bw + gap), h - bh, bw, bh);
    }
    g.globalAlpha = 1;
  }, true);
  return <canvas ref={ref} className="spectrum" />;
}

export function Visualizer() {
  return (
    <section className="panel viz">
      <header className="panel__head">
        <span className="panel__title">HIT TRAIL</span>
        <span className="panel__hint">最後の4秒間の演奏 · 縦線＝拍 · オレンジ線＝小節</span>
      </header>
      <div className="viz__body">
        <Trail />
        <div className="viz__spec">
          <Spectrum />
          <div className="viz__scale">
            <span>30</span>
            <span>200</span>
            <span>1k</span>
            <span>5k</span>
            <span>16k</span>
          </div>
        </div>
      </div>
    </section>
  );
}
