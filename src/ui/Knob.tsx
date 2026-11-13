import { useEffect, useRef } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  def: number;
  step?: number;
  bipolar?: boolean;
  size?: number;
  color?: string;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  if (Math.abs(a1 - a0) < 0.01) return '';
  const [s, e] = a0 < a1 ? [a0, a1] : [a1, a0];
  const [x0, y0] = polar(cx, cy, r, s);
  const [x1, y1] = polar(cx, cy, r, e);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** Drag up/down to turn. Shift = fine. Double-click = reset. Wheel & arrow keys work too. */
export function Knob({ label, value, min, max, def, step, bipolar, size = 56, color = 'var(--amber)', format, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const live = useRef({ value, min, max, step, onChange });
  live.current = { value, min, max, step, onChange };

  const commit = (v: number) => {
    const { min, max, step, onChange } = live.current;
    let x = Math.min(max, Math.max(min, v));
    if (step) x = Math.round(x / step) * step;
    onChange(Number(x.toFixed(4)));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { value, min, max, step } = live.current;
      const d = step ?? (max - min) / 100;
      commit(value - Math.sign(e.deltaY) * d);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const norm = (value - min) / (max - min);
  const ang = -135 + norm * 270;
  const from = bipolar ? 0 : -135;
  const c = size / 2;
  const r = c - 5;
  const [px, py] = polar(c, c, r - 9, ang);

  return (
    <div
      ref={ref}
      className="knob"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, v: value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const range = max - min;
        commit(drag.current.v + ((drag.current.y - e.clientY) / (e.shiftKey ? 700 : 160)) * range);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => onChange(def)}
      onKeyDown={(e) => {
        const d = step ?? (max - min) / 50;
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') commit(value + d);
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') commit(value - d);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{ '--knob-c': color } as React.CSSProperties}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r - 6} className="knob__body" />
        <path d={arc(c, c, r, -135, 135)} className="knob__track" />
        <path d={arc(c, c, r, from, ang)} className="knob__value" />
        <line x1={c} y1={c} x2={px} y2={py} className="knob__pointer" />
      </svg>
      <div className="knob__label">{label}</div>
      <div className="knob__readout">{format(value)}</div>
    </div>
  );
}
