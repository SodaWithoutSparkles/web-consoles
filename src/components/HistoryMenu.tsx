interface HistoryMenuProps {
  history: string[];
  open: boolean;
  onToggle: () => void;
  onPick: (command: string) => void;
  onRemove: (command: string) => void;
  onClear: () => void;
}

/** Send-history button with its dropdown, newest entry first. */
export function HistoryMenu({ history, open, onToggle, onPick, onRemove, onClear }: HistoryMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`px-2 py-1 rounded text-xs transition-colors ${open ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
          }`}
        title="Send history"
      >
        History
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 max-h-72 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="sticky top-0 flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800">
            <span className="text-xs text-gray-400">History ({history.length})</span>
            <button
              onClick={onClear}
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
                  onClick={() => onPick(command)}
                  className="flex-1 min-w-0 px-3 py-1.5 text-xs text-left text-gray-200 truncate"
                  title={command}
                >
                  {command}
                </button>
                <button
                  onClick={() => onRemove(command)}
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
  );
}
