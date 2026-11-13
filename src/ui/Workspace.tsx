import { useStudio, type WorkTab } from '../state/store';
import { BankSelect } from './BankSelect';
import { FxRack } from './FxRack';
import { Inspector } from './Inspector';
import { Mixer } from './Mixer';
import { Practice } from './Practice';
import { Sequencer } from './Sequencer';
import { Song } from './Song';
import { Transport } from './Transport';

const TABS: { id: WorkTab; label: string }[] = [
  { id: 'seq', label: 'SEQUENCER' },
  { id: 'song', label: 'SONG' },
  { id: 'pad', label: 'PAD EDIT' },
  { id: 'mixer', label: 'MIXER' },
  { id: 'fx', label: 'FX' },
  { id: 'practice', label: 'PRACTICE' },
];

export function Workspace() {
  const tab = useStudio((s) => s.tab);
  const setTab = useStudio((s) => s.setTab);
  return (
    <section className="panel work">
      <Transport />
      <div className="work__bar">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab${tab === t.id ? ' is-on' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <BankSelect />
      </div>
      <div className="work__body">{
          { seq: <Sequencer />, song: <Song />, pad: <Inspector />, mixer: <Mixer />, fx: <FxRack />, practice: <Practice /> }[tab]
        }</div>
    </section>
  );
}
