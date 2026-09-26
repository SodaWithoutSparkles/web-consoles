import { useCallback, useEffect, useRef, useState } from 'react';
import { createStreamDecoder } from '../lib';
import { concatBytes, EMPTY_BYTES, generateId } from '../utils';
import type { ConnectionDirection, ConsoleLine } from '../types';

/** Max lines kept in state — bounds per-frame render work. */
const MAX_LINES = 500;

/**
 * Console line store. Lines live in a ref so transport events mutate them
 * synchronously: ordering can never interleave (a send closes the open
 * received line before it is appended), and a rAF mirrors a copy into state
 * once per frame. The last element may be an *open* received line still
 * collecting chunks.
 *
 * `isRawStream` (hex send mode) turns line splitting off: a binary stream
 * carries no meaningful 0x0d/0x0a, so rows break only on a user send.
 */
export function useConsoleLines(isRawStream: boolean) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);

  const linesRef = useRef<ConsoleLine[]>([]);
  const flushRafRef = useRef<number | null>(null);
  // Previous chunk ended on a bare CR: swallow a leading LF in the next chunk
  // so a CRLF pair split across reads stays one line break.
  const pendingCRRef = useRef(false);
  // Streaming decoder keeps a partial UTF-8 sequence across chunk boundaries.
  const decoderRef = useRef<((bytes: Uint8Array) => string) | null>(null);
  // Lets the connection's onData closure read the mode of the latest render.
  const rawStreamRef = useRef(isRawStream);
  rawStreamRef.current = isRawStream;

  const decodeChunk = useCallback((bytes: Uint8Array): string => {
    const decoder = decoderRef.current ?? (decoderRef.current = createStreamDecoder());
    return decoder(bytes);
  }, []);

  /** Mirror the ref into state once per frame (bounds per-frame render work). */
  const scheduleFlush = useCallback(() => {
    if (flushRafRef.current !== null) return;
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      const all = linesRef.current;
      if (all.length > MAX_LINES) linesRef.current = all.slice(-MAX_LINES);
      setLines(linesRef.current.slice());
    });
  }, []);

  /** End the open received line; the next chunk starts a new row. */
  const closeOpenLine = useCallback(() => {
    const lines = linesRef.current;
    const last = lines[lines.length - 1];
    if (last && last.direction === 'received' && last.open) {
      lines[lines.length - 1] = { ...last, open: false };
    }
  }, []);

  /**
   * Append a sent/system line. Both close any open received line first: a user
   * send interrupts the partial line, and subsequent incoming data starts a
   * new line after it.
   */
  const pushLine = useCallback((line: Omit<ConsoleLine, 'id' | 'timestamp'>) => {
    closeOpenLine();
    linesRef.current.push({ ...line, id: generateId(), timestamp: new Date() });
    scheduleFlush();
  }, [closeOpenLine, scheduleFlush]);

  const addLine = useCallback((data: Uint8Array, direction: ConnectionDirection, text?: string) => {
    pushLine({ data, direction, text });
  }, [pushLine]);

  /**
   * Append to the open received line, creating it (timestamped) on its first
   * byte. Nothing is held back: partial lines are visible immediately and keep
   * their identity until `terminated` marks a line ending.
   */
  const appendReceivedLine = useCallback((data: Uint8Array, text: string, terminated: boolean) => {
    const lines = linesRef.current;
    let line = lines[lines.length - 1];
    if (!line || line.direction !== 'received' || !line.open) {
      line = { id: generateId(), timestamp: new Date(), data: EMPTY_BYTES, text: '', direction: 'received', open: true };
      lines.push(line);
    }
    lines[lines.length - 1] = {
      ...line,
      data: concatBytes(line.data, data),
      // Text drops the terminator (the row itself marks the break); `data`
      // keeps its bytes so hex view stays faithful.
      text: (line.text ?? '') + text,
      open: !terminated,
    };
    scheduleFlush();
  }, [scheduleFlush]);

  /**
   * Feed one received chunk through the line splitter. Line breaks are CRLF /
   * LF / CR — the same endings the send side offers. Complete lines become
   * closed rows; a trailing partial stays open and visible until more data or
   * a user send arrives.
   */
  const handleReceivedBytes = useCallback((bytes: Uint8Array) => {
    if (bytes.length === 0) return;
    let start = 0;

    // CRLF split across two reads: the CR already ended its line, so the LF
    // that completes the pair must not open a blank row.
    if (pendingCRRef.current) {
      pendingCRRef.current = false;
      if (bytes[0] === 0x0a) {
        start = 1;
        const lines = linesRef.current;
        const last = lines[lines.length - 1];
        if (last && last.direction === 'received') {
          // Keep the byte for hex view; text is already terminated.
          lines[lines.length - 1] = { ...last, data: concatBytes(last.data, bytes.subarray(0, 1)) };
          scheduleFlush();
        }
      }
    }

    for (let i = start; i < bytes.length;) {
      const b = bytes[i];
      if (b !== 0x0d && b !== 0x0a) { i++; continue; }

      const crlf = b === 0x0d && bytes[i + 1] === 0x0a;
      const end = crlf ? i + 2 : i + 1;
      appendReceivedLine(bytes.subarray(start, end), decodeChunk(bytes.subarray(start, i)), true);
      if (b === 0x0d && !crlf && end === bytes.length) {
        // Chunk ends on a bare CR: it may be the first half of a CRLF whose LF
        // is still in flight — reads are timing-based, not message-aligned.
        pendingCRRef.current = true;
      }
      start = i = end;
    }

    if (start < bytes.length) {
      appendReceivedLine(bytes.subarray(start), decodeChunk(bytes.subarray(start)), false);
    }
  }, [appendReceivedLine, decodeChunk, scheduleFlush]);

  /** Feed one chunk from the connection: raw or line-split, per current mode. */
  const handleData = useCallback((data: Uint8Array) => {
    // Detach from the connection's buffer — line data subarrays are retained.
    const bytes = new Uint8Array(data);
    if (rawStreamRef.current) {
      // Hex mode: binary stream, no line endings — rows break only on a user
      // send (addLine closes the open line).
      appendReceivedLine(bytes, decodeChunk(bytes), false);
    } else {
      handleReceivedBytes(bytes);
    }
  }, [appendReceivedLine, decodeChunk, handleReceivedBytes]);

  const addSystemLine = useCallback((text: string) => {
    addLine(new TextEncoder().encode(text), 'system', text);
  }, [addLine]);

  /** New session: a partial UTF-8 sequence, an open received line, or a
   * pending CR left by the previous connection must not leak into this one. */
  const resetSession = useCallback(() => {
    decoderRef.current = null;
    closeOpenLine();
    pendingCRRef.current = false;
  }, [closeOpenLine]);

  const clearConsole = useCallback(() => {
    linesRef.current = [];
    pendingCRRef.current = false;
    setLines([]);
  }, []);

  // Cancel a queued console flush on unmount — the frame callback would call
  // setLines() after teardown.
  useEffect(() => {
    return () => {
      if (flushRafRef.current !== null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
    };
  }, []);

  return { lines, addLine, addSystemLine, handleData, resetSession, clearConsole };
}
