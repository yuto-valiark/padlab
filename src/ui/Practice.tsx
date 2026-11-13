import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { BANKS, CAT_COLOR, SOUNDS } from '../audio/kit';
import { BAR_TICKS, PPQ } from '../audio/sequence';
import { PAD_LABELS } from '../input/keymap';
import { accuracy, buildExpected, WINDOW, type Expected } from '../practice/judge';
import { LESSONS, type Lesson } from '../practice/lessons';
import {
  currentLesson, listen, replayTake, run, scanMisses, startPractice, stopPractice, usePractice, type HistoryEntry,
} from '../practice/session';
import { onAnyHit } from './hitBus';
import { useCanvas } from './useCanvas';

const noFocus = (e: React.MouseEvent) => e.preventDefault();

const JUDGE_STYLE: Record<string, { label: string; color: string }> = {
  perfect: { label: 'PERFECT', color: '#ffd38a' },
  great: { label: 'GREAT', color: '#4fe3d1' },
  good: { label: 'GOOD', color: '#7fa8ff' },
  miss: { label: 'MISS', color: '#ff5a4e' },
  extra: { label: 'WRONG', color: '#ff5a4e' },
};

// ─── Sparkline of past scores ───────────────────────────────────────────────

function Sparkline({ data, height = 28 }: { data: HistoryEntry[]; height?: number }) {
  if (data.length < 2) return <div className="spark spark--empty">{data.length ? `${data[0].acc}%` : 'まだ記録なし'}</div>;
  const w = 100;
  const pts = data.slice(-20);
  const xy = pts.map((d, i) => [(i / (pts.length - 1)) * w, height - (d.acc / 100) * (height - 4) - 2]);
  const path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-label="スコア推移">
      <path d={`${path} L${w},${height} L0,${height} Z`} className="spark__fill" />
      <path d={path} className="spark__line" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.2" className="spark__dot" />
    </svg>
  );
}

// ─── Lesson list ────────────────────────────────────────────────────────────

function LessonCard({ l }: { l: Lesson }) {
  const active = usePractice((s) => s.lessonId === l.id);
  const hist = usePractice((s) => s.history[l.id]) ?? [];
  const busy = usePractice((s) => s.status !== 'idle' && s.status !== 'done');
  const best = hist.reduce((m, h) => Math.max(m, h.acc), 0);
  return (
    <button
      className={`lesson${active ? ' is-on' : ''}`}
      disabled={busy && !active}
      onMouseDown={noFocus}
      onClick={() => usePractice.getState().set({ lessonId: l.id })}
    >
      <span className="lesson__top">
        <span className="lesson__level">{'●'.repeat(l.level)}{'○'.repeat(3 - l.level)}</span>
        <span className="lesson__genre">{l.genre}</span>
      </span>
      <span className="lesson__title">{l.title}</span>
      <span className="lesson__meta">
        <span>BANK {BANKS[l.bank].letter}</span>
        <span>{l.bpm} BPM</span>
        {best > 0 && <span className="lesson__best">BEST {best}%</span>}
      </span>
      {hist.length > 0 && <Sparkline data={hist} height={18} />}
    </button>
  );
}

// ─── The highway ────────────────────────────────────────────────────────────

const LABEL_W = 132;
const HIT_X = LABEL_W + 70;

