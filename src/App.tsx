import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  SerialConnection,
  BLEConnection,
  DeviceConnection,
  ConnectionState,
  LineEnding,
  BLE_PRESETS,
  DEFAULT_SERIAL_OPTIONS,
  DEFAULT_BLE_OPTIONS,
  createStreamDecoder,
  hexToBytes,
  bytesToHex,
  bytesToAscii,
  bytesToString,
  type DisplayFormat,
  type BLEConnectionOptions,
  type SerialConnectionOptions,
  type SerialPortSettings,
} from './lib';

// ============================================================
// Helpers
// ============================================================

/** Max lines kept in state — bounds per-frame render work. */
const MAX_LINES = 500;

/** Max commands kept in send history. */
const MAX_HISTORY = 100;

/** localStorage key prefix for persisted UI settings. */
const STORE_PREFIX = 'web-consoles:';

/**
 * `useState` that survives reloads: reads JSON from localStorage on first
 * render, writes on every change. Storage errors (private mode, quota) are
 * ignored — settings just stay session-only.
 */
function useStoredState<T>(key: string, initial: T) {
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

function generateId(): string {
  return crypto.randomUUID();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  } as Intl.DateTimeFormatOptions) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

interface ConsoleLine {
  id: string;
  timestamp: Date;
  data: Uint8Array;
  direction: 'sent' | 'received' | 'system';
  /** Decoded text, when known (received lines come from the streaming decoder). */
  text?: string;
}

type ConnectionType = 'serial' | 'ble' | null;

type ConnectionDirection = ConsoleLine['direction'];

/**
 * Single console row. Memoized: props are stable (line identity, primitives), so
 * existing rows are skipped during the per-frame flush re-render.
 */
const ConsoleRow = React.memo(function ConsoleRow({
  line,
  showTimestamps,
  displayFormat,
}: {
  line: ConsoleLine;
  showTimestamps: boolean;
  displayFormat: DisplayFormat;
}) {
  const text = line.text ?? bytesToString(line.data);
  const content =
    line.direction === 'system' || displayFormat === 'ascii'
      ? text
      : displayFormat === 'hex'
        ? bytesToHex(line.data)
        : `${bytesToHex(line.data)}  |  ${bytesToAscii(line.data)}`;

  return (
    <div
      className={`flex gap-2 text-sm leading-relaxed ${line.direction === 'sent'
          ? 'text-emerald-400'
          : line.direction === 'received'
            ? 'text-gray-200'
            : 'text-yellow-500 italic'
        }`}
    >
      {showTimestamps && (
        <span className="text-gray-600 text-xs shrink-0 pt-0.5 select-none">
          {formatTime(line.timestamp)}
        </span>
      )}
      <span className="shrink-0 select-none w-3 text-center">
        {line.direction === 'sent' ? (
          <span className="text-emerald-600">→</span>
        ) : line.direction === 'received' ? (
          <span className="text-blue-500">←</span>
        ) : (
          <span className="text-yellow-600">●</span>
        )}
      </span>
      <span className="break-all whitespace-pre-wrap">{content}</span>
    </div>
  );
});

// ============================================================
// App
// ============================================================

