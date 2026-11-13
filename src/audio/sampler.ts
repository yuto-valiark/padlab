// Loading your own audio and chopping it onto pads.
import { useStudio } from '../state/store';
import { extractSlice, sliceRanges } from './chop';
import { engine } from './engine';

const NOTICE_KEY = 'padlab.sampling-notice.v1';

export const SAMPLING_NOTICE =
  '自分で録った音・自作の音・CC0 などの権利フリー素材は自由に使えます。他人の曲や市販音源をサンプリングして作品を公開・販売する場合は、権利者の許可（サンプル・クリアランス）が必要です。';

function showNoticeOnce() {
  try {
    if (localStorage.getItem(NOTICE_KEY)) return;
    localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    /* storage blocked: show it every time, which is fine */
  }
  useStudio.getState().setNotice(SAMPLING_NOTICE);
}

export const isAudioFile = (f: File) => f.type.startsWith('audio/') || /\.(wav|mp3|aiff?|flac|ogg|m4a|aac)$/i.test(f.name);

/** Decode a dropped/picked file onto a pad. Throws a friendly message on failure. */
export async function loadFileToPad(file: File, pad: number) {
  const ctx = engine.ctx;
  if (!ctx) throw new Error('オーディオがまだ起動していません');
  if (!isAudioFile(file)) throw new Error(`${file.name} は音声ファイルではないみたいです`);
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(`${file.name} を読み込めませんでした（WAV / MP3 / AIFF などを試してください）`);
  }
  engine.setBuffer(pad, buf, file.name.replace(/\.[^.]+$/, '').toUpperCase().slice(0, 24));
  useStudio.getState().setPad(pad, { start: 0, end: 1, reverse: false });
  useStudio.getState().select(pad);
  showNoticeOnce();
  return buf;
}

/** Cut `buf` at `markers` (sample positions) and put each slice on a pad of `bank`, from Pad 1 up. */
export function chopToBank(buf: AudioBuffer, markers: number[], bank: number, baseName: string) {
  const ranges = sliceRanges(markers, buf.length).slice(0, 16);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const s = useStudio.getState();
  ranges.forEach(([a, b], i) => {
    const data = extractSlice(chans, a, b, buf.sampleRate);
    const out = new AudioBuffer({ length: data[0].length, numberOfChannels: data.length, sampleRate: buf.sampleRate });
    data.forEach((d, c) => out.copyToChannel(d as Float32Array<ArrayBuffer>, c));
    const pad = bank * 16 + i;
    // Number first-ish and short, so it survives truncation on the pad.
    engine.setBuffer(pad, out, `${baseName.slice(0, 8)}·${i + 1}`);
    s.setPad(pad, { start: 0, end: 1, reverse: false });
  });
  s.setBank(bank);
  showNoticeOnce();
  return ranges.length;
}