function Highway() {
  const flash = useRef(new Map<number, number>());
  const lastSeen = useRef({ n: -1, at: 0 });

  useEffect(() => onAnyHit((pad) => flash.current.set(pad, performance.now())), []);

  const ref = useCanvas((g, w, h) => {
    const lesson = run.expected.length ? run.lesson : currentLesson();
    const st = usePractice.getState();
    const pos = engine.position();
    const nowTick = pos ?? -PPQ * 0.75;
    if (pos !== null) scanMisses(pos);

    const slots = [...new Set(lesson.hits.map((x) => x.slot))].sort((a, b) => b - a);
    const lh = Math.min(64, h / slots.length);
    const top = (h - lh * slots.length) / 2;
    const ppt = (w - HIT_X) / (BAR_TICKS * 1.05);
    const xOf = (tick: number) => HIT_X + (tick - nowTick) * ppt;
    const laneOf = new Map(slots.map((s, i) => [s, i]));
    const now = performance.now();

    g.clearRect(0, 0, w, h);

    // Lanes
    slots.forEach((slot, i) => {
      const y = top + i * lh;
      const pad = lesson.bank * 16 + slot;
      const c = CAT_COLOR[SOUNDS[pad].cat];
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.03)';
      g.fillRect(LABEL_W, y + 1, w - LABEL_W, lh - 2);
      // Flash at the hit line when this pad is played
      const f = flash.current.get(pad);
      if (f && now - f < 260) {
        const a = 1 - (now - f) / 260;
        const grad = g.createLinearGradient(HIT_X - 60, 0, HIT_X + 60, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, c);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = a * 0.55;
        g.fillStyle = grad;
        g.fillRect(HIT_X - 60, y + 1, 120, lh - 2);
        g.globalAlpha = 1;
      }
      // Label: key cap + name
      g.fillStyle = c;
      g.fillRect(0, y + 4, 3, lh - 8);
      g.fillStyle = '#1d1a16';
      g.strokeStyle = '#3a342b';
      g.lineWidth = 1;
      const ks = Math.min(26, lh - 10);
      g.beginPath();
      g.roundRect(12, y + (lh - ks) / 2, ks, ks, 5);
      g.fill();
      g.stroke();
      g.fillStyle = '#efe6d4';
      g.font = `600 ${Math.round(ks * 0.5)}px "IBM Plex Mono"`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(PAD_LABELS[slot], 12 + ks / 2, y + lh / 2 + 1);
      g.textAlign = 'left';
      g.fillStyle = '#8a8071';
      g.font = '500 10px "IBM Plex Mono"';
      g.fillText(SOUNDS[pad].name, 20 + ks, y + lh / 2 + 1);
    });

    // Beat & bar grid
    for (let b = Math.floor((nowTick - (HIT_X - LABEL_W) / ppt) / PPQ); b * PPQ < nowTick + (w - HIT_X) / ppt; b++) {
      const x = xOf(b * PPQ);
      if (x < LABEL_W) continue;
      g.fillStyle = b % 4 === 0 ? 'rgba(255,166,48,0.22)' : 'rgba(239,230,212,0.06)';
      g.fillRect(Math.round(x), top, 1, lh * slots.length);
    }

    // Hit window band
    const winPx = (WINDOW.good / engine.secPerTick()) * ppt;
    g.fillStyle = 'rgba(255,166,48,0.05)';
    g.fillRect(HIT_X - winPx, top, winPx * 2, lh * slots.length);

    // Targets
    const show = run.expected.length && st.status !== 'idle' ? run.expected : previewTargets(lesson);
    for (const e of show) {
      const x = xOf(e.abs);
      if (x < LABEL_W - 20 || x > w + 20) continue;
      const lane = laneOf.get(e.slot);
      if (lane === undefined) continue;
      const y = top + lane * lh;
      const c = CAT_COLOR[SOUNDS[e.pad].cat];
      const nh = lh - 14;
      const nw = Math.max(10, Math.min(18, nh * 0.45));
      const judged = run.judgedAt.get(e);
      if (e.result && e.result !== 'miss' && judged) {
        // Burst, then vanish
        const age = (now - judged) / 380;
        if (age < 1) {
          const jc = JUDGE_STYLE[e.result].color;
          g.strokeStyle = jc;
          g.globalAlpha = 1 - age;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(HIT_X + (e.delta ?? 0) / engine.secPerTick() * ppt, y + lh / 2, 8 + age * 22, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
        }
        continue;
      }
      g.globalAlpha = e.result === 'miss' ? 0.25 : 0.35 + 0.65 * e.vel;
      g.fillStyle = e.result === 'miss' ? '#5a524a' : c;
      if (!e.result) {
        g.shadowColor = c;
        g.shadowBlur = 12;
      }
      g.beginPath();
      g.roundRect(x - nw / 2, y + 7, nw, nh, 4);
      g.fill();
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }

    // The player's actual hits (shows early/late at a glance)
    for (const t of run.take) {
      const x = xOf(t.tick);
      if (x < LABEL_W || x > w) continue;
      const lane = laneOf.get(t.pad - lesson.bank * 16);
      if (lane === undefined) continue;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(Math.round(x) - 1, top + lane * lh + 3, 2, lh - 6);
    }

    // Hit line
    g.fillStyle = '#ffa630';
    g.shadowColor = '#ffa630';
    g.shadowBlur = 14;
    g.fillRect(HIT_X - 1, top - 6, 2, lh * slots.length + 12);
    g.shadowBlur = 0;

    // Count-in
    if (pos !== null && pos < 0) {
      const n = Math.ceil(-pos / PPQ);
      const frac = (-pos / PPQ) % 1;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = 0.3 + 0.7 * frac;
      g.fillStyle = '#ffd38a';
      g.font = `900 ${Math.round(h * 0.38)}px Unbounded`;
      g.fillText(String(n), (HIT_X + w) / 2, h / 2);
      g.globalAlpha = 1;
    }

    // Judgement popup
    if (st.last && st.last.n !== lastSeen.current.n) lastSeen.current = { n: st.last.n, at: now };
    const age = (now - lastSeen.current.at) / 600;
    if (st.last && age < 1 && st.status === 'running') {
      const js = JUDGE_STYLE[st.last.judge];
      g.globalAlpha = 1 - age * age;
      g.fillStyle = js.color;
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.font = '900 15px Unbounded';
      const yy = top - 10 - age * 8 + 18;
      g.fillText(js.label, HIT_X + 14, Math.max(16, yy));
      const labelW = g.measureText(js.label).width;
      if (st.last.judge !== 'miss' && st.last.judge !== 'extra') {
        g.font = '500 11px "IBM Plex Mono"';
        g.fillStyle = '#efe6d4';
        const ms = Math.round(st.last.ms);
        g.fillText(`${ms > 0 ? '+' : ''}${ms}ms`, HIT_X + 22 + labelW, Math.max(16, yy));
      }
      g.globalAlpha = 1;
    }
  }, true);

  return <canvas ref={ref} className="highway" />;
}

