import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { formatPosition, TC_GRIDS } from '../audio/sequence';
import { useStudio } from '../state/store';
import { Knob } from './Knob';

const noFocus = (e: React.MouseEvent) => e.preventDefault();

function Counter() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const loop = () => {
      const p = engine.position();
      const txt = p === null ? '001.1.1' : formatPosition(Math.floor(p));
      if (txt !== last && ref.current) ref.current.textContent = last = txt;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={ref} className="tp__counter">001.1.1</span>;
}

function Seg<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      <span className="seg__label">{label}</span>
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={o.v === value}
          className={o.v === value ? 'is-on' : ''}
          onMouseDown={noFocus}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Transport() {
  const playing = useStudio((s) => s.playing);
  const recording = useStudio((s) => s.recording);
  const metronome = useStudio((s) => s.metronome);
  const countIn = useStudio((s) => s.countIn);
  const bars = useStudio((s) => s.pattern.bars);
  const swing = useStudio((s) => s.swing);
  const tcIndex = useStudio((s) => s.tcIndex);
  const tcStrength = useStudio((s) => s.tcStrength);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const erasing = useStudio((s) => s.erasing);
  const s = useStudio.getState();

  return (
    <div className="tp">
      <div className="tp__group">
        <button
          className={`tp__btn tp__play${playing ? ' is-on' : ''}`}
          onMouseDown={noFocus}
          onClick={() => engine.togglePlay()}
          title="再生 / 停止 (Space)"
          aria-label={playing ? 'Stop' : 'Play'}
        >
          {playing ? <span className="ico-stop" /> : <span className="ico-play" />}
        </button>
        <button
          className={`tp__btn tp__rec${recording ? ' is-on' : ''}`}
          onMouseDown={noFocus}
          onClick={() => engine.toggleRecord()}
          title="録音 (Enter)"
          aria-label="Record"
        >
          <span className="ico-rec" />
        </button>
        <div className="tp__display">
          <Counter />
          <span className={`tp__state${recording ? ' rec' : playing ? ' play' : ''}`}>
            {erasing ? 'ERASE' : recording ? 'REC' : playing ? 'PLAY' : 'STOP'}
          </span>
        </div>
      </div>

      <div className="tp__group">
        <button
          className={`tp__toggle${metronome ? ' is-on' : ''}`}
          onMouseDown={noFocus}
          onClick={() => s.toggle('metronome')}
          title="メトロノーム (M)"
        >
          METRO
        </button>
        <button
          className={`tp__toggle${countIn ? ' is-on' : ''}`}
          onMouseDown={noFocus}
          onClick={() => s.toggle('countIn')}
          title="録音前に1小節カウント"
        >
          COUNT-IN
        </button>
        <Seg
          label="BARS"
          value={bars}
          options={[1, 2, 4].map((v) => ({ v, label: String(v) }))}
          onChange={(v) => s.setBars(v)}
        />
      </div>

      <div className="tp__group">
        <Seg
          label="TC"
          value={tcIndex}
          options={TC_GRIDS.map((g, i) => ({ v: i, label: g.label }))}
          onChange={(v) => s.setTc(v)}
        />
        <Knob
          label="STRENGTH"
          value={tcStrength}
          min={0}
          max={1}
          def={1}
          size={38}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => s.setTcStrength(v)}
        />
        <Knob
          label="SWING"
          value={swing}
          min={50}
          max={75}
          step={1}
          def={50}
          size={38}
          color="var(--cyan)"
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => s.setSwing(v)}
        />
      </div>

      <div className="tp__group tp__group--end">
        <button className="tp__small" onMouseDown={noFocus} onClick={() => s.quantizeAll()} title="今のTC設定で全ノートをクオンタイズ">
          QUANTIZE
        </button>
        <button className="tp__small" disabled={!canUndo} onMouseDown={noFocus} onClick={() => s.undo()} title="元に戻す (⌘Z)">
          UNDO
        </button>
        <button className="tp__small" disabled={!canRedo} onMouseDown={noFocus} onClick={() => s.redo()} title="やり直す (⇧⌘Z)">
          REDO
        </button>
        <button className="tp__small tp__danger" onMouseDown={noFocus} onClick={() => s.clearPattern()} title="パターンを全消去（UNDOで戻せます）">
          CLEAR
        </button>
      </div>
    </div>
  );
}
