import { useEffect } from 'react';
import { engine } from '../audio/engine';
import { useStudio } from '../state/store';

/** Power-on screen. Browsers only allow audio after a user gesture, so we make that gesture part of the ritual. */
export function Boot() {
  const phase = useStudio((s) => s.phase);
  const progress = useStudio((s) => s.progress);

  useEffect(() => {
    if (phase !== 'ready') return;
    const go = async (e: Event) => {
      if (e instanceof KeyboardEvent && (e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      window.removeEventListener('keydown', go);
      window.removeEventListener('pointerdown', go);
      await engine.powerOn();
      const s = useStudio.getState();
      s.setPhase('on');
      s.setLatency(engine.latencyMs() ?? 0);
      // outputLatency is often only known after the device has started.
      setTimeout(() => s.setLatency(engine.latencyMs() ?? 0), 800);
    };
    window.addEventListener('keydown', go);
    window.addEventListener('pointerdown', go);
    return () => {
      window.removeEventListener('keydown', go);
      window.removeEventListener('pointerdown', go);
    };
  }, [phase]);

  if (phase === 'on') return null;
  const pct = Math.round(progress * 100);
  return (
    <div className={`boot boot--${phase}`}>
      <div className="boot__inner">
        <div className="boot__grid" aria-hidden>
          {Array.from({ length: 16 }, (_, i) => (
            <i key={i} style={{ '--d': `${(i % 4) * 70 + Math.floor(i / 4) * 70}ms` } as React.CSSProperties} className={i / 16 < progress ? 'on' : ''} />
          ))}
        </div>
        <h1 className="boot__title">PADLAB</h1>
        <p className="boot__sub">FINGER DRUM WORKSTATION</p>
        {phase === 'loading' ? (
          <p className="boot__status">
            SYNTHESIZING KIT <b>{String(Math.round(progress * 64)).padStart(2, '0')}</b>/64 · {pct}%
          </p>
        ) : (
          <p className="boot__status boot__status--go">
            PRESS ANY KEY <span>/ CLICK TO POWER ON</span>
          </p>
        )}
        <p className="boot__note">全64音をこの場でシンセサイズ — 外部サンプル不使用・権利フリー</p>
      </div>
    </div>
  );
}
