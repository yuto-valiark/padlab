// First-run guided tour: make a first beat in about a minute.
// Each step spotlights part of the screen and (mostly) advances when you actually do the thing.
import { useEffect, useLayoutEffect, useState } from 'react';
import { useStudio } from '../state/store';
import { onAnyHit } from './hitBus';
import { useUi } from './uiStore';

type Wait = 'hit' | 'soft' | 'take' | 'play' | null;

interface Step {
  target: string | null;
  title: string;
  body: React.ReactNode;
  wait: Wait;
  waitHint?: string;
  onEnter?: () => void;
}

const K = ({ children }: { children: React.ReactNode }) => <kbd className="kbd">{children}</kbd>;

const STEPS: Step[] = [
  {
    target: null,
    title: '1分で、最初のビートを。',
    body: <>キーボードがそのままドラムパッドになります。指で叩いて、録って、ループさせるまでを一緒にやってみましょう。（入力は英数モードで）</>,
    wait: null,
  },
  {
    target: '.padgrid',
    title: 'パッドを叩く',
    body: (
      <>
        <K>Z</K> がキック、<K>C</K> がスネア、<K>A</K> がハット。左手でハット、右手でキックとスネア、が基本のフォームです。
      </>
    ),
    wait: 'hit',
    waitHint: 'どれか叩いてみて',
    onEnter: () => useStudio.getState().setBank(0),
  },
  {
    target: '.padgrid',
    title: '強弱をつける',
    body: (
      <>
        <K>⇧ Shift</K> を押しながら叩くと弱い音（ゴーストノート）。<K>⌥ Option</K> を押しっぱなしにすると連打になります。
      </>
    ),
    wait: 'soft',
    waitHint: 'Shift を押しながら叩いてみて',
  },
  {
    target: '.tp',
    title: '録音する',
    body: (
      <>
        <K>Enter</K> で録音。メトロノームが 4 つ鳴ったら、<K>Z</K> <K>C</K> <K>A</K> でビートを叩いて、もう一度 <K>Enter</K>。少しズレても自動でマス目に合わせます。
      </>
    ),
    wait: 'take',
    waitHint: '4 音以上録音して Enter で止める',
    onEnter: () => {
      const s = useStudio.getState();
      s.setTab('seq');
      s.setSongMode(false);
    },
  },
  {
    target: '.seq',
    title: 'ループしてる！',
    body: (
      <>
        叩いた音がマス目に入りました。クリックで足したり消したりできます。間違えたら <K>⌘</K>+<K>Z</K>。止めるのは <K>Space</K>。
      </>
    ),
    wait: null,
  },
  {
    target: '[aria-label="SWING"]',
    title: 'グルーヴをつける',
    body: <>SWING を 58〜62% くらいに上げると、裏の音が少し遅れてヒップホップっぽいヨレが出ます。ノブは上下にドラッグ。</>,
    wait: null,
  },
  {
    target: '.tabs',
    title: 'ここから先は',
    body: (
      <>
        <b>PRACTICE</b> で指の練習、<b>PAD EDIT</b> で自分の音を読み込んでチョップ、<b>FX</b> で LO-FI 加工、<b>SONG</b> で曲にして WAV 書き出し。作ったものは自動保存されます。
      </>
    ),
    wait: null,
  },
  {
    target: null,
    title: 'Have fun.',
    body: (
      <>
        <K>?</K> でショートカット一覧（ツアーもそこからもう一度見られます）。毎日 5 分の練習が、いちばんの近道。
      </>
    ),
    wait: null,
  },
];

function useRect(selector: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect() ?? null;
      const key = r ? `${r.x},${r.y},${r.width},${r.height}` : '';
      if (key !== last) {
        last = key;
        setRect(r);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selector]);
  return rect;
}

export function Tour() {
  const step = useUi((s) => s.tour);
  const setTour = useUi((s) => s.setTour);
  const cur = step === null ? null : STEPS[step];
  const rect = useRect(cur?.target ?? null);
  const [met, setMet] = useState(false);

  const next = () => setTour(step !== null && step < STEPS.length - 1 ? step + 1 : null);

  useEffect(() => {
    setMet(false);
    cur?.onEnter?.();
    if (!cur?.wait) return;
    if (cur.wait === 'hit' || cur.wait === 'soft') {
      return onAnyHit((_, vel) => {
        if (cur.wait === 'hit' || vel < 0.6) setMet(true);
      });
    }
    if (cur.wait === 'take') {
      // Count only notes added during this step (the pattern may already have some).
      const base = useStudio.getState().pattern.notes.length;
      return useStudio.subscribe((s) => {
        if (!s.recording && s.playing && s.pattern.notes.length >= base + 3) setMet(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Advance shortly after the action is done, so the user sees the ✓.
  useEffect(() => {
    if (!met) return;
    const id = setTimeout(next, 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [met]);

  if (!cur || step === null) return null;

  // Place the card next to the spotlight, inside the viewport.
  const W = 340;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let style: React.CSSProperties;
  if (!rect) style = { left: (vw - W) / 2, top: vh * 0.32 };
  else {
    const below = vh - rect.bottom;
    const right = vw - rect.right;
    if (right > W + 32) style = { left: rect.right + 20, top: Math.min(Math.max(16, rect.top), vh - 260) };
    else if (rect.left > W + 32) style = { left: rect.left - W - 20, top: Math.min(Math.max(16, rect.top), vh - 260) };
    else if (below > 240) style = { left: Math.min(Math.max(16, rect.left), vw - W - 16), top: rect.bottom + 16 };
    else style = { left: Math.min(Math.max(16, rect.left), vw - W - 16), top: Math.max(16, rect.top - 250) };
  }

  const last = step === STEPS.length - 1;
  return (
    <div className="tour" aria-live="polite">
      {rect ? (
        <div className="tour__spot" style={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }} />
      ) : (
        <div className="tour__dim" />
      )}
      <div className="tour__card" style={{ ...style, width: W }} role="dialog" aria-label={cur.title}>
        <div className="tour__progress">
          {STEPS.map((_, i) => (
            <i key={i} className={i < step ? 'done' : i === step ? 'on' : ''} />
          ))}
        </div>
        <h3>{cur.title}</h3>
        <p>{cur.body}</p>
        {cur.wait && <div className={`tour__wait${met ? ' is-met' : ''}`}>{met ? '✓ いいね！' : `→ ${cur.waitHint}`}</div>}
        <div className="tour__actions">
          {!last && (
            <button className="pbtn pbtn--ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => setTour(null)}>
              スキップ
            </button>
          )}
          <button className="pbtn pbtn--go" onMouseDown={(e) => e.preventDefault()} onClick={next}>
            {step === 0 ? 'はじめる' : last ? '始める' : cur.wait && !met ? 'とばす' : '次へ'}
          </button>
        </div>
      </div>
    </div>
  );
}
