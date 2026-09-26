import { describe, expect, it } from 'vitest';
import {
  createLineSplitter,
  formatTime,
  hexdumpRows,
  parseBreakBytes,
  splitControlChars,
  type BreakSegment,
} from './utils';
import type { ReceiveBreak } from './types';

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** One row as the console would show it (absorbed bytes folded into the row). */
interface Row {
  data: string;
  text: string;
  terminated: boolean;
}

/** Feed chunks through a splitter and fold its segments into rows. */
function rows(mode: ReceiveBreak, custom: Uint8Array | null, chunks: Uint8Array[]): Row[] {
  const splitter = createLineSplitter(mode, custom);
  return toRows(chunks.flatMap((chunk) => splitter.split(chunk)));
}

function toRows(segments: BreakSegment[]): Row[] {
  const out: Row[] = [];
  for (const segment of segments) {
    if (segment.absorb) {
      // Bytes that only complete the previous row's terminator.
      const last = out[out.length - 1];
      if (last) {
        last.data += dec(segment.data);
        last.terminated = last.terminated || segment.terminated;
      } else {
        out.push({ data: dec(segment.data), text: '', terminated: segment.terminated });
      }
      continue;
    }
    out.push({ data: dec(segment.data), text: dec(segment.textBytes), terminated: segment.terminated });
  }
  return out;
}

describe('formatTime', () => {
  // Local components, so the expectation holds in any timezone. Hour 0 is
  // avoided: `hour12: false` renders midnight as 24 on some ICU versions.
  it('formats HH:MM:SS with padded milliseconds', () => {
    expect(formatTime(new Date(2026, 0, 2, 3, 4, 5, 67))).toBe('03:04:05.067');
  });

  it('pads milliseconds to three digits', () => {
    expect(formatTime(new Date(2026, 0, 2, 3, 4, 5, 7))).toBe('03:04:05.007');
  });
});

describe('createLineSplitter', () => {
  describe('follow (default: CR, LF and CRLF all break)', () => {
    it('keeps terminator bytes in data and out of text', () => {
      expect(rows('follow', null, [enc('a\r'), enc('b\n'), enc('c\r\nd')])).toEqual([
        { data: 'a\r', text: 'a', terminated: true },
        { data: 'b\n', text: 'b', terminated: true },
        { data: 'c\r\n', text: 'c', terminated: true },
        { data: 'd', text: 'd', terminated: false },
      ]);
    });

    it('absorbs the LF that completes a CRLF pair split across chunks', () => {
      const splitter = createLineSplitter('follow', null);
      expect(splitter.split(enc('ab\r'))).toEqual([
        { data: enc('ab\r'), textBytes: enc('ab'), terminated: true },
      ]);
      expect(splitter.split(enc('\ncd'))).toEqual([
        { data: enc('\n'), textBytes: new Uint8Array(0), terminated: false, absorb: true },
        { data: enc('cd'), textBytes: enc('cd'), terminated: false },
      ]);
    });
  });

  describe('strict modes', () => {
    it('CRLF ignores a bare LF and holds a trailing CR', () => {
      // The delimiter completing across the chunk boundary attaches to the
      // row it ends — same shape the historical mode produces.
      expect(rows('crlf', null, [enc('a\nb\r'), enc('\nc')])).toEqual([
        { data: 'a\nb\r\n', text: 'a\nb', terminated: true },
        { data: 'c', text: 'c', terminated: false },
      ]);
    });

    it('LF keeps CR as data', () => {
      expect(rows('lf', null, [enc('a\rb\nc')])).toEqual([
        { data: 'a\rb\n', text: 'a\rb', terminated: true },
        { data: 'c', text: 'c', terminated: false },
      ]);
    });

    it('CR keeps LF as data', () => {
      expect(rows('cr', null, [enc('a\nb\rc')])).toEqual([
        { data: 'a\nb\r', text: 'a\nb', terminated: true },
        { data: 'c', text: 'c', terminated: false },
      ]);
    });
  });

  describe('custom', () => {
    const CRLF = Uint8Array.of(0x0d, 0x0a);

    it('matches CRLF mode, including a break split across chunks', () => {
      const chunks = [enc('hello\r'), enc('\nworld')];
      expect(rows('custom', CRLF, chunks)).toEqual(rows('crlf', null, chunks));
      expect(rows('custom', CRLF, chunks)).toEqual(rows('follow', null, chunks));
      expect(rows('custom', CRLF, chunks)).toEqual([
        { data: 'hello\r\n', text: 'hello', terminated: true },
        { data: 'world', text: 'world', terminated: false },
      ]);
    });

    it('holds a partial multi-byte delimiter until the next chunk', () => {
      const delimiter = Uint8Array.of(0xaa, 0xbb, 0xcc);
      const splitter = createLineSplitter('custom', delimiter);
      expect(splitter.split(Uint8Array.of(0x78, 0xaa))).toEqual([
        { data: Uint8Array.of(0x78), textBytes: Uint8Array.of(0x78), terminated: false },
      ]);
      expect(splitter.split(Uint8Array.of(0xbb))).toEqual([]);
      expect(splitter.split(Uint8Array.of(0xcc, 0x79))).toEqual([
        {
          data: Uint8Array.of(0xaa, 0xbb, 0xcc),
          textBytes: new Uint8Array(0),
          terminated: true,
          absorb: true,
        },
        { data: Uint8Array.of(0x79), textBytes: Uint8Array.of(0x79), terminated: false },
      ]);
    });

    it('falls back to follow mode without a usable delimiter', () => {
      expect(rows('custom', null, [enc('a\r\nb')])).toEqual(rows('follow', null, [enc('a\r\nb')]));
      expect(rows('custom', new Uint8Array(0), [enc('a\r\nb')])).toEqual(rows('follow', null, [enc('a\r\nb')]));
    });

    it('drops held bytes on reset', () => {
      const splitter = createLineSplitter('custom', CRLF);
      splitter.split(enc('ab\r'));
      splitter.reset();
      expect(splitter.split(enc('\ncd'))).toEqual([
        { data: enc('\ncd'), textBytes: enc('\ncd'), terminated: false },
      ]);
    });
  });
});

