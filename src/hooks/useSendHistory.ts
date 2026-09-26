import { useCallback, useRef } from 'react';
import { isStringArray, useStoredState } from './useStoredState';

/** Max commands kept in send history. */
const MAX_HISTORY = 100;

/**
 * Send history plus ArrowUp/ArrowDown browsing. History is chronological,
 * oldest first, and deduped on send; the cursor walks it newest-first.
 */
export function useSendHistory() {
  // A corrupt stored value would crash the UI (history is reversed for display).
  const [history, setHistory] = useStoredState<string[]>('send-history', [], isStringArray);
  // Arrow-key browsing cursor: -1 = editing the draft, 0 = newest entry.
  const indexRef = useRef(-1);
  const draftRef = useRef('');

  /** Dedupe + append so ArrowUp walks history in send order. */
  const record = useCallback((command: string) => {
    setHistory((prev) => [...prev.filter((cmd) => cmd !== command), command].slice(-MAX_HISTORY));
  }, [setHistory]);

  /**
   * Move the arrow-key cursor and return the value the input should show. The
   * in-progress draft is captured on the first ArrowUp and restored on the
   * way back past the newest entry.
   */
  const step = useCallback((delta: 1 | -1, current: string): string => {
    if (history.length === 0) return current;
    const index = indexRef.current;
    if (delta === 1 && index === -1) draftRef.current = current;
    const next = Math.min(Math.max(index + delta, -1), history.length - 1);
    indexRef.current = next;
    return next === -1 ? draftRef.current : history[history.length - 1 - next];
  }, [history]);

  /** Drop the cursor back to the draft (typing, picking an entry). */
  const resetCursor = useCallback(() => {
    indexRef.current = -1;
  }, []);

  const remove = useCallback((command: string) => {
    setHistory((prev) => prev.filter((cmd) => cmd !== command));
  }, [setHistory]);

  const clear = useCallback(() => setHistory([]), [setHistory]);

  return { history, record, step, resetCursor, remove, clear };
}
