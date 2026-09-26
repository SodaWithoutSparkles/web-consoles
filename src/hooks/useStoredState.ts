import { useEffect, useState } from 'react';

/** localStorage key prefix for persisted UI settings. */
const STORE_PREFIX = 'web-consoles:';

/**
 * `useState` that survives reloads: reads JSON from localStorage on first
 * render, writes on every change. Stored values are validated before use —
 * corrupt or stale data falls back to `initial` instead of crashing the app.
 * Without a `validate`, only the primitive shape of `initial` is checked;
 * callers with an object/array value pass a validator. Storage errors (private
 * mode, quota) are ignored — settings just stay session-only.
 */
export function useStoredState<T>(key: string, initial: T, validate?: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      if (raw === null) return initial;
      const parsed: unknown = JSON.parse(raw);
      if (validate) return validate(parsed) ? parsed : initial;
      // Default guard: same primitive shape as the initial value. Objects and
      // arrays pass as-is (callers with a stricter shape pass a validator).
      return parsed !== null && typeof parsed === typeof initial ? (parsed as T) : initial;
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

/** Validator for a value from a fixed set of strings. */
export function isOneOf<T extends string>(...values: T[]) {
  return (value: unknown): value is T => typeof value === 'string' && (values as string[]).includes(value);
}

/** Validator for `string[]` (send history). */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
