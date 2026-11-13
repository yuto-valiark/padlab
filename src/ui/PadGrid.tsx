import { useEffect, useRef, useState } from 'react';
import { loadFileToPad } from '../audio/sampler';
import { engine } from '../audio/engine';
import { CAT_COLOR, SOUNDS } from '../audio/kit';
import { GRID_ORDER, PAD_LABELS } from '../input/keymap';
import { padName, useStudio } from '../state/store';
import { onPadHit } from './hitBus';

function Pad({ slot, index }: { slot: number; index: number }) {
  const bank = useStudio((s) => s.bank);
  const pressed = useStudio((s) => !!s.held[slot]);
  const pad = bank * 16 + slot;
  const selected = useStudio((s) => s.selected === pad);
  const def = SOUNDS[pad];
  const user = useStudio((s) => !!s.samples[pad]?.user);
  const name = useStudio((s) => padName(s, pad, def.name));
  const [drop, setDrop] = useState(false);
  const glow = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const pointerVel = useRef<number | null>(null);

  useEffect(
    () =>
      onPadHit(pad, (vel) => {
        glow.current?.animate(
          [
            { opacity: 0.25 + 0.75 * vel, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(1.06)' },
          ],
          { duration: 260 + 380 * vel, easing: 'cubic-bezier(.15,.75,.3,1)' },
        );
        ring.current?.animate(
          [
            { opacity: 0.9 * vel, transform: 'scale(0.96)' },
            { opacity: 0, transform: 'scale(1.18)' },
          ],
          { duration: 420, easing: 'cubic-bezier(.2,.7,.3,1)' },
        );
      }),
    [pad],
  );

  const release = () => {
    if (pointerVel.current === null) return;
    pointerVel.current = null;
    useStudio.getState().release(slot);
    engine.padUp(pad);
  };

  return (
    <div
      className={`pad${pressed ? ' is-pressed' : ''}${selected ? ' is-selected' : ''}${drop ? ' is-drop' : ''}${user ? ' is-user' : ''}`}
      style={{ '--c': user ? '#ffd38a' : CAT_COLOR[def.cat], '--i': index } as React.CSSProperties}
      onDragOver={(e) => {
        e.preventDefault();
        setDrop(true);
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrop(false);
        const f = e.dataTransfer.files[0];
        if (f) loadFileToPad(f, pad).catch((err) => useStudio.getState().setNotice((err as Error).message));
      }}
      role="button"
      aria-label={`Pad ${slot + 1} ${name}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        // Hit near the top of the pad = louder, like striking harder.
        const r = e.currentTarget.getBoundingClientRect();
        const vel = Math.min(1, Math.max(0.25, 1.15 - (e.clientY - r.top) / r.height));
        pointerVel.current = vel;
        const s = useStudio.getState();
        s.press(slot, { pad, vel });
        s.select(pad);
        engine.padDown(pad, vel, s.repeatOn || e.altKey);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="pad__ring" ref={ring} />
      <div className="pad__glow" ref={glow} />
      <div className="pad__surface">
        <span className="pad__key">{PAD_LABELS[slot]}</span>
        <span className="pad__num">{String(slot + 1).padStart(2, '0')}</span>
        <span className="pad__name">{name}</span>
        <span className="pad__led" />
      </div>
    </div>
  );
}

export function PadGrid() {
  return (
    <div className="padgrid">
      {GRID_ORDER.map((slot, i) => (
        <Pad key={slot} slot={slot} index={i} />
      ))}
    </div>
  );
}
