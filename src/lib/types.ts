// ============================================================
// Types & Constants for the Web Serial Console library
// ============================================================

/** Connection state enum */
export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

/** Line ending options for outgoing messages */
export enum LineEnding {
  None = '',
  LF = '\n',
  CR = '\r',
  CRLF = '\r\n',
}

/**
 * Display format for data rows: plain text, hex bytes, hex + ASCII on one row
 * (`both`), or 16-byte hexdump rows (`both-hexdump`).
 */
export type DisplayFormat = 'ascii' | 'hex' | 'both' | 'both-hexdump';

// ---- Structural platform types ----
// The public API must not use the global `SerialPort` / `BluetoothDevice` type
// names: that would force every consumer to install @types/w3c-web-serial and
// @types/web-bluetooth just to typecheck our declarations. These minimal
// structural views describe only what the library actually touches; real
// platform objects satisfy them as-is, without casts on the consumer side.

export interface SerialPortInfoLike {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialPortFilterLike {
  usbVendorId?: number;
  usbProductId?: number;
  bluetoothServiceClassId?: number | string;
}

export interface SerialPortRequestOptionsLike {
  filters?: SerialPortFilterLike[];
  allowedBluetoothServiceClassIds?: Array<number | string>;
}

export interface SerialOptionsLike {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd';
  flowControl?: 'none' | 'hardware';
  bufferSize?: number;
}

export interface SerialPortLike {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptionsLike): Promise<void>;
  close(): Promise<void>;
  getInfo?(): SerialPortInfoLike;
}

/** Structural view of a `BluetoothLEScanFilter`. */
export interface BluetoothLEScanFilterLike {
  name?: string;
  namePrefix?: string;
  services?: Array<string | number>;
}

// ---- Connection options ----

/** Serial port settings forwarded to `SerialPort.open()`. */
export interface SerialPortSettings {
  baudRate?: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd';
  flowControl?: 'none' | 'hardware';
}

export interface SerialConnectionOptions extends SerialPortSettings {
  /**
   * Pre-authorized port to open instead of showing the picker
   * (e.g. an entry from `navigator.serial.getPorts()`).
   */
  port?: SerialPortLike;
  /** Passed to `navigator.serial.requestPort()` when no `port` is given (VID/PID filters). */
  portRequestOptions?: SerialPortRequestOptionsLike;
}

export interface BLEConnectionOptions {
  /** Service UUID (16-bit or 128-bit) */
  serviceUUID: string;
  /** TX characteristic UUID – the one we write to */
  txCharacteristicUUID: string;
  /** RX characteristic UUID – the one we subscribe to for notifications */
  rxCharacteristicUUID: string;
  /**
   * Max bytes per BLE write. Web Bluetooth cannot negotiate the ATT MTU, so
   * payloads are split into sequentially awaited writes. Defaults to 20 bytes
   * (ATT MTU 23 − 3 byte header, the BLE 4.0 minimum).
   */
  chunkSize?: number;
  /** Device-picker filters. Defaults to `[{ services: [serviceUUID] }]`. */
  filters?: BluetoothLEScanFilterLike[];
  /** Show every device in the picker instead of filtering by service UUID. */
  acceptAllDevices?: boolean;
}

export type ConnectionOptions = SerialConnectionOptions | BLEConnectionOptions;

// ---- Listener types ----

export type ConnectionStateListener = (state: ConnectionState) => void;
export type DataListener = (data: Uint8Array) => void;
export type ErrorListener = (error: Error) => void;
export type DisconnectListener = () => void;

// ---- BLE presets ----

export interface BLEPreset {
  name: string;
  description: string;
  serviceUUID: string;
  txCharacteristicUUID: string;
  rxCharacteristicUUID: string;
}

/** Well-known BLE UART service presets */
export const BLE_PRESETS: Record<string, BLEPreset> = {
  nordic_uart: {
    name: 'Nordic UART Service (NUS)',
    description: 'Standard Nordic UART Service used by nRF5x chips',
    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    txCharacteristicUUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    rxCharacteristicUUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  },
  fff0_1: {
    name: 'FFE0 / FFE2 / FFE1',
    description: 'Preset1 for cheap BLE modules',
    serviceUUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    txCharacteristicUUID: '0000ffe2-0000-1000-8000-00805f9b34fb',
    rxCharacteristicUUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
  fff0_2: {
    name: 'FFE0 / FFE1 / FFE2',
    description: 'Preset2 for cheap BLE modules',
    serviceUUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    txCharacteristicUUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
    rxCharacteristicUUID: '0000ffe2-0000-1000-8000-00805f9b34fb',
  },
  ffe1: {
    name: 'FFE0 / FFE1',
    description: 'Preset3 for cheap BLE modules',
    serviceUUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    txCharacteristicUUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
    rxCharacteristicUUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
  }
};

// ---- Defaults ----

export const DEFAULT_SERIAL_OPTIONS: Required<SerialPortSettings> = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
};

export const DEFAULT_BLE_OPTIONS: BLEConnectionOptions = {
  serviceUUID: BLE_PRESETS.nordic_uart.serviceUUID,
  txCharacteristicUUID: BLE_PRESETS.nordic_uart.txCharacteristicUUID,
  rxCharacteristicUUID: BLE_PRESETS.nordic_uart.rxCharacteristicUUID,
};

// ---- Utility helpers ----

/** Append a line ending to a string */
export function appendLineEnding(text: string, ending: LineEnding): string {
  return text + ending;
}

/** Convert a hex string (e.g. "48 65 6C 6C 6F") to Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/[\s,:\-]/g, '');
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
    throw new Error(`Invalid hex string "${hex}": expected pairs of 0-9 A-F`);
  }
  if (cleaned.length % 2 !== 0) {
    throw new Error(`Invalid hex string "${hex}": odd number of hex characters`);
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    // parseInt('1g', 16) returns 1 rather than NaN, so the regex above is the
    // only thing standing between a typo and corrupt bytes on the wire.
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Convert a Uint8Array to a hex string (e.g. "48 65 6C 6C 6F") */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

/** Convert a Uint8Array to an ASCII-safe string (non-printable → dot) */
export function bytesToAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.')
    .join('');
}

/** Convert a Uint8Array to a UTF-8 string */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Create a stateful UTF-8 decoder for chunked input.
 *
 * `bytesToString` decodes every buffer in isolation, so a multibyte character
 * split across two reads renders as U+FFFD. The returned function keeps the
 * incomplete tail of a chunk and prepends it to the next one:
 *
 *   const decode = createStreamDecoder();
 *   decode(chunkA); // ends mid '€' -> ''
 *   decode(chunkB); // -> '€'
 *
 * Pass an empty array to flush any bytes still buffered.
 */
export function createStreamDecoder(): (bytes: Uint8Array) => string {
  const decoder = new TextDecoder('utf-8');
  return (bytes: Uint8Array) => decoder.decode(bytes, { stream: true });
}

/** Narrow an unknown thrown value to an Error (internal helper). */
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
