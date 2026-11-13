// SONG tab: patterns, the arrangement, and export.
import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { songLayout } from '../audio/song';
import { download, exportMidi, exportStems, exportWav, type Source } from '../export/render';
import { useProject } from '../state/project';
import { MAX_PATTERNS, patternLabel, useStudio } from '../state/store';

const noFocus = (e: React.MouseEvent) => e.preventDefault();
const HUES = [32, 190, 340, 90, 260, 10, 150, 50, 300, 210, 120, 0, 230, 70, 280, 170];
const pColor = (i: number) => `hsl(${HUES[i % HUES.length]} 85% 62%)`;

function Patterns() {
  const patterns = useStudio((s) => s.patterns);
  const current = useStudio((s) => s.current);
  const s = useStudio.getState();
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <div className="songcol">
      <header className="songcol__head">
        <span className="kgroup__title">PATTERNS</span>
        <span className="songcol__count">{patterns.length}/{MAX_PATTERNS}</span>
      </header>
      <div className="plist">
        {patterns.map((p, i) => (
          <div
            key={i}
            className={`pitem${i === current ? ' is-on' : ''}`}
            style={{ '--pc': pColor(i) } as React.CSSProperties}
            onClick={() => s.selectPattern(i)}
            onDoubleClick={() => setEditing(i)}
            title="クリックで編集対象に / ダブルクリックで名前変更"
          >
            <span className="pitem__id">{patternLabel(i)}</span>
            {editing === i ? (
              <input
                className="pitem__input"
                autoFocus
                defaultValue={p.name ?? ''}
                placeholder="名前"
                onBlur={(e) => {
                  s.renamePattern(i, e.target.value.trim());
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <span className="pitem__name">{p.name ?? (p.notes.length ? '' : 'EMPTY')}</span>
            )}
            <span className="pitem__meta">
              {p.bars}BAR · {p.notes.length}
            </span>
            <button
              className="pitem__add"
              onMouseDown={noFocus}
              onClick={(e) => {
                e.stopPropagation();
                s.addSongStep(i);
              }}
              title="ソングの最後に追加"
            >
              ＋
            </button>
          </div>
        ))}
      </div>
      <div className="songcol__actions">
        <button className="tp__small" disabled={patterns.length >= MAX_PATTERNS} onMouseDown={noFocus} onClick={() => s.addPattern(false)}>
          NEW
        </button>
        <button className="tp__small" disabled={patterns.length >= MAX_PATTERNS} onMouseDown={noFocus} onClick={() => s.addPattern(true)} title="今のパターンを複製">
          DUP
        </button>
        <button
          className="tp__small tp__danger"
          disabled={patterns.length <= 1}
          onMouseDown={noFocus}
          onClick={() => {
            if (confirm(`${patternLabel(current)} を削除しますか？（ソングからも外れます）`)) s.deletePattern(current);
          }}
        >
          DELETE
        </button>
      </div>
    </div>
  );
}

function Arrangement() {
  const song = useStudio((s) => s.song);
  const patterns = useStudio((s) => s.patterns);
  const songMode = useStudio((s) => s.songMode);
  const s = useStudio.getState();
  const head = useRef<HTMLDivElement>(null);
  const { segments, total } = songLayout(song, patterns);
  const bpm = useStudio((st) => st.bpm);
  const seconds = (total / 96) * (60 / bpm);
  const [activeStep, setActiveStep] = useState(-1);

  useEffect(() => {
    let raf = 0;
    let last = -2;
    const loop = () => {
      const sp = engine.songPosition();
      if (head.current) {
        head.current.style.opacity = sp ? '1' : '0';
        if (sp) head.current.style.left = `${(sp.songTick / sp.total) * 100}%`;
      }
      const step = sp ? sp.seg.step : -1;
      if (step !== last) setActiveStep((last = step));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="songcol songcol--wide">
      <header className="songcol__head">
        <span className="kgroup__title">ARRANGEMENT</span>
        <div className="seg">
          <button className={!songMode ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => s.setSongMode(false)} title="今のパターンだけをループ">
            PATTERN
          </button>
          <button className={songMode ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => s.setSongMode(true)} title="下の並び順どおりに再生">
            SONG
          </button>
        </div>
        <span className="songcol__count">
          {total / 384} 小節 · {Math.floor(seconds / 60)}:{String(Math.round(seconds % 60)).padStart(2, '0')}
        </span>
      </header>
      <div className="timeline">
        {segments.map((seg, i) => (
          <i
            key={i}
            className={seg.step === activeStep ? 'is-on' : ''}
            style={{ flexGrow: seg.length, '--pc': pColor(seg.pattern) } as React.CSSProperties}
            title={patternLabel(seg.pattern)}
          />
        ))}
        <div className="timeline__head" ref={head} />
      </div>
      <ol className="steps">
        {song.map((st, i) => (
          <li key={i} className={`step${i === activeStep ? ' is-on' : ''}`} style={{ '--pc': pColor(st.pattern) } as React.CSSProperties}>
            <span className="step__n">{i + 1}</span>
            <select
              className="step__sel"
              value={st.pattern}
              onChange={(e) => s.setSongStep(i, { pattern: Number(e.target.value) })}
            >
              {patterns.map((p, k) => (
                <option key={k} value={k}>
                  {patternLabel(k)} {p.name ?? ''}
                </option>
              ))}
            </select>
            <span className="step__rep">
              <button onMouseDown={noFocus} onClick={() => s.setSongStep(i, { repeats: st.repeats - 1 })}>−</button>
              <b>×{st.repeats}</b>
              <button onMouseDown={noFocus} onClick={() => s.setSongStep(i, { repeats: st.repeats + 1 })}>＋</button>
            </span>
            <span className="step__tools">
              <button onMouseDown={noFocus} onClick={() => s.moveSongStep(i, -1)} disabled={i === 0} aria-label="上へ">↑</button>
              <button onMouseDown={noFocus} onClick={() => s.moveSongStep(i, 1)} disabled={i === song.length - 1} aria-label="下へ">↓</button>
              <button onMouseDown={noFocus} onClick={() => s.removeSongStep(i)} aria-label="削除">×</button>
            </span>
          </li>
        ))}
        {!song.length && <li className="steps__empty">左のパターンの「＋」で曲に追加</li>}
      </ol>
    </div>
  );
}

function Export() {
  const songMode = useStudio((s) => s.songMode);
  const songLen = useStudio((s) => songLayout(s.song, s.patterns).total);
  const name = useProject((p) => p.name);
  const [src, setSrc] = useState<'song' | 1 | 4 | 8>(songMode ? 'song' : 4);
  const [bits, setBits] = useState<16 | 24>(24);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const source: Source = src === 'song' ? { kind: 'song' } : { kind: 'pattern', loops: src };
  const base = `${name.replace(/[^\w\-ぁ-んァ-ヶ一-龠]+/g, '_')}_${Math.round(useStudio.getState().bpm)}bpm`;
  const empty = src === 'song' ? songLen === 0 : useStudio.getState().pattern.notes.length === 0;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setDone(null);
    try {
      await fn();
      setDone(`${label} を書き出しました`);
    } catch (e) {
      console.error(e);
      setDone(`失敗しました: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="songcol export">
      <header className="songcol__head">
        <span className="kgroup__title">EXPORT</span>
      </header>
      <div className="seg">
        <span className="seg__label">対象</span>
        <button className={src === 'song' ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => setSrc('song')}>SONG</button>
        {([1, 4, 8] as const).map((n) => (
          <button key={n} className={src === n ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => setSrc(n)} title={`今のパターンを ${n} 回ループ`}>
            PAT×{n}
          </button>
        ))}
      </div>
      <div className="seg">
        <span className="seg__label">WAV</span>
        {([24, 16] as const).map((b) => (
          <button key={b} className={bits === b ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => setBits(b)}>
            {b}bit
          </button>
        ))}
      </div>
      <div className="export__btns">
        <button className="pbtn pbtn--go" disabled={!!busy || empty} onMouseDown={noFocus} onClick={() => run('2MIX WAV', async () => download(await exportWav(source, bits), `${base}.wav`))}>
          2MIX .WAV
        </button>
        <button
          className="pbtn"
          disabled={!!busy || empty}
          onMouseDown={noFocus}
          onClick={() => run('STEMS', async () => download(await exportStems(source, bits, (d, t) => setBusy(`STEMS ${d}/${t}`)), `${base}_stems.zip`))}
          title="パッドごとに別々の WAV（ZIP）"
        >
          STEMS .ZIP
        </button>
        <button className="pbtn" disabled={!!busy || empty} onMouseDown={noFocus} onClick={() => run('MIDI', async () => download(exportMidi(source), `${base}.mid`))} title="DAW に持っていける MIDI（Pad1=C1）">
          .MID
        </button>
      </div>
      <p className="export__status">
        {busy ? `⏳ ${busy} をレンダリング中…` : empty ? 'ノートがありません' : done ?? 'エフェクトもそのまま書き出します（再生より速く処理）'}
      </p>
    </div>
  );
}

export function Song() {
  return (
    <div className="song">
      <Patterns />
      <Arrangement />
      <Export />
    </div>
  );
}
