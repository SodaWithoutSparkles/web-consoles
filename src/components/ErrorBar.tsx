interface ErrorBarProps {
  message: string;
  onDismiss: () => void;
}

/** Dismissible error strip below the input area. */
export function ErrorBar({ message, onDismiss }: ErrorBarProps) {
  return (
    <div className="px-4 py-2 bg-red-950/50 border-t border-red-900 text-red-400 text-xs flex items-center justify-between">
      <span>Error: {message}</span>
      <button onClick={onDismiss} className="text-red-500 hover:text-red-300 ml-2">✕</button>
    </div>
  );
}
