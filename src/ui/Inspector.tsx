// PAD EDIT: the sampler. Waveform with start/end + chop markers, envelope, filter, sends.
import { useEffect, useMemo, useRef, useState } from 'react';
import { detectTransients, equalSlices } from '../audio/chop';
import { engine } from '../audio/engine';
import { BANKS, CAT_COLOR, SOUNDS } from '../audio/kit';
import { chopToBank, loadFileToPad, SAMPLING_NOTICE } from '../audio/sampler';
import { PAD_LABELS } from '../input/keymap';
import { DEFAULT_PAD, useStudio, type FilterType, type PadParams } from '../state/store';
import { Knob } from './Knob';
import { onPadHit } from './hitBus';
import { useCanvas } from './useCanvas';

const noFocus = (e: React.MouseEvent) => e.preventDefault();
const dB = (v: number) => (v <= 0.001 ? '-∞' : `${(20 * Math.log10(v)).toFixed(1)}dB`);
const sec = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`);
// Cutoff knob works on a 0–1 log scale: 20 Hz … 20 kHz.
const toHz = (x: number) => 20 * Math.pow(1000, x);
const fromHz = (f: number) => Math.log(f / 20) / Math.log(1000);
const hz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);

function peaks(buf: AudioBuffer | undefined, n: number) {
  const out = new Float32Array(n);
  if (!buf) return out;
  const d = buf.getChannelData(0);
  const per = Math.max(1, Math.floor(d.length / n));
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * per; j < Math.min(d.length, (i + 1) * per); j++) m = Math.max(m, Math.abs(d[j]));
    out[i] = m;
  }
  return out;
}

type Drag = { kind: 'start' | 'end' } | { kind: 'marker'; i: number } | null;

function Wave({ pad, buf, color, p, chop, markers, setMarkers }: {
  pad: number;
  buf: AudioBuffer | undefined;
  color: string;
  p: PadParams;
  chop: boolean;
  markers: number[];
  setMarkers: (m: number[]) => void;
}) {
  const data = useMemo(() => peaks(buf, 600), [buf]);
  const head = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);
  const setPad = useStudio((s) => s.setPad);
  const len = buf?.length ?? 1;

  const ref = useCanvas(
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const mid = h / 2;
      const bw = w / data.length;
      const lo = Math.min(p.start, p.end);
      const hi = Math.max(p.start, p.end);
      for (let i = 0; i < data.length; i++) {
        const x = i / data.length;
        const inside = chop || (x >= lo && x <= hi);
        g.fillStyle = inside ? color : 'rgba(239,230,212,0.16)';
        const a = Math.max(0.6, data[i] * (h / 2 - 6));
        g.fillRect(i * bw, mid - a, Math.max(1, bw - 0.3), a * 2);
      }
      if (!chop) {
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(0, 0, lo * w, h);
        g.fillRect(hi * w, 0, w - hi * w, h);
      } else {
        markers.forEach((m, i) => {
          const x = (m / len) * w;
          g.fillStyle = '#ffd38a';
          g.fillRect(Math.round(x), 0, 1.5, h);
          g.font = '600 9px "IBM Plex Mono"';
          g.fillText(String(i + 1), x + 3, 10);
        });
      }
    },
    false,
    [data, color, p.start, p.end, chop, markers, len],
  );

  useEffect(
    () =>
      onPadHit(pad, () => {
        if (!buf) return;
        const st = useStudio.getState().pads[pad];
        const rate = Math.pow(2, (st.tune + st.fine / 100) / 12);
        const lo = Math.min(st.start, st.end);
        const hi = Math.max(st.start, st.end);
        const dur = (((hi - lo) * buf.duration) / rate) * 1000;
        const [a, b] = st.reverse ? [hi, lo] : [lo, hi];
        head.current?.animate([{ left: `${a * 100}%`, opacity: 1 }, { left: `${b * 100}%`, opacity: 0.5 }], { duration: dur, easing: 'linear' });
      }),
    [pad, buf],
  );

  const xToFrac = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  return (
    <div
      ref={box}
      className={`wave wave--edit${chop ? ' is-chop' : ''}`}
      onPointerDown={(e) => {
        const f = xToFrac(e.clientX);
        const r = box.current!.getBoundingClientRect();
        const near = (x: number) => Math.abs(x - f) * r.width < 9;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (chop) {
          const i = markers.findIndex((m) => near(m / len));
          if (i >= 0 && (e.altKey || e.button === 2)) {
            setMarkers(markers.filter((_, k) => k !== i));
            return;
          }
          if (i >= 0) drag.current = { kind: 'marker', i };
          else {
            const next = [...markers, Math.round(f * len)].sort((a, b) => a - b);
            setMarkers(next);
            drag.current = { kind: 'marker', i: next.indexOf(Math.round(f * len)) };
          }
        } else {
          drag.current = near(p.end) ? { kind: 'end' } : near(p.start) ? { kind: 'start' } : { kind: Math.abs(f - p.start) < Math.abs(f - p.end) ? 'start' : 'end' };
          setPad(pad, { [drag.current.kind]: f } as Partial<PadParams>);
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const f = xToFrac(e.clientX);
        if (d.kind === 'marker') setMarkers(markers.map((m, k) => (k === d.i ? Math.round(f * len) : m)));
        else setPad(pad, { [d.kind]: f } as Partial<PadParams>);
      }}
      onPointerUp={() => {
        if (drag.current?.kind === 'marker') setMarkers([...markers].sort((a, b) => a - b));
        drag.current = null;
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={ref} />
      {!chop && (
        <>
          <div className="wave__handle" style={{ left: `${Math.min(p.start, p.end) * 100}%` }}>S</div>
          <div className="wave__handle wave__handle--end" style={{ left: `${Math.max(p.start, p.end) * 100}%` }}>E</div>
        </>
      )}
      <div className="wave__head" ref={head} />
      {!buf && <div className="wave__empty">音を読み込み中…</div>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="kgroup">
      <span className="kgroup__title">{title}</span>
      <div className="kgroup__body">{children}</div>
    </div>
  );
}

export function Inspector() {
  const pad = useStudio((s) => s.selected);
  const p = useStudio((s) => s.pads[pad]);
  const info = useStudio((s) => s.samples[pad]);
  const setPad = useStudio((s) => s.setPad);
  const [chop, setChop] = useState(false);
  const [markers, setMarkers] = useState<number[]>([]);
  const [sens, setSens] = useState(0.5);
  const [err, setErr] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // `info` changes whenever a sample is loaded, which re-renders and picks up the new buffer.
  const buf = engine.buffers[pad] as AudioBuffer | undefined;
  const def = SOUNDS[pad];
  const color = info?.user ? '#ffd38a' : CAT_COLOR[def.cat];
  const name = info?.name ?? def.name;
  const bank = Math.floor(pad / 16);
  const slot = pad % 16;
  const set = (k: Partial<PadParams>) => setPad(pad, k);

  useEffect(() => {
    setMarkers([]);
    setChop(false);
    setErr(null);
  }, [pad, buf]);

  const load = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    try {
      await loadFileToPad(f, pad);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const filters: { v: FilterType; l: string }[] = [
    { v: 'off', l: 'OFF' },
    { v: 'lp', l: 'LP' },
    { v: 'hp', l: 'HP' },
    { v: 'bp', l: 'BP' },
  ];

  return (
    <section
      className={`inspector${drop ? ' is-drop' : ''}`}
      style={{ '--c': color } as React.CSSProperties}
      onDragOver={(e) => {
        e.preventDefault();
        setDrop(true);
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrop(false);
        load(e.dataTransfer.files[0]);
      }}
    >
      <header className="inspector__head">
        <span className="inspector__id">
          {BANKS[bank].letter}
          {String(slot + 1).padStart(2, '0')}
        </span>
        <span className="inspector__key">{PAD_LABELS[slot]}</span>
        <span className="inspector__name">{name}</span>
        <span className="chip">{info?.user ? 'SAMPLE' : def.cat.toUpperCase()}</span>
        <span className="inspector__dur">{buf ? `${buf.duration.toFixed(2)}s` : ''}</span>
        <span className="inspector__tools">
          <input ref={file} type="file" accept="audio/*" hidden onChange={(e) => load(e.target.files?.[0])} />
          <button className="tp__small" onMouseDown={noFocus} onClick={() => file.current?.click()} title="音声ファイルを読み込む（パッドにドラッグ＆ドロップでも可）">
            LOAD
          </button>
          <button className={`tp__toggle${p.reverse ? ' is-on' : ''}`} onMouseDown={noFocus} onClick={() => set({ reverse: !p.reverse })}>
            REV
          </button>
          <button className={`tp__toggle${chop ? ' is-on' : ''}`} onMouseDown={noFocus} onClick={() => setChop(!chop)} title="サンプルを切り刻んでパッドに並べる">
            CHOP
          </button>
          <button
            className="tp__small"
            onMouseDown={noFocus}
            onClick={() => (info?.user ? engine.resetPad(pad) : setPad(pad, { ...DEFAULT_PAD }))}
            title="元のシンセ音と初期設定に戻す"
          >
            RESET
          </button>
        </span>
      </header>

      <Wave pad={pad} buf={buf} color={color} p={p} chop={chop} markers={markers} setMarkers={setMarkers} />

      {chop ? (
        <div className="chopbar">
          <span className="chopbar__hint">波形をクリックで切れ目を追加・ドラッグで移動・⌥クリックで削除</span>
          <button
            className="tp__small"
            onMouseDown={noFocus}
            onClick={() => buf && setMarkers(detectTransients(buf.getChannelData(0), buf.sampleRate, sens).slice(0, 16))}
          >
            AUTO
          </button>
          <Knob label="SENS" value={sens} min={0} max={1} def={0.5} size={34} format={(v) => `${Math.round(v * 100)}`} onChange={setSens} />
          {[4, 8, 16].map((n) => (
            <button key={n} className="tp__small" onMouseDown={noFocus} onClick={() => buf && setMarkers(equalSlices(n, buf.length))}>
              ÷{n}
            </button>
          ))}
          <button className="tp__small" onMouseDown={noFocus} onClick={() => setMarkers([])}>
            CLEAR
          </button>
          <span className="chopbar__count">{markers.length} SLICES</span>
          <span className="chopbar__to">
            配置先
            {BANKS.map((b, i) => (
              <button
                key={b.letter}
                className="tp__small chopbar__go"
                disabled={!buf || markers.length < 1}
                onMouseDown={noFocus}
                onClick={() => {
                  if (!buf) return;
                  const n = chopToBank(buf, markers, i, name);
                  setChop(false);
                  useStudio.getState().setNotice(`${n} 個のスライスを BANK ${b.letter} の Pad 1〜${n} に配置しました（元の音は各パッドの RESET で戻せます）`);
                }}
                title={`BANK ${b.letter} の Pad 1 から順に配置（上書き）`}
              >
                {b.letter}
              </button>
            ))}
          </span>
        </div>
      ) : (
        <div className="kgroups">
          <Group title="SOURCE">
            <Knob label="LEVEL" value={p.volume} min={0} max={1.5} def={1} size={40} color={color} format={dB} onChange={(v) => set({ volume: v })} />
            <Knob label="TUNE" value={p.tune} min={-24} max={24} step={1} bipolar def={0} size={40} color={color} format={(v) => `${v > 0 ? '+' : ''}${v}st`} onChange={(v) => set({ tune: v })} />
            <Knob label="FINE" value={p.fine} min={-50} max={50} step={1} bipolar def={0} size={40} color={color} format={(v) => `${v > 0 ? '+' : ''}${v}c`} onChange={(v) => set({ fine: v })} />
            <Knob label="PAN" value={p.pan} min={-1} max={1} bipolar def={0} size={40} color={color} format={(v) => (Math.abs(v) < 0.02 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)} onChange={(v) => set({ pan: v })} />
          </Group>
          <Group title="ENVELOPE">
            <Knob label="ATK" value={p.attack} min={0} max={1} def={0} size={40} color={color} format={sec} onChange={(v) => set({ attack: v })} />
            <Knob label="DEC" value={p.decay} min={0.01} max={2} def={0.3} size={40} color={color} format={sec} onChange={(v) => set({ decay: v })} />
            <Knob label="SUS" value={p.sustain} min={0} max={1} def={1} size={40} color={color} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ sustain: v })} />
            <Knob label="REL" value={p.release} min={0} max={2} def={0.05} size={40} color={color} format={sec} onChange={(v) => set({ release: v })} />
            <div className="seg seg--v">
              {(['oneshot', 'gate'] as const).map((m) => (
                <button key={m} className={p.mode === m ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => set({ mode: m })} title={m === 'gate' ? '押している間だけ鳴る' : '最後まで鳴る'}>
                  {m === 'oneshot' ? 'ONE SHOT' : 'GATE'}
                </button>
              ))}
            </div>
          </Group>
          <Group title="FILTER">
            <div className="seg seg--v">
              {filters.map((f) => (
                <button key={f.v} className={p.filter === f.v ? 'is-on' : ''} onMouseDown={noFocus} onClick={() => set({ filter: f.v })}>
                  {f.l}
                </button>
              ))}
            </div>
            <Knob label="CUTOFF" value={fromHz(p.cutoff)} min={0} max={1} def={fromHz(8000)} size={40} color={color} format={(v) => hz(toHz(v))} onChange={(v) => set({ cutoff: toHz(v) })} />
            <Knob label="RESO" value={p.reso} min={0.1} max={18} def={0.7} size={40} color={color} format={(v) => v.toFixed(1)} onChange={(v) => set({ reso: v })} />
          </Group>
          <Group title="SENDS">
            <Knob label="REVERB" value={p.sendRev} min={0} max={1} def={0} size={40} color="var(--cyan)" format={(v) => `${Math.round(v * 100)}`} onChange={(v) => set({ sendRev: v })} />
            <Knob label="DELAY" value={p.sendDly} min={0} max={1} def={0} size={40} color="var(--cyan)" format={(v) => `${Math.round(v * 100)}`} onChange={(v) => set({ sendDly: v })} />
          </Group>
        </div>
      )}
      {err && <p className="inspector__err">{err}</p>}
      {info?.user && !chop && <p className="inspector__notice">⚠ {SAMPLING_NOTICE}</p>}
      {drop && <div className="dropzone">ここにドロップして {BANKS[bank].letter}{String(slot + 1).padStart(2, '0')} に読み込む</div>}
    </section>
  );
}
