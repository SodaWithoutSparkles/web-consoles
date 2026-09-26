import type { KeyboardEvent, RefObject } from 'react';
import type { SendFormat } from '../types';

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled: boolean;
  /** Permit sending a blank command (the line ending alone). */
  allowEmptyLines: boolean;
  sendFormat: SendFormat;
  inputRef: RefObject<HTMLInputElement>;
}

/** Command box: text/hex input plus Send button. */
export function CommandInput({
  value,
  onChange,
  onSend,
  onKeyDown,
  disabled,
  allowEmptyLines,
  sendFormat,
  inputRef,
}: CommandInputProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 border-t border-gray-800 shrink-0">
      <span className="text-emerald-500 text-sm font-bold">{'>'}</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={
          disabled
            ? 'Connect to a device first…'
            : sendFormat === 'hex'
              ? 'Type hex bytes and press Enter…'
              : 'Type text and press Enter…'
        }
        className="flex-1 bg-transparent text-gray-200 text-sm placeholder-gray-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        onClick={onSend}
        disabled={disabled || (!allowEmptyLines && !value.trim())}
        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Send
      </button>
    </div>
  );
}
