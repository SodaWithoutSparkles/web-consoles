// ============================================================
// Demo app types
// ============================================================

/** One console row: sent by the user, received from the device, or system. */
export interface ConsoleLine {
  id: string;
  timestamp: Date;
  data: Uint8Array;
  direction: 'sent' | 'received' | 'system';
  /** Decoded text, when known (received lines come from the streaming decoder). */
  text?: string;
  /** Received line still open: the next chunk appends to it instead of starting a new row. */
  open?: boolean;
}

export type ConnectionDirection = ConsoleLine['direction'];

/** Transport selected in the toolbar. */
export type ConnectionType = 'serial' | 'ble' | null;

/** How the command box interprets typed input. */
export type SendFormat = 'text' | 'hex';

/**
 * Which bytes end a received line. `follow` is the historical behaviour:
 * CR, LF and CRLF all break. The named modes match only that ending, and
 * `custom` matches an exact byte sequence (falling back to `follow` when the
 * typed hex is empty or invalid).
 */
export type ReceiveBreak = 'follow' | 'crlf' | 'cr' | 'lf' | 'custom';

/**
 * How control characters (C0 0x00-0x1F and DEL 0x7F) render in the text view.
 * `hidden` drops them, `print` shows them literally, the hex modes show each
 * remaining one as its bare uppercase hex byte except for the listed endings.
 */
export type NonPrintable =
  | 'hidden'
  | 'hex-except-crlf'
  | 'hex-except-crlf-tab'
  | 'hex-except-crlf-tab-bksp'
  | 'hex-all'
  | 'print';
