import { useRef, useState, type KeyboardEvent } from 'react';
import {
  SerialConnection,
  BLEConnection,
  LineEnding,
  DEFAULT_SERIAL_OPTIONS,
  DEFAULT_BLE_OPTIONS,
  hexToBytes,
  bytesToHex,
  type BLEConnectionOptions,
  type DisplayFormat,
  type SerialConnectionOptions,
} from './lib';
import { CommandInput } from './components/CommandInput';
import { connectionSection } from './components/ConnectionSettings';
import { ConsoleOutput } from './components/ConsoleOutput';
import { displaySection } from './components/DisplaySettings';
import { ErrorBar } from './components/ErrorBar';
import { Header } from './components/Header';
import { sendSection } from './components/SendSettings';
import { SettingsModal } from './components/SettingsModal';
import { SupportWarning } from './components/SupportWarning';
import { Toolbar } from './components/Toolbar';
import { useConsoleLines } from './hooks/useConsoleLines';
import { useDeviceConnection } from './hooks/useDeviceConnection';
import { useSendHistory } from './hooks/useSendHistory';
import { useStoredState } from './hooks/useStoredState';
import { parseBreakBytes } from './utils';
import type { ConnectionType, NonPrintable, ReceiveBreak, SendFormat } from './types';

/**
 * Demo console app. Owns the UI state and composes the console hooks
 * (connection, lines, send history) with the presentational components.
 */
