// ============================================================
// Demo app helpers
// ============================================================

import { bytesToAscii, bytesToHex, hexToBytes } from './lib';
import type { NonPrintable, ReceiveBreak } from './types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  } as Intl.DateTimeFormatOptions) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

/** Shared empty buffer for freshly created received lines. */
export const EMPTY_BYTES = new Uint8Array(0);

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (b.length === 0) return a;
  if (a.length === 0) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ---- Receive line splitting ----

/**
 * One piece of a received chunk. `data` keeps the terminator bytes (hex view
 * stays faithful); `textBytes` excludes them (the row break marks the ending).
 * `absorb` marks bytes that only complete the previous row's terminator and
 * must be appended to that row's data without touching its text.
 */
export interface BreakSegment {
  data: Uint8Array;
  textBytes: Uint8Array;
  terminated: boolean;
  absorb?: boolean;
}

export interface LineSplitter {
  split(bytes: Uint8Array): BreakSegment[];
  reset(): void;
}

/** Parse a "0D 0A" style hex input into bytes; null when empty or invalid. */
export function parseBreakBytes(input: string): Uint8Array | null {
  if (!input.trim()) return null;
  try {
    const bytes = hexToBytes(input);
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Create the stateful receive-line splitter. It holds back a chunk-final
 * partial match until the next chunk proves whether it is a delimiter, so a
 * custom `0D 0A` behaves exactly like the CRLF mode and both survive a break
 * split across two reads.
 */
export function createLineSplitter(mode: ReceiveBreak, custom: Uint8Array | null): LineSplitter {
  let delimiter: Uint8Array | null = null;
  if (mode === 'crlf') delimiter = Uint8Array.of(0x0d, 0x0a);
  else if (mode === 'cr') delimiter = Uint8Array.of(0x0d);
  else if (mode === 'lf') delimiter = Uint8Array.of(0x0a);
  else if (mode === 'custom') delimiter = custom;
  // No usable delimiter (follow, or custom with invalid hex): historical mode.
  return delimiter && delimiter.length > 0 ? createDelimiterSplitter(delimiter) : createFollowSplitter();
}

/**
 * Historical behaviour: CR, LF and CRLF each end a line. Reads are timing-based
 * rather than message-aligned, so a CR that ends a chunk holds a note that the
 * LF completing a CRLF pair may still be in flight — it is absorbed into the
 * finished line's data instead of opening a blank row.
 */
function createFollowSplitter(): LineSplitter {
  let pendingCR = false;
  return {
    reset() {
      pendingCR = false;
    },
    split(bytes) {
      const segments: BreakSegment[] = [];
      if (bytes.length === 0) return segments;
      let start = 0;
      if (pendingCR) {
        pendingCR = false;
        if (bytes[0] === 0x0a) {
          segments.push({ data: bytes.subarray(0, 1), textBytes: EMPTY_BYTES, terminated: false, absorb: true });
          start = 1;
        }
      }
      for (let i = start; i < bytes.length;) {
        const b = bytes[i];
        if (b !== 0x0d && b !== 0x0a) {
          i++;
          continue;
        }
        const crlf = b === 0x0d && bytes[i + 1] === 0x0a;
        const end = crlf ? i + 2 : i + 1;
        segments.push({ data: bytes.subarray(start, end), textBytes: bytes.subarray(start, i), terminated: true });
        if (b === 0x0d && !crlf && end === bytes.length) pendingCR = true;
        start = i = end;
      }
      if (start < bytes.length) {
        segments.push({ data: bytes.subarray(start), textBytes: bytes.subarray(start), terminated: false });
      }
      return segments;
    },
  };
}

/** Exact delimiter mode: only this byte sequence ends a line. */
function createDelimiterSplitter(delimiter: Uint8Array): LineSplitter {
  const dlen = delimiter.length;
  // Bytes held from the previous chunk that may be the start of a delimiter.
  // Typed as plain Uint8Array: subarray() yields ArrayBufferLike, not ArrayBuffer.
  let held: Uint8Array = EMPTY_BYTES;

  const matchesAt = (buf: Uint8Array, at: number): boolean => {
    for (let j = 0; j < dlen; j++) if (buf[at + j] !== delimiter[j]) return false;
    return true;
  };

  /** Length of the tail that is a proper prefix of the delimiter. */
  const holdLength = (tail: Uint8Array): number => {
    for (let k = Math.min(dlen - 1, tail.length); k > 0; k--) {
      let match = true;
      for (let j = 0; j < k; j++) {
        if (tail[tail.length - k + j] !== delimiter[j]) {
          match = false;
          break;
        }
      }
      if (match) return k;
    }
    return 0;
  };

  return {
    reset() {
      held = EMPTY_BYTES;
    },
    split(bytes) {
      const segments: BreakSegment[] = [];
      const pending = held;
      const buf = pending.length > 0 ? concatBytes(pending, bytes) : bytes;
      held = EMPTY_BYTES;
      let start = 0;
      // A delimiter that only completes here belongs to the row the previous
      // chunk left open: hand its bytes back as an absorb segment so the row
      // closes exactly like the historical CR/LF behaviour.
      if (pending.length > 0 && matchesAt(buf, 0)) {
        segments.push({
          data: buf.subarray(0, dlen),
          textBytes: EMPTY_BYTES,
          terminated: true,
          absorb: true,
        });
        start = dlen;
      }
      for (let i = start; i + dlen <= buf.length; i++) {
        if (!matchesAt(buf, i)) continue;
        segments.push({ data: buf.subarray(start, i + dlen), textBytes: buf.subarray(start, i), terminated: true });
        start = i + dlen;
        i = start - 1; // the loop's i++ resumes scanning after the delimiter
      }
      // Hold back the longest tail that is a proper prefix of the delimiter.
      // None of it has been reported yet, so a mid-delimiter break is safe.
      const tail = buf.subarray(start);
      const hold = holdLength(tail);
      const emitEnd = tail.length - hold;
      if (emitEnd > 0) {
        segments.push({ data: tail.subarray(0, emitEnd), textBytes: tail.subarray(0, emitEnd), terminated: false });
      }
      if (hold > 0) held = tail.subarray(emitEnd);
      return segments;
    },
  };
}

// ---- Control character display ----

/**
 * Byte rows for the hexdump view. Full rows are `width` bytes; a short final
 * row pads its hex slots with `..` and its ASCII slots with `.` — never with
 * bytes the device did not send.
 */
export function hexdumpRows(bytes: Uint8Array, width = 16): Array<{ hex: string; ascii: string }> {
  const rows: Array<{ hex: string; ascii: string }> = [];
  for (let offset = 0; offset < bytes.length; offset += width) {
    const chunk = bytes.subarray(offset, offset + width);
    rows.push({
      hex: bytesToHex(chunk) + ' ..'.repeat(width - chunk.length),
      ascii: bytesToAscii(chunk).padEnd(width, '.'),
    });
  }
  return rows;
}
/** One text run. `escaped` runs are control bytes shown as bare hex (red). */
export interface TextRun {
  text: string;
  escaped: boolean;
}

/** Control bytes each hex mode keeps literal (CR/LF always kept). */
const NON_PRINTABLE_KEEP: Record<NonPrintable, string> = {
  hidden: '',
  'hex-except-crlf': '\r\n',
  'hex-except-crlf-tab': '\r\n\t',
  'hex-except-crlf-tab-bksp': '\r\n\t\b',
  'hex-all': '',
  print: '',
};

/** C0 control codes (0x00-0x1F) and DEL (0x7F). */
export function isControlCode(code: number): boolean {
  return code <= 0x1f || code === 0x7f;
}

/**
 * Split decoded text into plain runs and control-character escapes for the
 * text view. `hidden` drops control characters, `print` keeps the text as-is,
 * and the hex modes render each remaining one as its bare uppercase hex byte
 * (e.g. `0D`) for the row to colour. The ASCII column of the hex views keeps
 * its own `.` dots — this helper never runs for it.
 */
export function splitControlChars(text: string, mode: NonPrintable): TextRun[] {
  if (mode === 'print') return [{ text, escaped: false }];
  const keep = NON_PRINTABLE_KEEP[mode];
  const runs: TextRun[] = [];
  let plain = '';
  const flushPlain = () => {
    if (plain) {
      runs.push({ text: plain, escaped: false });
      plain = '';
    }
  };
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (!isControlCode(code) || keep.includes(ch)) {
      plain += ch;
      continue;
    }
    if (mode === 'hidden') continue;
    flushPlain();
    runs.push({ text: code.toString(16).toUpperCase().padStart(2, '0'), escaped: true });
  }
  flushPlain();
  return runs;
}
