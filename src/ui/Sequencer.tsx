import { useEffect, useMemo, useRef } from 'react';
import { engine } from '../audio/engine';
import { BANKS, CAT_COLOR, SOUNDS } from '../audio/kit';
import { loopTicks, mod, STEP_TICKS, swingOffset } from '../audio/sequence';
import { FULL_VEL, SOFT_VEL } from '../audio/timing';
import { PAD_LABELS } from '../input/keymap';
import { padName, patternLabel, useStudio } from '../state/store';
import { onPadHit } from './hitBus';

// Pad 16 on top, Pad 1 (usually the kick) at the bottom — same as the pads and the hit trail.
const ROWS = Array.from({ length: 16 }, (_, i) => 15 - i);

function RowLabel({ pad, slot }: { pad: number; slot: number }) {
  const def = SOUNDS[pad];
  const selected = useStudio((s) => s.selected === pad);
  const name = useStudio((s) => padName(s, pad, def.name));
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(
    () =>
      onPadHit(pad, (vel) =>
        ref.current?.animate(
          [{ backgroundColor: `color-mix(in srgb, ${CAT_COLOR[def.cat]} ${Math.round(vel * 40)}%, transparent)` }, { backgroundColor: 'transparent' }],
          { duration: 300 },
        ),
      ),
    [pad, def.cat],
  );
  return (
    <button
      ref={ref}
      className={`seq__label${selected ? ' is-selected' : ''}`}
      style={{ '--c': CAT_COLOR[def.cat] } as React.CSSProperties}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        useStudio.getState().select(pad);
        engine.trigger(pad, FULL_VEL);
      }}
      title="クリックで試聴"
    >
      <span className="seq__key">{PAD_LABELS[slot]}</span>
      <span className="seq__name">{name}</span>
    </button>
  );
}

function PatternSwitch() {
  const current = useStudio((s) => s.current);
  const count = useStudio((s) => s.patterns.length);
  const select = useStudio((s) => s.selectPattern);
  return (
    <span className="pswitch" title="編集するパターン（SONG タブで管理）">
      <button disabled={current === 0} onMouseDown={(e) => e.preventDefault()} onClick={() => select(current - 1)}>‹</button>
      <b>{patternLabel(current)}</b>
      <button disabled={current >= count - 1} onMouseDown={(e) => e.preventDefault()} onClick={() => select(current + 1)}>›</button>
    </span>
  );
}

export function Sequencer() {
  const bank = useStudio((s) => s.bank);
  const pattern = useStudio((s) => s.pattern);
  const swing = useStudio((s) => s.swing);
  const steps = pattern.bars * 16;
  const L = loopTicks(pattern.bars);
  const tracks = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const leds = useRef<HTMLDivElement>(null);
  const paint = useRef<{ mode: 'add' | 'remove'; vel: number; last: string } | null>(null);

  const byPad = useMemo(() => {
    const m = new Map<number, typeof pattern.notes>();
    for (const n of pattern.notes) {
      if (Math.floor(n.pad / 16) !== bank) continue;
      const a = m.get(n.pad) ?? [];
      a.push(n);
      m.set(n.pad, a);
    }
    return m;
  }, [pattern, bank]);

  const otherBanks = useMemo(() => {
    const counts = [0, 0, 0, 0];
    for (const n of pattern.notes) counts[Math.floor(n.pad / 16)]++;
    return counts;
  }, [pattern]);

  // Playhead + step LEDs, driven straight from the audio clock (no React re-render).
  useEffect(() => {
    let raf = 0;
    let lastStep = -1;
    const loop = () => {
      let p = engine.position();
      const st = useStudio.getState();
      if (st.songMode) {
        // In song mode, only show the playhead while this pattern is the one playing.
        const sp = engine.songPosition();
        p = sp && sp.seg.pattern === st.current ? sp.local : null;
      }
      const h = head.current;
      if (h) {
        if (p === null || p < 0) {
          h.style.opacity = '0';
        } else {
          const t = mod(p, L);
          h.style.opacity = '1';
          h.style.left = `${(t / L) * 100}%`;
        }
      }
      const step = p === null || p < 0 ? -1 : Math.floor(mod(p, L) / STEP_TICKS);
      if (step !== lastStep && leds.current) {
        leds.current.children[lastStep]?.classList.remove('on');
        leds.current.children[step]?.classList.add('on');
        lastStep = step;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [L]);

  const cellAt = (e: React.PointerEvent) => {
    const r = tracks.current!.getBoundingClientRect();
    const row = Math.floor(((e.clientY - r.top) / r.height) * 16);
    const step = Math.floor(((e.clientX - r.left) / r.width) * steps);
    if (row < 0 || row > 15 || step < 0 || step >= steps) return null;
    return { pad: bank * 16 + ROWS[row], step };
  };

  return (
    <div className="seq" style={{ '--steps': steps } as React.CSSProperties}>
      <div className="seq__corner">
        <PatternSwitch />
        <span>{BANKS[bank].letter}</span>
        {otherBanks.map((c, i) =>
          i !== bank && c > 0 ? (
            <span key={i} className="seq__other" title={`Bank ${BANKS[i].letter} にも ${c} ノートあり`}>
              {BANKS[i].letter}·{c}
            </span>
          ) : null,
        )}
      </div>
      <div className="seq__ruler" ref={leds}>
        {Array.from({ length: steps }, (_, i) => (
          <i key={i} className={i % 4 === 0 ? 'beat' : ''}>
            {i % 16 === 0 ? i / 16 + 1 : i % 4 === 0 ? `.${(i % 16) / 4 + 1}` : ''}
          </i>
        ))}
      </div>
      <div className="seq__labels">
        {ROWS.map((slot) => (
          <RowLabel key={slot} pad={bank * 16 + slot} slot={slot} />
        ))}
      </div>
      <div
        className="seq__tracks"
        ref={tracks}
        onPointerDown={(e) => {
          const c = cellAt(e);
          if (!c) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const vel = e.shiftKey ? SOFT_VEL : FULL_VEL;
          const mode = useStudio.getState().toggleStep(c.pad, c.step, vel);
          paint.current = { mode, vel, last: `${c.pad}:${c.step}` };
          useStudio.getState().select(c.pad);
          if (mode === 'add' && !engine.isPlaying()) engine.trigger(c.pad, vel);
        }}
        onPointerMove={(e) => {
          const p = paint.current;
          const c = p && cellAt(e);
          if (!p || !c) return;
          const k = `${c.pad}:${c.step}`;
          if (k === p.last) return;
          p.last = k;
          useStudio.getState().toggleStep(c.pad, c.step, p.vel, p.mode);
        }}
        onPointerUp={() => (paint.current = null)}
        onPointerCancel={() => (paint.current = null)}
      >
        {ROWS.map((slot) => {
          const pad = bank * 16 + slot;
          const color = CAT_COLOR[SOUNDS[pad].cat];
          return (
            <div key={slot} className="seq__row" style={{ '--c': color } as React.CSSProperties}>
              {(byPad.get(pad) ?? []).map((n) => {
                const swung = n.tick + swingOffset(n.tick, swing);
                return (
                  <span
                    key={n.id}
                    className="seq__note"
                    style={{
                      left: `${(swung / L) * 100}%`,
                      opacity: 0.35 + 0.65 * n.vel,
                      // Off-grid (human-timed) notes get a softer edge so you can spot them.
                      borderRadius: n.tick % STEP_TICKS === 0 ? undefined : '50%',
                    }}
                  />
                );
              })}
            </div>
          );
        })}
        <div className="seq__head" ref={head} />
      </div>
    </div>
  );
}
