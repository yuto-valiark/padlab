import { useEffect, useRef, useState } from 'react';
import { connectMidi, useMidi } from '../input/midi';
import { deleteProject, newProject, openProject, rename, saveAs, useProject } from '../state/project';

const noFocus = (e: React.MouseEvent) => e.preventDefault();

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const STATUS: Record<string, string> = { idle: '', dirty: '未保存', saving: '保存中…', saved: '保存済み', error: '保存エラー' };

function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'たった今';
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return new Date(t).toLocaleDateString('ja-JP');
}

function Projects() {
  const { open, setOpen, ref } = usePopover();
  const name = useProject((p) => p.name);
  const id = useProject((p) => p.id);
  const status = useProject((p) => p.status);
  const list = useProject((p) => p.list);
  const [editing, setEditing] = useState(false);

  return (
    <div className="proj" ref={ref}>
      {editing ? (
        <input
          className="proj__input"
          autoFocus
          defaultValue={name}
          onBlur={(e) => {
            rename(e.target.value.trim());
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <button className="proj__name" onMouseDown={noFocus} onClick={() => setOpen(!open)} onDoubleClick={() => setEditing(true)} title="クリックでプロジェクト一覧 / ダブルクリックで名前変更">
          {name} <span>▾</span>
        </button>
      )}
      <span className={`proj__status proj__status--${status}`}>{STATUS[status]}</span>
      {open && (
        <div className="pop">
          <div className="pop__actions">
            <button className="tp__small" onMouseDown={noFocus} onClick={() => { newProject(); setOpen(false); }}>NEW</button>
            <button
              className="tp__small"
              onMouseDown={noFocus}
              onClick={() => {
                const n = prompt('新しい名前で保存', `${name} COPY`);
                if (n !== null) saveAs(n.trim());
                setOpen(false);
              }}
            >
              SAVE AS
            </button>
            <button className="tp__small" onMouseDown={noFocus} onClick={() => { setEditing(true); setOpen(false); }}>RENAME</button>
          </div>
          <ul className="pop__list">
            {list.map((p) => (
              <li key={p.id} className={p.id === id ? 'is-on' : ''}>
                <button
                  className="pop__item"
                  onMouseDown={noFocus}
                  onClick={() => {
                    if (p.id !== id) openProject(p.id);
                    setOpen(false);
                  }}
                >
                  <span>{p.name}</span>
                  <small>{ago(p.updatedAt)}</small>
                </button>
                <button
                  className="pop__del"
                  onMouseDown={noFocus}
                  onClick={() => confirm(`「${p.name}」を削除しますか？（元に戻せません）`) && deleteProject(p.id)}
                  aria-label={`${p.name} を削除`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="pop__note">このブラウザの中に自動保存されます（読み込んだ音も含む）。</p>
        </div>
      )}
    </div>
  );
}

function Midi() {
  const { open, setOpen, ref } = usePopover();
  const status = useMidi((m) => m.status);
  const inputs = useMidi((m) => m.inputs);
  const map = useMidi((m) => m.map);
  const setMap = useMidi((m) => m.setMap);
  const last = useMidi((m) => m.last);
  const on = status === 'on' && inputs.length > 0;
  return (
    <div className="proj" ref={ref}>
      <button className={`midibtn${on ? ' is-on' : ''}`} onMouseDown={noFocus} onClick={() => setOpen(!open)} title="MIDI コントローラー">
        <i key={last?.n} />
        MIDI
      </button>
      {open && (
        <div className="pop pop--midi">
          {status === 'on' ? (
            <>
              <p className="pop__note">{inputs.length ? `接続中: ${inputs.join(', ')}` : 'MIDI 機器が見つかりません。USB で接続してください。'}</p>
              <div className="seg">
                <span className="seg__label">MAP</span>
                <button className={map === 'bank' ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => setMap('bank')} title="C1〜D#2 → 今のバンクの Pad 1〜16">BANK</button>
                <button className={map === 'fixed' ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => setMap('fixed')} title="C1〜D#6 → A01〜D16 の全64パッド">ALL 64</button>
              </div>
              <p className="pop__note">{last ? `最後のノート: ${last.note}（強さ ${last.vel}）` : 'パッドを叩くとここに表示'}</p>
            </>
          ) : (
            <>
              <p className="pop__note">
                {status === 'unsupported'
                  ? 'このブラウザは Web MIDI に対応していません（Chrome / Edge を使ってください）。'
                  : status === 'denied'
                    ? 'MIDI へのアクセスが許可されませんでした。ブラウザの設定で許可してください。'
                    : 'MIDI パッドやキーボードをつなぐと、それで叩けます。強さもそのまま反映されます。'}
              </p>
              <button className="pbtn pbtn--go" disabled={status === 'connecting'} onMouseDown={noFocus} onClick={connectMidi}>
                {status === 'connecting' ? '接続中…' : '接続する'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ProjectBar() {
  return (
    <div className="projbar">
      <Projects />
      <Midi />
    </div>
  );
}
