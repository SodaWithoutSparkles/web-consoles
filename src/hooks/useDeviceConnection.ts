import { useCallback, useRef, useState } from 'react';
import { ConnectionState, DeviceConnection } from '../lib';

/** Callbacks the app wires into each new connection session. */
export interface SessionHandlers {
  /** Received bytes from the device. */
  onData: (data: Uint8Array) => void;
  /** New session started: reset decoder / partial-line state. */
  onSessionReset: () => void;
  /** Human-readable system message (connection notices). */
  onSystemMessage: (text: string) => void;
}

/**
 * Connection lifecycle: owns the active DeviceConnection, its subscriptions,
 * and the state the UI shows (connection state, device name, error message).
 */
export function useDeviceConnection() {
  const [connState, setConnState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [deviceName, setDeviceName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const connRef = useRef<DeviceConnection | null>(null);
  const unsubscribesRef = useRef<Array<() => void>>([]);

  const cleanup = useCallback(() => {
    unsubscribesRef.current.forEach((fn) => fn());
    unsubscribesRef.current = [];
    connRef.current = null;
  }, []);

  /** Swap in a new connection: detach the old one, subscribe, reset session state. */
  const attach = useCallback(async (conn: DeviceConnection, handlers: SessionHandlers) => {
    // Tear down the old subscription first, then release its port/reader lock.
    const previous = connRef.current;
    cleanup();
    if (previous) {
      try {
        await previous.disconnect();
      } catch {
        // Old connection is already unusable — nothing left to release.
      }
    }

    connRef.current = conn;
    handlers.onSessionReset();

    unsubscribesRef.current = [
      conn.onStateChange(setConnState),
      conn.onData(handlers.onData),
      conn.onError((err) => setErrorMsg(err.message)),
      conn.onDisconnect(() => {
        handlers.onSystemMessage('⚠ Disconnected unexpectedly');
        setDeviceName('');
      }),
    ];
  }, [cleanup]);

  /** Send bytes on the active connection. */
  const send = useCallback(async (bytes: Uint8Array) => {
    const conn = connRef.current;
    if (!conn) throw new Error('Not connected');
    await conn.send(bytes);
  }, []);

  /** Drop the active connection. Returns true when one was attached. */
  const disconnect = useCallback(async (): Promise<boolean> => {
    const conn = connRef.current;
    cleanup();
    setConnState(ConnectionState.Disconnected);
    if (!conn) return false;
    await conn.disconnect();
    setDeviceName('');
    return true;
  }, [cleanup]);

  return {
    connState,
    deviceName,
    setDeviceName,
    errorMsg,
    setErrorMsg,
    isConnected: connState === ConnectionState.Connected,
    attach,
    disconnect,
    send,
  };
}
