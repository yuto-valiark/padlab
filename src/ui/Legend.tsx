const K = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <kbd className={wide ? 'kbd kbd--wide' : 'kbd'}>{children}</kbd>
);

export function Legend() {
  return (
    <div className="legend">
      <span><K>Z</K>〜<K>4</K> 叩く</span>
      <span><K wide>⇧</K>＋叩く 弱く</span>
      <span><K wide>⌥</K>＋押しっぱなし 連打</span>
      <span><K>[</K><K>]</K> 連打の細かさ</span>
      <span><K>←</K><K>→</K> バンク</span>
      <span><K>T</K> タップ</span>
      <span><K>−</K><K>=</K> BPM</span>
      <span className="legend__help"><K>?</K> ぜんぶの操作</span>
      <span className="legend__touch">※ キーボードのあるパソコン向けです（画面のパッドはタップでも鳴ります）</span>
    </div>
  );
}