describe('hexdumpRows', () => {
  it('pads a short row with dots, never with null bytes', () => {
    expect(hexdumpRows(Uint8Array.of(0x41, 0x42))).toEqual([
      { hex: '41 42 .. .. .. .. .. .. .. .. .. .. .. .. .. ..', ascii: 'AB..............' },
    ]);
  });

  it('wraps at 16 bytes and pads the final row', () => {
    const rows = hexdumpRows(new Uint8Array(20).fill(0x41));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      hex: '41 41 41 41 .. .. .. .. .. .. .. .. .. .. .. ..',
      ascii: 'AAAA............',
    });
  });
});

describe('parseBreakBytes', () => {
  it('parses spaced and packed hex', () => {
    expect(parseBreakBytes('0D 0A')).toEqual(Uint8Array.of(0x0d, 0x0a));
    expect(parseBreakBytes('0d0a')).toEqual(Uint8Array.of(0x0d, 0x0a));
  });

  it('returns null for empty or invalid input', () => {
    expect(parseBreakBytes('')).toBeNull();
    expect(parseBreakBytes('   ')).toBeNull();
    expect(parseBreakBytes('ZZ')).toBeNull();
    expect(parseBreakBytes('0')).toBeNull();
  });
});

describe('splitControlChars', () => {
  it('print keeps the text unchanged', () => {
    expect(splitControlChars('a\tb\x00c', 'print')).toEqual([{ text: 'a\tb\x00c', escaped: false }]);
  });

  it('hidden drops control characters', () => {
    expect(splitControlChars('a\tb\x00c\x7f', 'hidden')).toEqual([{ text: 'abc', escaped: false }]);
  });

  it('hex-except-crlf keeps CR and LF literal', () => {
    expect(splitControlChars('a\r\nb\x00', 'hex-except-crlf')).toEqual([
      { text: 'a\r\nb', escaped: false },
      { text: '00', escaped: true },
    ]);
  });

  it('the except lists extend to TAB and backspace', () => {
    expect(splitControlChars('a\tb\x08c', 'hex-except-crlf')).toEqual([
      { text: 'a', escaped: false },
      { text: '09', escaped: true },
      { text: 'b', escaped: false },
      { text: '08', escaped: true },
      { text: 'c', escaped: false },
    ]);
    expect(splitControlChars('a\tb\x08c', 'hex-except-crlf-tab')).toEqual([
      { text: 'a\tb', escaped: false },
      { text: '08', escaped: true },
      { text: 'c', escaped: false },
    ]);
    expect(splitControlChars('a\tb\x08c', 'hex-except-crlf-tab-bksp')).toEqual([
      { text: 'a\tb\x08c', escaped: false },
    ]);
  });

  it('hex-all escapes every control character as uppercase hex', () => {
    expect(splitControlChars('a\t\r\n', 'hex-all')).toEqual([
      { text: 'a', escaped: false },
      { text: '09', escaped: true },
      { text: '0D', escaped: true },
      { text: '0A', escaped: true },
    ]);
    expect(splitControlChars('\x1f\x7f', 'hex-all')).toEqual([
      { text: '1F', escaped: true },
      { text: '7F', escaped: true },
    ]);
  });

  it('leaves plain text in one run', () => {
    expect(splitControlChars('hello', 'hex-except-crlf')).toEqual([{ text: 'hello', escaped: false }]);
  });
});
