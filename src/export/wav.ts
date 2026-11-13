/** Encode PCM channels as a WAV file (16- or 24-bit, little-endian). */
export function encodeWav(channels: Float32Array[], sampleRate: number, bits: 16 | 24 = 24): ArrayBuffer {
  const nch = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bps = bits / 8;
  const dataLen = frames * nch * bps;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, nch, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * nch * bps, true);
  dv.setUint16(32, nch * bps, true);
  dv.setUint16(34, bits, true);
  str(36, 'data');
  dv.setUint32(40, dataLen, true);
  let o = 44;
  const max = bits === 16 ? 32767 : 8388607;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++) {
      const v = Math.round(Math.max(-1, Math.min(1, channels[c][i])) * max);
      if (bits === 16) dv.setInt16(o, v, true);
      else {
        dv.setUint8(o, v & 0xff);
        dv.setUint8(o + 1, (v >> 8) & 0xff);
        dv.setUint8(o + 2, (v >> 16) & 0xff);
      }
      o += bps;
    }
  }
  return buf;
}
