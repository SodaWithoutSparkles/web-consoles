// ============================================================
// Demo app helpers
// ============================================================

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
