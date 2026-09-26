import { ConnectionState } from '../lib';

const STATUS_COLORS: Record<ConnectionState, string> = {
  [ConnectionState.Disconnected]: 'bg-gray-500',
  [ConnectionState.Connecting]: 'bg-yellow-500 animate-pulse',
  [ConnectionState.Connected]: 'bg-green-500',
  [ConnectionState.Error]: 'bg-red-500',
};

interface HeaderProps {
  connState: ConnectionState;
  deviceName: string;
  onToggleSettings: () => void;
}

/** Title bar: status light, device name, settings toggle. */
export function Header({ connState, deviceName, onToggleSettings }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
          <h1 className="text-lg font-bold text-emerald-400">Web Serial Console</h1>
        </div>
        <div className="flex items-center gap-1.5 ml-4">
          <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[connState]}`}></div>
          <span className="text-xs text-gray-400 capitalize">{connState}</span>
          {deviceName && (
            <span className="text-xs text-gray-500 ml-1">— {deviceName}</span>
          )}
        </div>
      </div>
      <button
        onClick={onToggleSettings}
        className="p-2 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
        title="Settings"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </header>
  );
}
