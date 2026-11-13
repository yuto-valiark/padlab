import { useEffect, useRef } from 'react';
import { BANKS, CAT_COLOR } from '../audio/kit';
import { GRID_ORDER } from '../input/keymap';
import { useStudio } from '../state/store';
import { onPadHit } from './hitBus';

function Dot({ pad }: { pad: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      onPadHit(pad, (vel) =>
        ref.current?.animate([{ opacity: 0.4 + 0.6 * vel, background: 'var(--dot-c)' }, { opacity: 1 }], {
          duration: 380,
          easing: 'ease-out',
        }),
      ),
    [pad],
  );
  return <span ref={ref} className="bank__dot" />;
}

export function BankSelect() {
  const bank = useStudio((s) => s.bank);
  const setBank = useStudio((s) => s.setBank);
  return (
    <div className="banks" role="tablist" aria-label="Pad bank">
      {BANKS.map((b, i) => (
        <button
          key={b.letter}
          role="tab"
          aria-selected={bank === i}
          className={`bank${bank === i ? ' is-active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setBank(i)}
        >
          <span className="bank__letter">{b.letter}</span>
          <span className="bank__name">{b.name}</span>
          <span className="bank__map">
            {GRID_ORDER.map((slot) => (
              <span key={slot} style={{ '--dot-c': CAT_COLOR[b.sounds[slot].cat] } as React.CSSProperties}>
                <Dot pad={i * 16 + slot} />
              </span>
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}