// Two untouched loops of the lesson, shown while idle.
const previewCache = new WeakMap<Lesson, Expected[]>();
function previewTargets(l: Lesson) {
  let p = previewCache.get(l);
  if (!p) previewCache.set(l, (p = buildExpected(l, 2)));
  return p;
}

// ─── HUD ────────────────────────────────────────────────────────────────────

function Hud() {
  const counts = usePractice((s) => s.counts);
  const combo = usePractice((s) => s.combo);
  const recent = usePractice((s) => s.recent);
  const acc = accuracy(counts);
  const max = WINDOW.good * 1000;
  return (
    <div className="hud">
      <div className="hud__combo">
        <span className="hud__big" key={combo}>{combo}</span>
        <span className="hud__lbl">COMBO</span>
      </div>
      <div className="hud__acc">
        <span className="hud__big">{acc.toFixed(1)}<small>%</small></span>
        <span className="hud__lbl">ACCURACY</span>
      </div>
      <div className="hud__counts">
        {(['perfect', 'great', 'good', 'miss'] as const).map((k) => (
          <span key={k} style={{ color: JUDGE_STYLE[k].color }}>
            {JUDGE_STYLE[k].label} <b>{counts[k]}</b>
          </span>
        ))}
        <span style={{ color: 'var(--ink-faint)' }}>
          WRONG <b>{counts.extra}</b>
        </span>
      </div>
      <div className="hud__meter" aria-label="早い／遅いメーター">
        <span className="hud__meter-l">EARLY</span>
        <div className="hud__track">
          <i className="hud__zone hud__zone--great" style={{ width: `${(WINDOW.great / WINDOW.good) * 100}%` }} />
          <i className="hud__zone hud__zone--perfect" style={{ width: `${(WINDOW.perfect / WINDOW.good) * 100}%` }} />
          <i className="hud__center" />
          {recent.map((ms, i) => (
            <i
              key={i}
              className="hud__tick"
              style={{ left: `${50 + (Math.max(-max, Math.min(max, ms)) / max) * 50}%`, opacity: 0.2 + (0.8 * (i + 1)) / recent.length }}
            />
          ))}
        </div>
        <span className="hud__meter-r">LATE</span>
      </div>
    </div>
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

function offsetAdvice(ms: number) {
  const a = Math.abs(ms);
  if (a < 6) return 'タイミングのクセはほぼゼロ。完璧なポケット。';
  if (ms > 0) return a < 18 ? '少しだけ後ノリ。レイドバック感として武器にもなる。' : 'かなり遅め。メトロノームの「頭」を聴いて叩いてみよう。';
  return a < 18 ? '少しだけ前ノリ。勢いはあるので、気持ち落ち着いて。' : 'かなり走ってる。テンポを下げて体に入れよう。';
}

function Results() {
  const r = usePractice((s) => s.result);
  const hist = usePractice((s) => (r ? s.history[r.lessonId] : undefined)) ?? [];
  if (!r) return null;
  const lesson = LESSONS.find((l) => l.id === r.lessonId)!;
  return (
    <div className="results" role="dialog" aria-label="結果">
      <div className={`results__grade g-${r.grade}`}>{r.grade}</div>
      <div className="results__body">
        <div className="results__title">
          {lesson.title} <span>{r.bpm.toFixed(0)} BPM</span>
          {r.newBest && <em>NEW BEST</em>}
        </div>
        <div className="results__acc">
          {r.acc.toFixed(1)}
          <small>%</small>
        </div>
        <div className="results__counts">
          {(['perfect', 'great', 'good', 'miss'] as const).map((k) => (
            <span key={k}>
              <i style={{ background: JUDGE_STYLE[k].color }} />
              {JUDGE_STYLE[k].label} <b>{r.counts[k]}</b>
            </span>
          ))}
          <span>
            <i style={{ background: 'var(--ink-faint)' }} />
            WRONG <b>{r.counts.extra}</b>
          </span>
          <span>MAX COMBO <b>{r.maxCombo}</b></span>
        </div>
        <div className="results__offset">
          平均 <b>{r.meanMs > 0 ? '+' : ''}{r.meanMs.toFixed(1)}ms</b>（{r.meanMs >= 0 ? '遅め' : '早め'}）— {offsetAdvice(r.meanMs)}
        </div>
        <div className="results__chart">
          <span className="results__chart-lbl">このレッスンの推移（直近 {Math.min(20, hist.length)} 回）</span>
          <Sparkline data={hist} height={44} />
        </div>
        <div className="results__actions">
          <button className="pbtn pbtn--go" onMouseDown={noFocus} onClick={startPractice}>もう一回</button>
          <button className="pbtn" onMouseDown={noFocus} onClick={replayTake}>自分の演奏を聴く</button>
          <button className="pbtn pbtn--ghost" onMouseDown={noFocus} onClick={() => usePractice.getState().closeResult()}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

// ─── View ───────────────────────────────────────────────────────────────────

export function Practice() {
  const status = usePractice((s) => s.status);
  const loops = usePractice((s) => s.loops);
  const tempoPct = usePractice((s) => s.tempoPct);
  const guide = usePractice((s) => s.guide);
  const lessonId = usePractice((s) => s.lessonId);
  const set = usePractice((s) => s.set);
  const lesson = LESSONS.find((l) => l.id === lessonId)!;
  const busy = status === 'running' || status === 'listening' || status === 'replaying';

  return (
    <div className="practice">
      <div className="lessons">
        {LESSONS.map((l) => (
          <LessonCard key={l.id} l={l} />
        ))}
      </div>
      <div className="practice__main">
        <div className="practice__bar">
          <button
            className={`pbtn ${status === 'running' ? 'pbtn--stop' : 'pbtn--go'}`}
            onMouseDown={noFocus}
            onClick={status === 'running' ? stopPractice : startPractice}
            title="Space"
          >
            {status === 'running' ? '■ STOP' : '▶ START'}
          </button>
          <button
            className="pbtn"
            disabled={status === 'running'}
            onMouseDown={noFocus}
            onClick={status === 'listening' ? stopPractice : listen}
          >
            {status === 'listening' ? '■ 停止' : '♪ お手本'}
          </button>
          <div className="seg">
            <span className="seg__label">LOOPS</span>
            {[2, 4, 8].map((n) => (
              <button key={n} className={loops === n ? 'is-on' : ''} disabled={busy} onMouseDown={noFocus} onClick={() => set({ loops: n })}>
                {n}
              </button>
            ))}
          </div>
          <div className="seg">
            <span className="seg__label">TEMPO</span>
            {[0.6, 0.7, 0.8, 0.9, 1].map((p) => (
              <button key={p} className={tempoPct === p ? 'is-on' : ''} disabled={busy} onMouseDown={noFocus} onClick={() => set({ tempoPct: p })}>
                {Math.round(p * 100)}%
              </button>
            ))}
          </div>
          <button
            className={`tp__toggle${guide ? ' is-on' : ''}`}
            disabled={busy}
            onMouseDown={noFocus}
            onClick={() => set({ guide: !guide })}
            title="練習中もお手本の音を小さく鳴らす"
          >
            GUIDE
          </button>
          <span className="practice__state">
            {status === 'replaying' ? '▶ あなたの演奏を再生中' : status === 'listening' ? '♪ お手本を再生中' : `${Math.round(lesson.bpm * tempoPct)} BPM`}
          </span>
        </div>
        <p className="practice__desc">{lesson.description}</p>
        <div className="practice__stage">
          <Highway />
          <Results />
        </div>
        <Hud />
      </div>
    </div>
  );
}