export default function App() {
  // Connection
  const [connectionType, setConnectionType] = useState<ConnectionType>(null);
  const { connState, deviceName, setDeviceName, errorMsg, setErrorMsg, isConnected, attach, disconnect, send } =
    useDeviceConnection();

  // Console
  const [inputValue, setInputValue] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Persisted settings (localStorage)
  const [displayFormat, setDisplayFormat] = useStoredState<DisplayFormat>('display-format', 'ascii');
  const [showTimestamps, setShowTimestamps] = useStoredState('show-timestamps', true);
  const [receiveBreak, setReceiveBreak] = useStoredState<ReceiveBreak>('receive-break', 'follow');
  const [receiveBreakCustom, setReceiveBreakCustom] = useStoredState('receive-break-custom', '');
  const [nonPrintable, setNonPrintable] = useStoredState<NonPrintable>('non-printable', 'hex-except-crlf');
  const [lineEnding, setLineEnding] = useStoredState<LineEnding>('line-ending', LineEnding.CRLF);
  const [allowEmptyLines, setAllowEmptyLines] = useStoredState('allow-empty-lines', false);
  const [sendFormat, setSendFormat] = useStoredState<SendFormat>('send-format', 'text');
  const [serialConfig, setSerialConfig] = useStoredState<SerialConnectionOptions>('serial-config', DEFAULT_SERIAL_OPTIONS);
  const [blePresetKey, setBlePresetKey] = useStoredState<string>('ble-preset', 'nordic_uart');
  const [bleConfig, setBleConfig] = useStoredState<BLEConnectionOptions>('ble-config', DEFAULT_BLE_OPTIONS);

  // Unusable custom hex falls back to Follow send (see createLineSplitter).
  const customBreakBytes = parseBreakBytes(receiveBreakCustom);

  const { lines, addLine, addSystemLine, handleData, resetSession, clearConsole } = useConsoleLines(
    sendFormat === 'hex',
    { mode: receiveBreak, custom: customBreakBytes },
  );
  const { history, record, step, resetCursor, remove: removeHistory, clear: clearHistory } = useSendHistory();

  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Connection handlers ----

  const handleConnect = async () => {
    setErrorMsg('');
    const handlers = {
      onData: handleData,
      onSessionReset: resetSession,
      onSystemMessage: addSystemLine,
    };

    if (connectionType === 'serial') {
      if (!SerialConnection.isSupported()) {
        setErrorMsg('Web Serial API not supported. Use Chrome or Edge.');
        return;
      }
      const conn = new SerialConnection(serialConfig);
      await attach(conn, handlers);
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
      await attach(conn, handlers);
      addSystemLine('Requesting BLE device...');
      await conn.connect();
      if (conn.isConnected) {
        addSystemLine(`✓ Connected via BLE: ${conn.deviceName}`);
        setDeviceName(conn.deviceName);
      }
    }
  };

  const handleDisconnect = async () => {
    if (await disconnect()) addSystemLine('Disconnected');
  };

  // ---- Send ----

  const handleSend = async () => {
    const command = inputValue;
    // Blank commands only go out when "allow empty lines" is on; the send is
    // then the line ending alone (e.g. a single 0D 0A with CR+LF).
    if (!isConnected || (!allowEmptyLines && !command.trim())) return;

    resetCursor();

    try {
      let bytes: Uint8Array;

      if (sendFormat === 'hex') {
        bytes = hexToBytes(command);
        // Hex payloads carry their own terminator — show the bytes as typed.
        addLine(bytes, 'sent', bytesToHex(bytes));
      } else {
        bytes = new TextEncoder().encode(command + lineEnding);
        // Row text excludes the appended ending (the row break marks it);
        // data keeps the bytes for hex view.
        addLine(bytes, 'sent', command);
      }

      await send(bytes);
      // Only clear on success — a failed send keeps the typed command.
      setInputValue('');
      // Dedupe + append so ArrowUp walks history in send order; blank sends
      // stay out of history (an empty entry is nothing to recall).
      if (command) record(command);
    } catch (err: unknown) {
      addSystemLine(`Send error: ${err instanceof Error ? err.message : String(err)}`);
    }

    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Ignore keys while an IME composition is active (e.g. CJK input) — Enter
    // commits the composition and the arrows move the candidate list.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') handleSend();
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setInputValue(step(e.key === 'ArrowUp' ? 1 : -1, inputValue));
    } else if (e.key === 'Escape') {
      setShowHistory(false);
    }
  };

  // Fill the command box from a history entry; the user still presses Enter to send.
  const pickHistory = (command: string) => {
    setInputValue(command);
    resetCursor();
    setShowHistory(false);
    inputRef.current?.focus();
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 font-mono">
      <Header
        connState={connState}
        deviceName={deviceName}
        onToggleSettings={() => setShowSettings((v) => !v)}
      />

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        sections={[
          connectionSection({
            serialConfig,
            setSerialConfig,
            bleConfig,
            setBleConfig,
            blePresetKey,
            setBlePresetKey,
          }),
          sendSection({
            lineEnding,
            setLineEnding,
            allowEmptyLines,
            setAllowEmptyLines,
          }),
          displaySection({
            showTimestamps,
            setShowTimestamps,
            receiveBreak,
            setReceiveBreak,
            receiveBreakCustom,
            setReceiveBreakCustom,
            customBreakValid: customBreakBytes !== null,
            displayFormat,
            setDisplayFormat,
            nonPrintable,
            setNonPrintable,
          }),
        ]}
      />

      <Toolbar
        connectionType={connectionType}
        setConnectionType={setConnectionType}
        connState={connState}
        isConnected={isConnected}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        lineEnding={lineEnding}
        setLineEnding={setLineEnding}
        sendFormat={sendFormat}
        setSendFormat={setSendFormat}
        displayFormat={displayFormat}
        setDisplayFormat={setDisplayFormat}
        showTimestamps={showTimestamps}
        onToggleTimestamps={() => setShowTimestamps((v) => !v)}
        autoScroll={autoScroll}
        onToggleAutoScroll={() => setAutoScroll((v) => !v)}
        history={history}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory((v) => !v)}
        onPickHistory={pickHistory}
        onRemoveHistory={removeHistory}
        onClearHistory={clearHistory}
        onClearConsole={clearConsole}
      />

      <ConsoleOutput
        lines={lines}
        showTimestamps={showTimestamps}
        displayFormat={displayFormat}
        nonPrintable={nonPrintable}
        autoScroll={autoScroll}
      />

      <CommandInput
        value={inputValue}
        onChange={(value) => {
          setInputValue(value);
          resetCursor();
        }}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        disabled={!isConnected}
        allowEmptyLines={allowEmptyLines}
        sendFormat={sendFormat}
        inputRef={inputRef}
      />

      {errorMsg && <ErrorBar message={errorMsg} onDismiss={() => setErrorMsg('')} />}

      <SupportWarning />
    </div>
  );
}
