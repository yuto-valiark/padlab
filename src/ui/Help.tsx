import { useEffect } from 'react';
import { useUi } from './uiStore';

const ROWS = [
  ['1', '2', '3', '4'],
  ['Q', 'W', 'E', 'R'],
  ['A', 'S', 'D', 'F'],
  ['Z', 'X', 'C', 'V'],
];
const PADNUM: Record<string, number> = { Z: 1, X: 2, C: 3, V: 4, A: 5, S: 6, D: 7, F: 8, Q: 9, W: 10, E: 11, R: 12, '1': 13, '2': 14, '3': 15, '4': 16 };

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: '演奏',
    items: [
      [['⇧', '＋', 'パッド'], '弱く叩く（ゴーストノート）'],
      [['⌥', '＋', 'パッド長押し'], 'ノートリピート（連打）'],
      [['[', ']'], '連打の細かさ 1/4〜1/32'],
      [['←', '→'], 'バンク A〜D 切り替え'],
    ],
  },
  {
    title: '録音・再生',
    items: [
      [['Space'], '再生 / 停止（PRACTICE タブでは練習スタート）'],
      [['Enter'], '録音（止まっていればカウントして開始）'],
      [['M'], 'メトロノーム ON/OFF'],
      [['Delete', '＋', 'パッド'], 'そのパッドのノートを全消去'],
      [['⌘', 'Z'], '元に戻す'],
      [['⇧', '⌘', 'Z'], 'やり直す'],
    ],
  },
  {
    title: 'テンポ',
    items: [
      [['T'], 'タップテンポ'],
      [['−', '='], 'BPM ±1（⇧ で ±0.1）'],
    ],
  },
  {
    title: 'その他',
    items: [
      [['?'], 'このヘルプ'],
      [['Esc'], '閉じる'],
    ],
  },
];

export function Help() {
  const help = useUi((s) => s.help);
  const setHelp = useUi((s) => s.setHelp);
  const startTour = useUi((s) => s.startTour);

  useEffect(() => {
    if (!help) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setHelp(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [help, setHelp]);

  if (!help) return null;
  return (
    <div className="help" role="dialog" aria-label="ショートカット一覧" onPointerDown={(e) => e.target === e.currentTarget && setHelp(false)}>
      <div className="help__card">
        <header className="help__head">
          <h2>KEYBOARD</h2>
          <button className="help__close" onMouseDown={(e) => e.preventDefault()} onClick={() => setHelp(false)} aria-label="閉じる">
            ×
          </button>
        </header>
        <div className="help__body">
          <div className="help__pads">
            {ROWS.map((r) => (
              <div key={r[0]} className="help__row">
                {r.map((k) => (
                  <span key={k} className="help__pad">
                    <b>{k}</b>
                    <small>PAD {PADNUM[k]}</small>
                  </span>
                ))}
              </div>
            ))}
            <p>左下の Z が Pad 1（本物の MPC と同じ並び）。入力は英数モードで。</p>
          </div>
          <div className="help__lists">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                <ul>
                  {g.items.map(([keys, label]) => (
                    <li key={label}>
                      <span className="help__keys">
                        {keys.map((k, i) => (k === '＋' ? <i key={i}>＋</i> : <kbd key={i} className="kbd">{k}</kbd>))}
                      </span>
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
        <footer className="help__foot">
          <button className="pbtn" onMouseDown={(e) => e.preventDefault()} onClick={startTour}>
            ツアーをもう一度見る
          </button>
          <span>ノブ：ドラッグで回す · ⇧ で細かく · ダブルクリックで初期値 · ファイルをパッドにドロップで読み込み</span>
        </footer>
      </div>
    </div>
  );
}
