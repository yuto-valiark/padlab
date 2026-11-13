import { useRef } from 'react';
import { engine } from '../audio/engine';
import { BANKS, SOUNDS } from '../audio/kit';
import { REPEAT_RATES } from '../audio/timing';
import { tap } from '../input/keyboard';
import { padName, useStudio } from '../state/store';
import { Knob } from './Knob';
import { ProjectBar } from './ProjectBar';
import { useCanvas } from './useCanvas';

function Bpm() {
  const bpm = useStudio((s) => s.bpm);
  const setBpm = useStudio((s) => s.setBpm);
  const drag = useRef<{ y: number; v: number } | null>(null);
  return (
    <span
      className="lcd__bpm"
      title="ドラッグでBPM変更（Shiftで細かく）"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, v: bpm };
      }}
      onPointerMove={(e) => {
        if (drag.current) setBpm(drag.current.v + (drag.current.y - e.clientY) * (e.shiftKey ? 0.05 : 0.4));
      }}
      onPointerUp={() => (drag.current = null)}
    >
      {bpm.toFixed(1)}
    </span>
  );
}

function Lcd() {
  const bank = useStudio((s) => s.bank);
  const last = useStudio((s) => s.lastHit);
  const repeatIndex = useStudio((s) => s.repeatIndex);
  const repeatOn = useStudio((s) => s.repeatOn);
  const latency = useStudio((s) => s.latencyMs);
  const stepRepeat = useStudio((s) => s.stepRepeat);
  const vel = last ? Math.round(last.vel * 127) : 0;
  const lastName = useStudio((s) => (s.lastHit ? padName(s, s.lastHit.pad, SOUNDS[s.lastHit.pad].name) : null));
  const segs = 16;
  const lit = Math.round((vel / 127) * segs);

  return (
    <div className="lcd" aria-live="off">
      <div className="lcd__row">
        <span className="lcd__dim">BANK</span>
        <span className="lcd__hot">{BANKS[bank].letter}</span>
        <span>{BANKS[bank].name}</span>
        <span className="lcd__spacer" />
        <span className="lcd__dim">BPM</span>
        <Bpm />
        <button className="lcd__btn" onMouseDown={(e) => e.preventDefault()} onClick={tap} title="タップテンポ (T)">
          TAP
        </button>
      </div>
      <div className="lcd__row lcd__row--big">
        <span className="lcd__hot">
          {last ? `${BANKS[Math.floor(last.pad / 16)].letter}${String((last.pad % 16) + 1).padStart(2, '0')}` : '---'}
        </span>
        <span className="lcd__sound" key={last?.n}>
          {lastName ?? 'PRESS A PAD'}
        </span>
        <span className="lcd__spacer" />
        <span className="lcd__vel">
          {Array.from({ length: segs }, (_, i) => (
            <i key={i} className={i < lit ? 'on' : ''} />
          ))}
        </span>
        <span className="lcd__dim">VEL</span>
        <span className="lcd__num">{String(vel).padStart(3, '0')}</span>
      </div>
      <div className="lcd__row">
        <span className="lcd__dim">NOTE RPT</span>
        <button className="lcd__btn" onMouseDown={(e) => e.preventDefault()} onClick={() => stepRepeat(-1)}>
          ◀
        </button>
        <span className="lcd__num">{REPEAT_RATES[repeatIndex].label}</span>
        <button className="lcd__btn" onMouseDown={(e) => e.preventDefault()} onClick={() => stepRepeat(1)}>
          ▶
        </button>
        <span className={`lcd__flag${repeatOn ? ' on' : ''}`}>{repeatOn ? 'ON' : 'HOLD ⌥'}</span>
        <span className="lcd__spacer" />
        <span className="lcd__dim">LAT</span>
        <span className="lcd__num">{latency === null ? '--.-' : latency.toFixed(1)}ms</span>
      </div>
    </div>
  );
}

function Meter() {
  const state = useRef({ peak: 0, hold: 0, holdT: 0 });
  const buf = useRef<Float32Array<ArrayBuffer> | null>(null);
  const ref = useCanvas((g, w, h) => {
    const an = engine.ctx ? engine.analyser : null;
    let p = 0;
    if (an) {
      buf.current ??= new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf.current);
      for (const v of buf.current) p = Math.max(p, Math.abs(v));
    }
    const s = state.current;
    s.peak = Math.max(p, s.peak * 0.88);
    const now = performance.now();
    if (p >= s.hold || now - s.holdT > 900) {
      s.hold = p;
      s.holdT = now;
    }
    const db = (x: number) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(x, 1e-5)) + 48) / 48));
    g.clearRect(0, 0, w, h);
    const n = 24;
    const gap = 2;
    const sw = (w - gap * (n - 1)) / n;
    const lit = db(s.peak) * n;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const col = f > 0.9 ? '#ff4b3e' : f > 0.72 ? '#ffcf5a' : '#ffa630';
      g.fillStyle = i < lit ? col : 'rgba(239,230,212,0.08)';
      g.fillRect(i * (sw + gap), 0, sw, h);
    }
    const hx = Math.min(n - 1, Math.floor(db(s.hold) * n));
    if (s.hold > 0.001) {
      g.fillStyle = '#fff3d6';
      g.fillRect(hx * (sw + gap), 0, sw, h);
    }
  }, true);
  return <canvas className="meter" ref={ref} />;
}

export function TopBar() {
  const master = useStudio((s) => s.master);
  const setMaster = useStudio((s) => s.setMaster);
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand__mark">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div>
          <div className="brand__name">PADLAB</div>
          <ProjectBar />
        </div>
      </div>
      <Lcd />
      <div className="masterbox">
        <div className="masterbox__meter">
          <span className="lcd__dim">OUT</span>
          <Meter />
        </div>
        <Knob
          label="MASTER"
          value={master}
          min={0}
          max={1.2}
          def={0.8}
          size={50}
          format={(v) => (v <= 0.001 ? '-∞' : `${(20 * Math.log10(v)).toFixed(1)}dB`)}
          onChange={setMaster}
        />
      </div>
    </header>
  );
}
