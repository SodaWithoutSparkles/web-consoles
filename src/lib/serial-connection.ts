// ============================================================
// Web Serial API connection
// ============================================================

import { DeviceConnection } from './device-connection';
import {
  ConnectionState,
  SerialConnectionOptions,
  SerialPortLike,
  SerialPortRequestOptionsLike,
  SerialPortSettings,
  DEFAULT_SERIAL_OPTIONS,
  toError,
} from './types';

/** Serial settings with every default applied. */
type ResolvedSerialSettings = Required<SerialPortSettings>;

export class SerialConnection extends DeviceConnection {
  private options: ResolvedSerialSettings;
  private portSource: SerialPortLike | null = null;
  private portRequestOptions: SerialPortRequestOptionsLike | null = null;
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reading = false;
  private readLoop: Promise<void> | null = null;
  /** Attempt token: bumped by connect() and disconnect() to supersede in-flight attempts. */
  private session = 0;

  constructor(options: SerialConnectionOptions = {}) {
    super();
    const { port, portRequestOptions, ...settings } = options;
    this.options = { ...DEFAULT_SERIAL_OPTIONS, ...settings };
    this.portSource = port ?? null;
    this.portRequestOptions = portRequestOptions ?? null;
  }

  /** Check if Web Serial API is available (safe in Node/SSR/workers — never throws) */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /**
   * Update connection options (only takes effect on next connect).
   * Omitted fields keep their current value.
   */
  setOptions(options: Partial<SerialConnectionOptions>): void {
    const { port, portRequestOptions, ...settings } = options;
    this.options = { ...this.options, ...settings };
    if (port !== undefined) this.portSource = port;
    if (portRequestOptions !== undefined) this.portRequestOptions = portRequestOptions;
  }

  /** Current effective options, plus the configured port/pre-authorized-port settings. */
  getOptions(): ResolvedSerialSettings & Pick<SerialConnectionOptions, 'port' | 'portRequestOptions'> {
    return {
      ...this.options,
      port: this.portSource ?? undefined,
      portRequestOptions: this.portRequestOptions ?? undefined,
    };
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    // Attempt token: disconnect() and later connect() calls bump it, so this
    // attempt can detect that it was superseded while awaiting.
    const session = ++this.session;

    try {
      this.setState(ConnectionState.Connecting);

      if (!SerialConnection.isSupported()) {
        throw new Error('Web Serial API is not supported in this browser. Use Chrome or Edge.');
      }

      // A pre-authorized port skips the picker; otherwise requestPort() applies
      // the optional VID/PID filters.
      const port = this.portSource
        ?? await navigator.serial.requestPort(this.portRequestOptions ?? undefined);
      if (session !== this.session) return; // superseded while the picker was open

      await port.open({
        baudRate: this.options.baudRate,
        dataBits: this.options.dataBits,
        stopBits: this.options.stopBits,
        parity: this.options.parity,
        flowControl: this.options.flowControl,
      });

      this.port = port;
      if (session !== this.session) {
        // disconnect() ran while open() was pending: close the port instead of
        // starting a read loop on a connection nobody owns.
        await this.releaseIO();
        return;
      }

      this.reader = port.readable ? port.readable.getReader() : null;
      this.writer = port.writable ? port.writable.getWriter() : null;

      this.armDisconnectNotification();
      this.setState(ConnectionState.Connected);
      this.readLoop = this.runReadLoop();
    } catch (err: unknown) {
      // A newer attempt owns the IO and the state now — leave both alone.
      if (session !== this.session) return;

      // Release what open() already handed us: a failed connect must not leave
      // an opened port or reader/writer locks for the retry to overwrite.
      await this.releaseIO();

      // User cancelled the port picker — not an error, just back to idle.
      if (err instanceof Error && err.name === 'NotFoundError') {
        this.setState(ConnectionState.Disconnected);
        return;
      }
      this.setState(ConnectionState.Error);
      this.emitError(toError(err));
    }
  }

  /**
   * Close the port and release the reader/writer locks.
   *
   * Order matters: cancel the pending read and wait for the loop to finish
   * before releasing the lock and closing. Closing while a read is still in
   * flight races the reader and intermittently throws NetworkError, which also
   * breaks the next connect().
   */
  async disconnect(): Promise<void> {
    // Supersede any in-flight connect(): it must not resurrect the connection
    // once this teardown has run.
    this.session++;
    this.reading = false;

    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => { /* stream already errored */ });
      }
      if (this.readLoop) {
        await this.readLoop.catch(() => { /* loop errors reached onError already */ });
        this.readLoop = null;
      }
      await this.releaseIO();
    } catch (err: unknown) {
      this.emitError(toError(err));
    }

    this.setState(ConnectionState.Disconnected);
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.writer || !this.isConnected) {
      throw new Error('Not connected');
    }
    await this.writer.write(data);
  }

  // ---- Private ----

  /**
   * Read until the stream ends or errors.
   * When the loop stops without disconnect() being called, the device went away:
   * release the port and fire the one-shot unexpected-disconnect event.
   */
  private async runReadLoop(): Promise<void> {
    this.reading = true;

    while (this.reading && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value && value.length > 0) {
          this.emitData(value);
        }
      } catch (err: unknown) {
        // AbortError is the expected result of reader.cancel() during disconnect.
        const aborted = err instanceof Error && err.name === 'AbortError';
        if (this.reading && !aborted) {
          this.emitError(toError(err));
        }
        break;
      }
    }

    if (this.reading) {
      this.reading = false;
      await this.releaseIO();
      this.emitUnexpectedDisconnect();
    }
  }

  /** Release the reader/writer locks and close the port. Safe to call twice. */
  private async releaseIO(): Promise<void> {
    const reader = this.reader;
    this.reader = null;
    if (reader) {
      try { reader.releaseLock(); } catch { /* lock already released */ }
    }

    const writer = this.writer;
    this.writer = null;
    if (writer) {
      try { writer.releaseLock(); } catch { /* lock already released */ }
    }

    const port = this.port;
    this.port = null;
    if (port) {
      try { await port.close(); } catch { /* port already closed */ }
    }
  }
}
