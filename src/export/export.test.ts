import { describe, expect, it } from 'vitest';
import { encodeMidi, vlq } from './midi';
import { encodeWav } from './wav';
import { crc32, zip } from './zip';

const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));

describe('encodeWav', () => {
  it('writes a valid 24-bit stereo header and data size', () => {
    const buf = new Uint8Array(encodeWav([new Float32Array(10), new Float32Array(10)], 48000, 24));
    const dv = new DataView(buf.buffer);
    expect(ascii(buf, 0, 4)).toBe('RIFF');
    expect(ascii(buf, 8, 4)).toBe('WAVE');
    expect(dv.getUint16(22, true)).toBe(2);
    expect(dv.getUint32(24, true)).toBe(48000);
    expect(dv.getUint16(34, true)).toBe(24);
    expect(dv.getUint32(40, true)).toBe(10 * 2 * 3);
    expect(buf.length).toBe(44 + 60);
  });
  it('clips and scales 16-bit samples', () => {
    const dv = new DataView(encodeWav([new Float32Array([1, -2, 0.5])], 44100, 16));
    expect(dv.getInt16(44, true)).toBe(32767);
    expect(dv.getInt16(46, true)).toBe(-32767);
    expect(dv.getInt16(48, true)).toBe(16384);
  });
});

describe('midi', () => {
  it('vlq', () => {
    expect(vlq(0)).toEqual([0]);
    expect(vlq(0x7f)).toEqual([0x7f]);
    expect(vlq(0x80)).toEqual([0x81, 0x00]);
    expect(vlq(0x3fff)).toEqual([0xff, 0x7f]);
  });
  it('writes header, tempo and notes', () => {
    const m = encodeMidi([{ tick: 0, note: 36, vel: 1, length: 24 }], 120, 96);
    expect(ascii(m, 0, 4)).toBe('MThd');
    expect((m[12] << 8) | m[13]).toBe(96);
    expect(ascii(m, 14, 4)).toBe('MTrk');
    const s = [...m].join(',');
    expect(s).toContain([0xff, 0x51, 0x03, 0x07, 0xa1, 0x20].join(',')); // 500000 µs/qn
    expect(s).toContain([0x99, 36, 127].join(','));
    expect(s).toContain([0x89, 36, 0].join(','));
    expect([...m.slice(-4)]).toEqual([0x00, 0xff, 0x2f, 0x00]);
  });
});

describe('zip', () => {
  it('crc32 of "123456789"', () => expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926));
  it('has local headers and an end record', () => {
    const z = zip([{ name: 'a.txt', data: new Uint8Array([1, 2, 3]) }]);
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(dv.getUint16(z.length - 22 + 10, true)).toBe(1);
  });
});
