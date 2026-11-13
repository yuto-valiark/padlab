import { useEffect, useState } from 'react';
import { engine } from '../audio/engine';
import { BANKS, SOUNDS } from '../audio/kit';
import { DEFAULT_FX, padName, useStudio, type FxState } from '../state/store';
import { Knob } from './Knob';
import { onAnyHit } from './hitBus';

const noFocus = (e: React.MouseEvent) => e.preventDefault();
const pct = (v: number) => `${Math.round(v * 100)}`;
const toHz = (x: number) => 20 * Math.pow(1000, x);
const fromHz = (f: number) => Math.log(f / 20) / Math.log(1000);
const hz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${Math.round(f)}`);
const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

const DELAY_DIVS = [
  { v: 0.25, l: '1/16' },
  { v: 0.5, l: '1/8' },
  { v: 0.75, l: '1/8D' },
  { v: 1, l: '1/4' },
  { v: 1.5, l: '1/4D' },
];

/** One-click starting points. They only touch the master FX, not your pads. */
const PRESETS: { name: string; fx: Partial<{ [K in keyof FxState]: Partial<FxState[K]> }> }[] = [
  { name: 'CLEAN', fx: DEFAULT_FX },
  {
    name: 'LO-FI',
    fx: { tape: { drive: 0.35 }, lofi: { bits: 10, down: 3 }, vinyl: { level: 0.5 }, eq: { low: 2, mid: -1, midFreq: 900, high: -6 }, comp: { threshold: -18, ratio: 3, makeup: 2 } },
  },
  {
    name: 'TAPE WARM',
    fx: { tape: { drive: 0.55 }, lofi: { bits: 16, down: 1 }, vinyl: { level: 0.12 }, eq: { low: 1.5, mid: 0, midFreq: 1000, high: -2 }, comp: { threshold: -16, ratio: 2.5, makeup: 1.5 } },
  },
  {
    name: 'PUMP',
    fx: { sidechain: { on: true, source: 0, depth: 0.7, release: 0.22 }, comp: { threshold: -20, ratio: 4, makeup: 3 } },
  },
];

function Module({ title, on, children, desc }: { title: string; on?: boolean; desc: string; children: React.ReactNode }) {
  return (
    <section className={`fxmod${on ? ' is-on' : ''}`}>
      <header>
        <span className="fxmod__title">{title}</span>
        <span className="fxmod__led" />
      </header>
      <p className="fxmod__desc">{desc}</p>
      <div className="fxmod__body">{children}</div>
    </section>
  );
}

export function FxRack() {
  const fx = useStudio((s) => s.fx);
  const setFx = useStudio((s) => s.setFx);
  const srcName = useStudio((s) => padName(s, s.fx.sidechain.source, SOUNDS[s.fx.sidechain.source].name));
  const [learn, setLearn] = useState(false);
  const K = 38;

  useEffect(() => {
    if (!learn) return;
    return onAnyHit((pad) => {
      useStudio.getState().setFx('sidechain', { source: pad, on: true });
      setLearn(false);
    });
  }, [learn]);

  const s = fx.sidechain;
  return (
    <div className="fxrack">
      <div className="fxrack__presets">
        <span className="seg__label">PRESET</span>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className="tp__small"
            onMouseDown={noFocus}
            onClick={() => {
              for (const [k, v] of Object.entries(p.fx)) setFx(k as keyof FxState, v as never);
            }}
          >
            {p.name}
          </button>
        ))}
        {!engine.mix?.lofiAvailable() && <span className="fxrack__warn">このブラウザでは LO-FI が使えません</span>}
      </div>
      <div className="fxrack__grid">
        <Module title="REVERB" on={fx.reverb.level > 0} desc="各パッドの REV センドで送る。広がり・奥行き。">
          <Knob label="SIZE" value={fx.reverb.size} min={0.3} max={6} def={2.2} size={K} color="var(--cyan)" format={(v) => `${v.toFixed(1)}s`} onChange={(v) => setFx('reverb', { size: v })} />
          <Knob label="TONE" value={fromHz(fx.reverb.tone)} min={0} max={1} def={fromHz(6000)} size={K} color="var(--cyan)" format={(v) => hz(toHz(v))} onChange={(v) => setFx('reverb', { tone: toHz(v) })} />
          <Knob label="RETURN" value={fx.reverb.level} min={0} max={1.5} def={0.8} size={K} color="var(--cyan)" format={pct} onChange={(v) => setFx('reverb', { level: v })} />
        </Module>
        <Module title="DELAY" on={fx.delay.level > 0} desc="テンポに同期するやまびこ。DLY センドで送る。">
          <div className="seg seg--v">
            {DELAY_DIVS.map((d) => (
              <button key={d.v} className={fx.delay.div === d.v ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => setFx('delay', { div: d.v })}>
                {d.l}
              </button>
            ))}
          </div>
          <Knob label="FEEDBACK" value={fx.delay.feedback} min={0} max={0.9} def={0.35} size={K} color="var(--cyan)" format={pct} onChange={(v) => setFx('delay', { feedback: v })} />
          <Knob label="TONE" value={fromHz(fx.delay.tone)} min={0} max={1} def={fromHz(3500)} size={K} color="var(--cyan)" format={(v) => hz(toHz(v))} onChange={(v) => setFx('delay', { tone: toHz(v) })} />
          <Knob label="RETURN" value={fx.delay.level} min={0} max={1.5} def={0.7} size={K} color="var(--cyan)" format={pct} onChange={(v) => setFx('delay', { level: v })} />
        </Module>
        <Module title="SIDECHAIN" on={s.on} desc="キックが鳴るたびに他の音をグッと下げる「ポンピング」。">
          <button className={`tp__toggle${s.on ? ' is-on' : ''}`} onMouseDown={noFocus} onClick={() => setFx('sidechain', { on: !s.on })}>
            {s.on ? 'ON' : 'OFF'}
          </button>
          <div className="fxmod__src">
            <span className="seg__label">SOURCE</span>
            <span className="fxmod__srcname">
              {BANKS[Math.floor(s.source / 16)].letter}
              {String((s.source % 16) + 1).padStart(2, '0')} {srcName}
            </span>
            <button className={`tp__small${learn ? ' is-learn' : ''}`} onMouseDown={noFocus} onClick={() => setLearn(!learn)}>
              {learn ? 'パッドを叩いて…' : 'LEARN'}
            </button>
          </div>
          <Knob label="DEPTH" value={s.depth} min={0} max={1} def={0.6} size={K} format={pct} onChange={(v) => setFx('sidechain', { depth: v })} />
          <Knob label="RELEASE" value={s.release} min={0.03} max={0.8} def={0.18} size={K} format={(v) => `${Math.round(v * 1000)}ms`} onChange={(v) => setFx('sidechain', { release: v })} />
        </Module>
        <Module title="EQ" on={fx.eq.low !== 0 || fx.eq.mid !== 0 || fx.eq.high !== 0} desc="全体の音質。低音・中域・高音。">
          <Knob label="LOW" value={fx.eq.low} min={-12} max={12} bipolar def={0} size={K} format={db} onChange={(v) => setFx('eq', { low: v })} />
          <Knob label="MID" value={fx.eq.mid} min={-12} max={12} bipolar def={0} size={K} format={db} onChange={(v) => setFx('eq', { mid: v })} />
          <Knob label="MID FREQ" value={fromHz(fx.eq.midFreq)} min={fromHz(200)} max={fromHz(6000)} def={fromHz(1000)} size={K} format={(v) => hz(toHz(v))} onChange={(v) => setFx('eq', { midFreq: toHz(v) })} />
          <Knob label="HIGH" value={fx.eq.high} min={-12} max={12} bipolar def={0} size={K} format={db} onChange={(v) => setFx('eq', { high: v })} />
        </Module>
        <Module title="COMP" on desc="全体をまとめて太くする。">
          <Knob label="THRESH" value={fx.comp.threshold} min={-40} max={0} def={-14} size={K} format={(v) => `${v.toFixed(0)}dB`} onChange={(v) => setFx('comp', { threshold: v })} />
          <Knob label="RATIO" value={fx.comp.ratio} min={1} max={12} def={2.5} size={K} format={(v) => `${v.toFixed(1)}:1`} onChange={(v) => setFx('comp', { ratio: v })} />
          <Knob label="MAKEUP" value={fx.comp.makeup} min={0} max={12} def={0} size={K} format={(v) => `+${v.toFixed(1)}`} onChange={(v) => setFx('comp', { makeup: v })} />
        </Module>
        <Module title="TAPE · LO-FI · VINYL" on={fx.tape.drive > 0 || fx.lofi.bits < 16 || fx.lofi.down > 1 || fx.vinyl.level > 0} desc="テープの歪み、ビット/サンプルレート落とし、レコードのノイズ。">
          <Knob label="DRIVE" value={fx.tape.drive} min={0} max={1} def={0} size={K} format={pct} onChange={(v) => setFx('tape', { drive: v })} />
          <Knob label="BITS" value={fx.lofi.bits} min={4} max={16} step={1} def={16} size={K} format={(v) => `${v}bit`} onChange={(v) => setFx('lofi', { bits: v })} />
          <Knob label="RATE" value={fx.lofi.down} min={1} max={12} step={1} def={1} size={K} format={(v) => (v <= 1 ? 'FULL' : `÷${v}`)} onChange={(v) => setFx('lofi', { down: v })} />
          <Knob label="VINYL" value={fx.vinyl.level} min={0} max={1} def={0} size={K} format={pct} onChange={(v) => setFx('vinyl', { level: v })} />
        </Module>
      </div>
    </div>
  );
}
