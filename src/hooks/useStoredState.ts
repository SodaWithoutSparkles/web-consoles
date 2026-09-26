import { useEffect, useState } from 'react';

/** localStorage key prefix for persisted UI settings. */
const STORE_PREFIX = 'web-consoles:';

/**
 * `useState` that survives reloads: reads JSON from localStorage on first
 * render, writes on every change. Storage errors (private mode, quota) are
 * ignored — settings just stay session-only.
 */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
    } catch {
      // storage unavailable — settings stay session-only
    }
  }, [key, value]);

  return [value, setValue] as const;
}
