import { useCallback, useEffect, useRef, useState } from 'react';
import { createStreamDecoder } from '../lib';
import { EMPTY_BYTES, createLineSplitter, generateId, concatBytes, type LineSplitter } from '../utils';
import type { ConnectionDirection, ConsoleLine, ReceiveBreak } from '../types';

/** Max lines kept in state — bounds per-frame render work. */
const MAX_LINES = 500;

/** Receive-break settings. `custom` is null when the typed hex is unusable. */
export interface SplitterSettings {
  mode: ReceiveBreak;
  custom: Uint8Array | null;
}

/**
 * Console line store. Lines live in a ref so transport events mutate them
 * synchronously: ordering can never interleave (a send closes the open
 * received line before it is appended), and a rAF mirrors a copy into state
 * once per frame. The last element may be an *open* received line still
 * collecting chunks.
 *
 * `isRawStream` (hex send mode) turns line splitting off: a binary stream
 * carries no meaningful line endings, so rows break only on a user send.
 * `split` feeds the receive-break mode; both are read through refs because the
 * connection's `onData` closure is captured once per session.
 */
export function useConsoleLines(isRawStream: boolean, split: SplitterSettings) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);

  const linesRef = useRef<ConsoleLine[]>([]);
  const flushRafRef = useRef<number | null>(null);
  // Streaming decoder keeps a partial UTF-8 sequence across chunk boundaries.
  const decoderRef = useRef<((bytes: Uint8Array) => string) | null>(null);
  // Lets the connection's onData closure read the mode of the latest render.
  const rawStreamRef = useRef(isRawStream);
  // Splitter + the settings it was built from. Rebuilt lazily when the mode
  // changes, which also drops any partial match held for the old mode.
  const splitterRef = useRef<{ key: string; splitter: LineSplitter } | null>(null);
  const splitRef = useRef(split);

  // Connection's onData closure is captured once per session — refs let it
  // read the latest settings without re-subscribing.
  useEffect(() => {
    rawStreamRef.current = isRawStream;
    splitRef.current = split;
  });

  /** Current splitter, built on first use and rebuilt when settings change. */
  const getSplitter = useCallback((): LineSplitter => {
    const { mode, custom } = splitRef.current;
    const key = `${mode}:${custom ? Array.from(custom).join() : ''}`;
    const current = splitterRef.current;
    if (current && current.key === key) return current.splitter;
    const splitter = createLineSplitter(mode, custom);
    splitterRef.current = { key, splitter };
    return splitter;
  }, []);

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
      // Keep the mirrored state in step with the ref.
      scheduleFlush();
    }
  }, [scheduleFlush]);

  /**
   * Append a sent/system line. Both close any open received line first: a user
   * send interrupts the partial line, and subsequent incoming data starts a
   * new line after it.
   */
  const pushLine = useCallback((line: Omit<ConsoleLine, 'id' | 'timestamp'>) => {
    closeOpenLine();
    const id = generateId();
    linesRef.current.push({ ...line, id, timestamp: new Date() });
    scheduleFlush();
    return id;
  }, [closeOpenLine, scheduleFlush]);

  const addLine = useCallback((data: Uint8Array, direction: ConnectionDirection, text?: string) => {
    return pushLine({ data, direction, text });
  }, [pushLine]);

  /** Mark a sent row failed — no-op once trimmed by MAX_LINES or cleared. */
  const failLine = useCallback((id: string) => {
    const lines = linesRef.current;
    const index = lines.findIndex((line) => line.id === id);
    if (index < 0) return;
    lines[index] = { ...lines[index], failed: true };
    scheduleFlush();
  }, [scheduleFlush]);

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

  /** Fold delimiter bytes that only completed the previous row's terminator
   * into that row: `data` keeps them (hex view stays faithful), text already ended. */
  const absorbIntoPrevious = useCallback((bytes: Uint8Array, terminated: boolean) => {
    const lines = linesRef.current;
    // The row the delimiter completes may no longer be last (a user send
    // interrupts it) — find the most recent received row.
    let index = lines.length - 1;
    while (index >= 0 && lines[index].direction !== 'received') index--;
    if (index < 0) return; // no received row left (e.g. after Clear) — nothing to attach to
    const line = lines[index];
    lines[index] = {
      ...line,
      data: concatBytes(line.data, bytes),
      open: terminated ? false : line.open,
    };
    scheduleFlush();
  }, [scheduleFlush]);

  /** Feed one chunk from the connection: raw or line-split, per current mode. */
  const handleData = useCallback((data: Uint8Array) => {
    // Detach from the connection's buffer — line data subarrays are retained.
    const bytes = new Uint8Array(data);
    if (rawStreamRef.current) {
      // Hex mode: binary stream, no line endings — rows break only on a user
      // send (addLine closes the open line).
      appendReceivedLine(bytes, decodeChunk(bytes), false);
      return;
    }
    for (const segment of getSplitter().split(bytes)) {
      if (segment.absorb) absorbIntoPrevious(segment.data, segment.terminated);
      else appendReceivedLine(segment.data, decodeChunk(segment.textBytes), segment.terminated);
    }
  }, [absorbIntoPrevious, appendReceivedLine, decodeChunk, getSplitter]);

  const addSystemLine = useCallback((text: string) => {
    addLine(new TextEncoder().encode(text), 'system', text);
  }, [addLine]);

  /** New session: a partial UTF-8 sequence, an open received line, or a
   * partial delimiter left by the previous connection must not leak into
   * this one. */
  const resetSession = useCallback(() => {
    decoderRef.current = null;
    closeOpenLine();
    splitterRef.current = null;
  }, [closeOpenLine]);

  const clearConsole = useCallback(() => {
    linesRef.current = [];
    // A partial delimiter or UTF-8 sequence from the cleared output must not
    // complete into the first row after Clear.
    splitterRef.current = null;
    decoderRef.current = null;
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

  return { lines, addLine, addSystemLine, failLine, handleData, resetSession, clearConsole };
}
