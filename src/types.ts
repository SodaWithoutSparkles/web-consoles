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
