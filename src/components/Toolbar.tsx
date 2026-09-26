import type { Dispatch, SetStateAction } from 'react';
import { ConnectionState, type DisplayFormat, type LineEnding } from '../lib';
import type { ConnectionType, SendFormat } from '../types';
import { HistoryMenu } from './HistoryMenu';

interface ToolbarProps {
  connectionType: ConnectionType;
  setConnectionType: Dispatch<SetStateAction<ConnectionType>>;
  connState: ConnectionState;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  lineEnding: LineEnding;
  setLineEnding: Dispatch<SetStateAction<LineEnding>>;
  sendFormat: SendFormat;
  setSendFormat: Dispatch<SetStateAction<SendFormat>>;
  displayFormat: DisplayFormat;
  setDisplayFormat: Dispatch<SetStateAction<DisplayFormat>>;
  showTimestamps: boolean;
  onToggleTimestamps: () => void;
  autoScroll: boolean;
  onToggleAutoScroll: () => void;
  history: string[];
  showHistory: boolean;
  onToggleHistory: () => void;
  onPickHistory: (command: string) => void;
  onRemoveHistory: (command: string) => void;
  onClearHistory: () => void;
  onClearConsole: () => void;
}

/** Toolbar: transport picker, connect button, format selects, view toggles. */
export function Toolbar({
  connectionType,
  setConnectionType,
  connState,
  isConnected,
  onConnect,
  onDisconnect,
  lineEnding,
  setLineEnding,
  sendFormat,
  setSendFormat,
  displayFormat,
  setDisplayFormat,
  showTimestamps,
  onToggleTimestamps,
  autoScroll,
  onToggleAutoScroll,
  history,
  showHistory,
  onToggleHistory,
  onPickHistory,
  onRemoveHistory,
  onClearHistory,
  onClearConsole,
}: ToolbarProps) {
  return (
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
        onClick={isConnected ? onDisconnect : onConnect}
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
          onChange={(e) => setSendFormat(e.target.value as SendFormat)}
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
          <option value="both">Both (append)</option>
          <option value="both-hexdump">Both (dump)</option>
        </select>
      </div>

      <div className="flex-1"></div>

      {/* Misc toggles */}
      <button
        onClick={onToggleTimestamps}
        className={`px-2 py-1 rounded text-xs transition-colors ${showTimestamps ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
          }`}
        title="Toggle timestamps"
      >
        🕐
      </button>
      <button
        onClick={onToggleAutoScroll}
        className={`px-2 py-1 rounded text-xs transition-colors ${autoScroll ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
          }`}
        title="Toggle auto-scroll"
      >
        ↓
      </button>
      <HistoryMenu
        history={history}
        open={showHistory}
        onToggle={onToggleHistory}
        onPick={onPickHistory}
        onRemove={onRemoveHistory}
        onClear={onClearHistory}
      />
      <button
        onClick={onClearConsole}
        className="px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
