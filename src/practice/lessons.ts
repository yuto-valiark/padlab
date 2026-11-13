// Practice lessons. Steps are 1/16 notes (16 per bar); `slot` is the pad (0 = Pad 1 = Z key)
// within the lesson's bank.
import { STEP_TICKS } from '../audio/sequence';

export interface LessonHit { slot: number; step: number; vel?: number }

export interface Lesson {
  id: string;
  title: string;
  genre: string;
  description: string;
  bank: number;
  bpm: number;
  bars: number;
  swing: number;
  level: 1 | 2 | 3;
  hits: LessonHit[];
}

const every = (slot: number, from: number, to: number, by: number, vel?: number): LessonHit[] => {
  const out: LessonHit[] = [];
  for (let s = from; s < to; s += by) out.push({ slot, step: s, vel });
  return out;
};

// Bank A slots: 0 KICK BOOM(Z) 2 SNARE FAT(C) 3 CLAP(V) 4 HAT CLOSED(A) 5 HAT OPEN(S) 6 SHAKER(D)
// Bank B slots: 8 TRAP KICK(Q) 9 TRAP SNARE(W) 12 HAT TICK(1) 13 HAT OPEN(2)
// Bank C slots: 0–7 chords (Z X C V A S D F), 8–15 bass F G A B♭ C D E F (Q W E R 1 2 3 4)
export const LESSONS: Lesson[] = [
  {
    id: 'first-step',
    title: 'はじめの一歩',
    genre: 'BASIC 8 BEAT',
    description: 'キック(Z)・スネア(C)・ハット(A)の基本。左手でハット、右手でキックとスネア。',
    bank: 0,
    bpm: 80,
    bars: 1,
    swing: 50,
    level: 1,
    hits: [
      ...every(4, 0, 16, 2),
      { slot: 0, step: 0 },
      { slot: 0, step: 8 },
      { slot: 2, step: 4 },
      { slot: 2, step: 12 },
    ],
  },
  {
    id: 'boom-bap',
    title: 'ブーンバップ',
    genre: 'BOOM BAP · 90s',
    description: 'ずらしたキックと、オープンハット(S)で一拍の抜け。首が振れたら合格。',
    bank: 0,
    bpm: 90,
    bars: 1,
    swing: 50,
    level: 2,
    hits: [
      ...every(4, 0, 14, 2),
      { slot: 5, step: 14 },
      { slot: 0, step: 0 },
      { slot: 0, step: 7 },
      { slot: 0, step: 10 },
      { slot: 2, step: 4 },
      { slot: 2, step: 12 },
    ],
  },
  {
    id: 'lofi-swing',
    title: 'ローファイ・スウィング',
    genre: 'LO-FI · SWING 62%',
    description: '16分のシェイカー(D)がヨレる。裏の音は少し遅れて叩くのが正解。',
    bank: 0,
    bpm: 82,
    bars: 1,
    swing: 62,
    level: 2,
    hits: [
      ...every(6, 0, 16, 1, 0.6),
      { slot: 0, step: 0 },
      { slot: 0, step: 6 },
      { slot: 0, step: 9 },
      { slot: 3, step: 4 },
      { slot: 3, step: 12 },
    ],
  },
  {
    id: 'chord-walk',
    title: 'コード・ウォーク',
    genre: 'KEYS · 2 HANDS',
    description: '左手でコード、右手でベース。パッドで和音を弾くスタイルの入口。',
    bank: 2,
    bpm: 86,
    bars: 2,
    swing: 50,
    level: 2,
    hits: [
      { slot: 3, step: 0 },
      { slot: 11, step: 0 },
      { slot: 4, step: 10 },
      { slot: 12, step: 10 },
      { slot: 2, step: 16 },
      { slot: 10, step: 16 },
      { slot: 5, step: 26 },
      { slot: 13, step: 26 },
    ],
  },
  {
    id: 'house',
    title: '四つ打ちハウス',
    genre: 'HOUSE · 122',
    description: '4つ打ちキック(Z)と裏のオープンハット(S)。速いけどシンプル。',
    bank: 0,
    bpm: 122,
    bars: 1,
    swing: 50,
    level: 3,
    hits: [...every(0, 0, 16, 4), ...every(5, 2, 16, 4), { slot: 3, step: 4 }, { slot: 3, step: 12 }],
  },
  {
    id: 'trap-roll',
    title: 'トラップ・ロール',
    genre: 'TRAP · HALF-TIME',
    description: 'ハット(1)の16分ロール。⌥を押しながら1を押しっぱなしでも叩ける。',
    bank: 1,
    bpm: 140,
    bars: 1,
    swing: 50,
    level: 3,
    hits: [
      ...every(12, 0, 12, 2),
      ...every(12, 12, 16, 1, 0.7),
      { slot: 8, step: 0 },
      { slot: 8, step: 3 },
      { slot: 8, step: 10 },
      { slot: 9, step: 8 },
    ],
  },
];

export const lessonTicks = (l: Lesson) => l.bars * 16 * STEP_TICKS;
