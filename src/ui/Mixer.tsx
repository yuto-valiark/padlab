import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { BANKS, CAT_COLOR, SOUNDS } from '../audio/kit';
import { FULL_VEL } from '../audio/timing';
import { PAD_LABELS } from '../input/keymap';
import { padName, useStudio } from '../state/store';
import { Knob } from './Knob';
import { onPadHit } from './hitBus';

const noFocus = (e: React.MouseEvent) => e.preventDefault();
const dB = (v: number) => (v <= 0.001 ? '-∞' : `${(20 * Math.log10(v)).toFixed(1)}`);

/** Vertical fader. Drag (Shift = fine), double-click resets, arrow keys nudge. */
export function Fader({ value, max = 1.5, def = 1, color, onChange, label }: {
  value: number;
  max?: number;
  def?: number;
  color: string;
  onChange: (v: number) => void;
  label: string;
}) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => Math.min(max, Math.max(0, v));
  return (
    <div
      className="fader"
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      style={{ '--c': color, '--v': value / max } as React.CSSProperties}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = track.current!.getBoundingClientRect();
        const thumb = r.bottom - (value / max) * r.height;
        // Grab the thumb where it is; clicking the track jumps to that spot.
        const v = Math.abs(e.clientY - thumb) < 12 ? value : clamp(((r.bottom - e.clientY) / r.height) * max);
        drag.current = { y: e.clientY, v };
        onChange(v);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const h = track.current!.getBoundingClientRect().height;
        onChange(clamp(drag.current.v + ((drag.current.y - e.clientY) / h) * max * (e.shiftKey ? 0.2 : 1)));
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => onChange(def)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        e.stopPropagation();
        onChange(clamp(value + (e.key === 'ArrowUp' ? 0.02 : -0.02)));
      }}
    >
      <i className="fader__unity" style={{ bottom: `${(1 / max) * 100}%` }} />
      <i className="fader__fill" />
      <i className="fader__thumb" />
    </div>
  );
}

function Strip({ pad, slot }: { pad: number; slot: number }) {
  const p = useStudio((s) => s.pads[pad]);
  const user = useStudio((s) => !!s.samples[pad]?.user);
  const name = useStudio((s) => padName(s, pad, SOUNDS[pad].name));
  const selected = useStudio((s) => s.selected === pad);
  const scSource = useStudio((s) => s.fx.sidechain.on && s.fx.sidechain.source === pad);
  const setPad = useStudio((s) => s.setPad);
  const color = user ? '#ffd38a' : CAT_COLOR[SOUNDS[pad].cat];
  const led = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      onPadHit(pad, (vel) =>
        led.current?.animate([{ opacity: 0.3 + 0.7 * vel, boxShadow: `0 0 10px ${color}` }, { opacity: 0.15, boxShadow: 'none' }], { duration: 280 }),
      ),
    [pad, color],
  );
  return (
    <div className={`strip${selected ? ' is-selected' : ''}${p.mute ? ' is-mute' : ''}`} style={{ '--c': color } as React.CSSProperties}>
      <button
        className="strip__name"
        onMouseDown={noFocus}
        onClick={() => {
          useStudio.getState().select(pad);
          engine.trigger(pad, FULL_VEL);
        }}
        title={`${name}（クリックで試聴）`}
      >
        <span className="strip__key">{PAD_LABELS[slot]}</span>
        <span className="strip__led" ref={led} />
        <span className="strip__label">{name}</span>
      </button>
      <Knob label="REV" value={p.sendRev} min={0} max={1} def={0} size={28} color="var(--cyan)" format={(v) => `${Math.round(v * 100)}`} onChange={(v) => setPad(pad, { sendRev: v })} />
      <Knob label="DLY" value={p.sendDly} min={0} max={1} def={0} size={28} color="var(--cyan)" format={(v) => `${Math.round(v * 100)}`} onChange={(v) => setPad(pad, { sendDly: v })} />
      <Knob label="PAN" value={p.pan} min={-1} max={1} bipolar def={0} size={28} color={color} format={(v) => (Math.abs(v) < 0.02 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)} onChange={(v) => setPad(pad, { pan: v })} />
      <Fader value={p.volume} color={color} label={`${name} level`} onChange={(v) => setPad(pad, { volume: v })} />
      <span className="strip__db">{dB(p.volume)}</span>
      <div className="strip__ms">
        <button className={`ms ms--m${p.mute ? ' is-on' : ''}`} onMouseDown={noFocus} onClick={() => setPad(pad, { mute: !p.mute })} title="ミュート">
          M
        </button>
        <button className={`ms ms--s${p.solo ? ' is-on' : ''}`} onMouseDown={noFocus} onClick={() => setPad(pad, { solo: !p.solo })} title="ソロ">
          S
        </button>
      </div>
      {scSource && <span className="strip__sc" title="サイドチェインの元">SC</span>}
    </div>
  );
}

export function Mixer() {
  const bank = useStudio((s) => s.bank);
  const master = useStudio((s) => s.master);
  const setMaster = useStudio((s) => s.setMaster);
  const anySolo = useStudio((s) => s.pads.some((p) => p.solo));
  // Pad 1 on the left.
  const order = Array.from({ length: 16 }, (_, i) => i);
  return (
    <div className="mixer">
      <div className="mixer__strips">
        {order.map((slot) => (
          <Strip key={slot} pad={bank * 16 + slot} slot={slot} />
        ))}
      </div>
      <div className="strip strip--master" style={{ '--c': 'var(--amber)' } as React.CSSProperties}>
        <span className="strip__name strip__name--master">MASTER</span>
        <span className="mixer__bank">BANK {BANKS[bank].letter}</span>
        {anySolo && (
          <button
            className="tp__small"
            onMouseDown={noFocus}
            onClick={() => {
              const s = useStudio.getState();
              s.pads.forEach((p, i) => p.solo && s.setPad(i, { solo: false }));
            }}
          >
            SOLO OFF
          </button>
        )}
        <Fader value={master} max={1.2} def={0.8} color="var(--amber)" label="master level" onChange={setMaster} />
        <span className="strip__db">{dB(master)}</span>
      </div>
    </div>
  );
}