export default function App() {
  // Connection state
  const [connectionType, setConnectionType] = useState<ConnectionType>(null);
  const [connState, setConnState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [deviceName, setDeviceName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Console state
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Persisted settings (localStorage).
  const [displayFormat, setDisplayFormat] = useStoredState<DisplayFormat>('display-format', 'ascii');
  const [lineEnding, setLineEnding] = useStoredState<LineEnding>('line-ending', LineEnding.CRLF);
  const [sendFormat, setSendFormat] = useStoredState<'text' | 'hex'>('send-format', 'text');

  // Config state
  const [serialConfig, setSerialConfig] = useStoredState<SerialConnectionOptions>('serial-config', DEFAULT_SERIAL_OPTIONS);
  const [blePresetKey, setBlePresetKey] = useStoredState<string>('ble-preset', 'nordic_uart');
  const [bleConfig, setBleConfig] = useStoredState<BLEConnectionOptions>('ble-config', DEFAULT_BLE_OPTIONS);

  // Send history: chronological, oldest first, deduped on send.
  const [history, setHistory] = useStoredState<string[]>('send-history', []);
  // Arrow-key browsing cursor: -1 = editing the draft, 0 = newest entry.
  const historyIndexRef = useRef(-1);
  const draftRef = useRef('');

  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const connRef = useRef<DeviceConnection | null>(null);
  const unsubscribesRef = useRef<Array<() => void>>([]);

  // Batched console writes: chunks accumulate here and flush to state once per frame.
  const pendingLinesRef = useRef<ConsoleLine[]>([]);
  const flushRafRef = useRef<number | null>(null);
  // Streaming decoder keeps a partial UTF-8 sequence across chunk boundaries.
  const decoderRef = useRef<((bytes: Uint8Array) => string) | null>(null);

  const isConnected = connState === ConnectionState.Connected;

  // ---- Helpers ----

  const decodeChunk = useCallback((bytes: Uint8Array): string => {
    const decoder = decoderRef.current ?? (decoderRef.current = createStreamDecoder());
    return decoder(bytes);
  }, []);

  const queueLine = useCallback((line: Omit<ConsoleLine, 'id' | 'timestamp'>) => {
    pendingLinesRef.current.push({ ...line, id: generateId(), timestamp: new Date() });
    if (flushRafRef.current !== null) return;
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      const batch = pendingLinesRef.current;
      pendingLinesRef.current = [];
      if (batch.length === 0) return;
      setLines((prev) => {
        const next = prev.concat(batch);
        return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      });
    });
  }, []);

  const addLine = useCallback((data: Uint8Array, direction: ConnectionDirection, text?: string) => {
    queueLine({ data, direction, text });
  }, [queueLine]);

  const addSystemLine = useCallback((text: string) => {
    addLine(new TextEncoder().encode(text), 'system', text);
  }, [addLine]);

  const cleanupConnection = useCallback(() => {
    unsubscribesRef.current.forEach((fn) => fn());
    unsubscribesRef.current = [];
    connRef.current = null;
  }, []);

  const setupConnection = useCallback(async (conn: DeviceConnection) => {
    // Tear down the old subscription first, then release its port/reader lock.
    const previous = connRef.current;
    cleanupConnection();
    if (previous) {
      try {
        await previous.disconnect();
      } catch {
        // Old connection is already unusable — nothing left to release.
      }
    }

    connRef.current = conn;
    // New session: a partial UTF-8 sequence left by the previous connection
    // must not prefix the first chunk of this one.
    decoderRef.current = null;

    const unsubs = [
      conn.onStateChange((state) => {
        setConnState(state);
        if (state === ConnectionState.Error) {
          // error is reported via onError
        }
      }),
      conn.onData((data) => {
        const bytes = new Uint8Array(data);
        addLine(bytes, 'received', decodeChunk(bytes));
      }),
      conn.onError((err) => {
        setErrorMsg(err.message);
      }),
      conn.onDisconnect(() => {
        addSystemLine('⚠ Disconnected unexpectedly');
        setDeviceName('');
      }),
    ];
    unsubscribesRef.current = unsubs;
  }, [addLine, addSystemLine, cleanupConnection, decodeChunk]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Cancel a queued console flush on unmount — the frame callback would call
  // setLines() after teardown.
  useEffect(() => {
    return () => {
      if (flushRafRef.current !== null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
    };
  }, []);

  // ---- Connection handlers ----

  const handleConnect = async () => {
    setErrorMsg('');

    if (connectionType === 'serial') {
      if (!SerialConnection.isSupported()) {
        setErrorMsg('Web Serial API not supported. Use Chrome or Edge.');
        return;
      }
      const conn = new SerialConnection(serialConfig);
      await setupConnection(conn);
      addSystemLine('Requesting serial port...');
      await conn.connect();
      if (conn.isConnected) {
        addSystemLine('✓ Connected via Web Serial');
        setDeviceName('Serial Device');
      }
    } else if (connectionType === 'ble') {
      if (!BLEConnection.isSupported()) {
        setErrorMsg('Web Bluetooth not supported. Use Chrome or Edge.');
        return;
      }
      const conn = new BLEConnection(bleConfig);
      await setupConnection(conn);
      addSystemLine('Requesting BLE device...');
      await conn.connect();
      if (conn.isConnected) {
        addSystemLine(`✓ Connected via BLE: ${conn.deviceName}`);
        setDeviceName(conn.deviceName);
      }
    }
  };

  const handleDisconnect = async () => {
    if (connRef.current) {
      await connRef.current.disconnect();
      addSystemLine('Disconnected');
      setDeviceName('');
    }
    cleanupConnection();
    setConnState(ConnectionState.Disconnected);
  };

  // ---- Send ----

  const handleSend = async () => {
    const command = inputValue;
    if (!command.trim() || !isConnected || !connRef.current) return;

    historyIndexRef.current = -1;

    try {
      let bytes: Uint8Array;

      if (sendFormat === 'hex') {
        bytes = hexToBytes(command);
        addLine(bytes, 'sent');
      } else {
        const text = command + lineEnding;
        bytes = new TextEncoder().encode(text);
        addLine(bytes, 'sent');
      }

      await connRef.current.send(bytes);
      // Only clear on success — a failed send keeps the typed command.
      setInputValue('');
      // Dedupe + append so ArrowUp walks history in send order.
      setHistory((prev) => [...prev.filter((cmd) => cmd !== command), command].slice(-MAX_HISTORY));
    } catch (err: unknown) {
      addSystemLine(`Send error: ${err instanceof Error ? err.message : String(err)}`);
    }

    inputRef.current?.focus();
  };

  // ArrowUp/ArrowDown walk the send history; the in-progress draft is restored on the way back.
  const navigateHistory = (delta: 1 | -1) => {
    if (history.length === 0) return;
    const index = historyIndexRef.current;
    if (delta === 1 && index === -1) draftRef.current = inputValue;
    const next = Math.min(Math.max(index + delta, -1), history.length - 1);
    historyIndexRef.current = next;
    setInputValue(next === -1 ? draftRef.current : history[history.length - 1 - next]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore keys while an IME composition is active (e.g. CJK input) — Enter
    // commits the composition and the arrows move the candidate list.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') handleSend();
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory(e.key === 'ArrowUp' ? 1 : -1);
    } else if (e.key === 'Escape') {
      setShowHistory(false);
    }
  };

  const clearConsole = () => {
    pendingLinesRef.current = [];
    setLines([]);
  };

  // Fill the command box from a history entry; the user still presses Enter to send.
  const pickHistory = (command: string) => {
    setInputValue(command);
    historyIndexRef.current = -1;
    setShowHistory(false);
    inputRef.current?.focus();
  };

  // ---- BLE preset change ----

  const handlePresetChange = (key: string) => {
    setBlePresetKey(key);
    if (BLE_PRESETS[key]) {
      const p = BLE_PRESETS[key];
      setBleConfig({
        serviceUUID: p.serviceUUID,
        txCharacteristicUUID: p.txCharacteristicUUID,
        rxCharacteristicUUID: p.rxCharacteristicUUID,
      });
    }
  };

  // ---- Rendering helpers ----

  const statusColor: Record<ConnectionState, string> = {
    [ConnectionState.Disconnected]: 'bg-gray-500',
    [ConnectionState.Connecting]: 'bg-yellow-500 animate-pulse',
    [ConnectionState.Connected]: 'bg-green-500',
    [ConnectionState.Error]: 'bg-red-500',
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 font-mono">
      {/* ---- Header ---- */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <h1 className="text-lg font-bold text-emerald-400">Web Serial Console</h1>
          </div>
          <div className="flex items-center gap-1.5 ml-4">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor[connState]}`}></div>
            <span className="text-xs text-gray-400 capitalize">{connState}</span>
            {deviceName && (
              <span className="text-xs text-gray-500 ml-1">— {deviceName}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      {/* ---- Settings Panel ---- */}
      {showSettings && (
        <div className="bg-gray-900 border-b border-gray-800 p-4 shrink-0">
          <div className="max-w-6xl mx-auto">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Connection Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Serial */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Web Serial</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Baud Rate</label>
                    <select
                      value={serialConfig.baudRate}
                      onChange={(e) => setSerialConfig({ ...serialConfig, baudRate: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
                    >
                      {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Data Bits</label>
                    <select
                      value={serialConfig.dataBits}
                      onChange={(e) => setSerialConfig({ ...serialConfig, dataBits: Number(e.target.value) as 7 | 8 })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value={7}>7</option>
                      <option value={8}>8</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Stop Bits</label>
                    <select
                      value={serialConfig.stopBits}
                      onChange={(e) => setSerialConfig({ ...serialConfig, stopBits: Number(e.target.value) as 1 | 2 })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Parity</label>
                    <select
                      value={serialConfig.parity}
                      onChange={(e) => setSerialConfig({ ...serialConfig, parity: e.target.value as SerialPortSettings['parity'] })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="none">None</option>
                      <option value="even">Even</option>
                      <option value="odd">Odd</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* BLE */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Web Bluetooth</h4>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Preset</label>
                  <select
                    value={blePresetKey}
                    onChange={(e) => handlePresetChange(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  >
                    {Object.entries(BLE_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.name}</option>
                    ))}
                    <option value="custom">Custom…</option>
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    {BLE_PRESETS[blePresetKey]?.description || 'Enter UUIDs manually below'}
                  </p>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Service UUID</label>
                    <input
                      type="text"
                      value={bleConfig.serviceUUID}
                      onChange={(e) => { setBlePresetKey('custom'); setBleConfig({ ...bleConfig, serviceUUID: e.target.value }); }}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">TX Char (Write)</label>
                    <input
                      type="text"
                      value={bleConfig.txCharacteristicUUID}
                      onChange={(e) => { setBlePresetKey('custom'); setBleConfig({ ...bleConfig, txCharacteristicUUID: e.target.value }); }}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">RX Char (Notify)</label>
                    <input
                      type="text"
                      value={bleConfig.rxCharacteristicUUID}
                      onChange={(e) => { setBlePresetKey('custom'); setBleConfig({ ...bleConfig, rxCharacteristicUUID: e.target.value }); }}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Toolbar ---- */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/50 border-b border-gray-800 shrink-0 flex-wrap">
        {/* Connection type toggle */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setConnectionType('serial')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${connectionType === 'serial'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
              }`}
          >
            ⚡ Serial
          </button>
          <button
            onClick={() => setConnectionType('ble')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${connectionType === 'ble'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
              }`}
          >
            📡 BLE
          </button>
        </div>

        {/* Connect / Disconnect */}
        <button
          onClick={isConnected ? handleDisconnect : handleConnect}
          // Connecting state disables the button: a second click would open a
          // second device/port picker on top of the one already showing.
          disabled={!connectionType || connState === ConnectionState.Connecting}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${isConnected
              ? 'bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30'
              : connectionType
                ? connectionType === 'serial'
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30'
                  : 'bg-blue-600/20 text-blue-400 border border-blue-600/30 hover:bg-blue-600/30'
                : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed'
            }`}
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>

        <div className="w-px h-5 bg-gray-700 mx-1"></div>

        {/* Line ending */}
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">End:</label>
          <select
            value={lineEnding}
            onChange={(e) => setLineEnding(e.target.value as LineEnding)}
            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">None</option>
            <option value={'\n'}>LF</option>
            <option value={'\r'}>CR</option>
            <option value={'\r\n'}>CR+LF</option>
          </select>
        </div>

        {/* Send format */}
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Send:</label>
          <select
            value={sendFormat}
            onChange={(e) => setSendFormat(e.target.value as 'text' | 'hex')}
            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="text">Text</option>
            <option value="hex">Hex</option>
          </select>
        </div>

        {/* Display format — dropdown to match End/Send */}
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">View:</label>
          <select
            value={displayFormat}
            onChange={(e) => setDisplayFormat(e.target.value as DisplayFormat)}
            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="ascii">ASCII</option>
            <option value="hex">HEX</option>
            <option value="both">Both</option>
          </select>
        </div>

        <div className="flex-1"></div>

        {/* Misc toggles */}
        <button
          onClick={() => setShowTimestamps(!showTimestamps)}
          className={`px-2 py-1 rounded text-xs transition-colors ${showTimestamps ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
            }`}
          title="Toggle timestamps"
        >
          🕐
        </button>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`px-2 py-1 rounded text-xs transition-colors ${autoScroll ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
            }`}
          title="Toggle auto-scroll"
        >
          ↓
        </button>
        <div className="relative">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`px-2 py-1 rounded text-xs transition-colors ${showHistory ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
              }`}
            title="Send history"
          >
            History
          </button>
          {showHistory && (
            <div className="absolute right-0 top-full mt-1 w-80 max-h-72 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
              <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800">
                <span className="text-xs text-gray-400">History ({history.length})</span>
                <button
                  onClick={() => setHistory([])}
                  disabled={history.length === 0}
                  className="text-xs text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Clear all
                </button>
              </div>
              {history.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-600">No commands sent yet</p>
              ) : (
                // Newest first, like scrolling to the bottom of bash history.
                [...history].reverse().map((command) => (
                  <div key={command} className="flex items-center hover:bg-gray-800">
                    <button
                      onClick={() => pickHistory(command)}
                      className="flex-1 min-w-0 px-3 py-1.5 text-xs text-left text-gray-200 truncate"
                      title={command}
                    >
                      {command}
                    </button>
                    <button
                      onClick={() => setHistory((prev) => prev.filter((cmd) => cmd !== command))}
                      className="px-2 py-1.5 text-gray-600 hover:text-red-400"
                      title="Remove entry"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <button
          onClick={clearConsole}
          className="px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* ---- Console Output ---- */}
      <div
        ref={consoleRef}
        className="flex-1 overflow-y-auto p-4 bg-gray-950 scroll-smooth min-h-0"
      >
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <p className="text-sm">Select a connection type and click Connect to get started</p>
            <p className="text-xs mt-2 text-gray-700">Supports Web Serial API and Web Bluetooth (BLE)</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {lines.map((line) => (
              <ConsoleRow
                key={line.id}
                line={line}
                showTimestamps={showTimestamps}
                displayFormat={displayFormat}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---- Input Area ---- */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 border-t border-gray-800 shrink-0">
        <span className="text-emerald-500 text-sm font-bold">{'>'}</span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); historyIndexRef.current = -1; }}
          onKeyDown={handleKeyDown}
          disabled={!isConnected}
          placeholder={
            !isConnected
              ? 'Connect to a device first…'
              : sendFormat === 'hex'
                ? 'Type hex bytes and press Enter…'
                : 'Type text and press Enter…'
          }
          className="flex-1 bg-transparent text-gray-200 text-sm placeholder-gray-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSend}
          disabled={!isConnected || !inputValue.trim()}
          className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>

      {/* ---- Error bar ---- */}
      {errorMsg && (
        <div className="px-4 py-2 bg-red-950/50 border-t border-red-900 text-red-400 text-xs flex items-center justify-between">
          <span>Error: {errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-red-500 hover:text-red-300 ml-2">✕</button>
        </div>
      )}

      {/* ---- Browser support warning ---- */}
      {!SerialConnection.isSupported() && !BLEConnection.isSupported() && (
        <div className="px-4 py-2 bg-yellow-950/50 border-t border-yellow-900 text-yellow-400 text-xs">
          ⚠️ Your browser does not support Web Serial or Web Bluetooth. Please use Chrome or Edge on desktop.
        </div>
      )}
    </div>
  );
}
