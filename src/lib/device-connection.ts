// ============================================================
// Abstract base class for device connections
// ============================================================

import {
  ConnectionState,
  ConnectionStateListener,
  DataListener,
  ErrorListener,
  DisconnectListener,
  LineEnding,
  appendLineEnding,
} from './types';

/**
 * Abstract base class that both SerialConnection and BLEConnection extend.
 * Provides a unified event-driven API for sending/receiving data.
 *
 * Disconnect contract: `onDisconnect` fires at most once per connection
 * session and only when an established connection is lost *unexpectedly*
 * (device unplugged, stack error). Calling `disconnect()` yourself does not
 * fire it — `onStateChange` reports that transition. By the time disconnect
 * listeners run, `state` is already `Disconnected`.
 */
export abstract class DeviceConnection {
  protected _state: ConnectionState = ConnectionState.Disconnected;
  protected _deviceName = '';

  // Listener sets
  private _stateListeners = new Set<ConnectionStateListener>();
  private _dataListeners = new Set<DataListener>();
  private _errorListeners = new Set<ErrorListener>();
  private _disconnectListeners = new Set<DisconnectListener>();
  private _disconnectNotified = false;

  // ---- Getters ----

  get state(): ConnectionState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === ConnectionState.Connected;
  }

  get deviceName(): string {
    return this._deviceName;
  }

  // ---- Abstract methods (must be implemented by subclasses) ----

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(data: Uint8Array): Promise<void>;

  // ---- Event subscription ----

  /** Subscribe to state changes */
  onStateChange(listener: ConnectionStateListener): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  /** Subscribe to incoming data */
  onData(listener: DataListener): () => void {
    this._dataListeners.add(listener);
    return () => this._dataListeners.delete(listener);
  }

  /** Subscribe to errors */
  onError(listener: ErrorListener): () => void {
    this._errorListeners.add(listener);
    return () => this._errorListeners.delete(listener);
  }

  /** Subscribe to unexpected disconnections */
  onDisconnect(listener: DisconnectListener): () => void {
    this._disconnectListeners.add(listener);
    return () => this._disconnectListeners.delete(listener);
  }

  /** Remove all listeners */
  removeAllListeners(): void {
    this._stateListeners.clear();
    this._dataListeners.clear();
    this._errorListeners.clear();
    this._disconnectListeners.clear();
  }

  // ---- Protected helpers for subclasses ----

  protected setState(state: ConnectionState): void {
    this._state = state;
    this._stateListeners.forEach((fn) => {
      try { fn(state); } catch (err) { this.reportListenerError('state', err); }
    });
  }

  protected emitData(data: Uint8Array): void {
    this._dataListeners.forEach((fn) => {
      try { fn(data); } catch (err) { this.reportListenerError('data', err); }
    });
  }

  protected emitError(error: Error): void {
    this._errorListeners.forEach((fn) => {
      try { fn(error); } catch (err) { this.reportListenerError('error', err); }
    });
  }

  protected emitDisconnect(): void {
    this._disconnectListeners.forEach((fn) => {
      try { fn(); } catch (err) { this.reportListenerError('disconnect', err); }
    });
  }

  /** A throwing listener must not break the emit loop — but it must be visible. */
  private reportListenerError(event: string, err: unknown): void {
    console.error(`[web-consoles] ${event} listener threw:`, err);
  }

  /** Arm the one-shot unexpected-disconnect notification for a new session. */
  protected armDisconnectNotification(): void {
    this._disconnectNotified = false;
  }

  /**
   * Emit `onDisconnect` once per session for a connection that was lost
   * without the consumer asking for it. Explicit `disconnect()` must not use
   * this — see the disconnect contract in the class docs.
   */
  protected emitUnexpectedDisconnect(): void {
    if (this._disconnectNotified) return;
    this._disconnectNotified = true;
    this.setState(ConnectionState.Disconnected);
    this.emitDisconnect();
  }

  /**
   * Convenience: send a UTF-8 string.
   * @param ending line ending appended before sending (default: none)
   */
  async sendString(text: string, ending: LineEnding = LineEnding.None): Promise<void> {
    const encoder = new TextEncoder();
    await this.send(encoder.encode(appendLineEnding(text, ending)));
  }
}
