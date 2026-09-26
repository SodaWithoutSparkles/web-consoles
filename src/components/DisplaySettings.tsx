import type { Dispatch, SetStateAction } from 'react';
import type { DisplayFormat } from '../lib';
import type { NonPrintable, ReceiveBreak } from '../types';
import type { SettingsSection } from './SettingsModal';

interface DisplaySettingsProps {
  showTimestamps: boolean;
  setShowTimestamps: Dispatch<SetStateAction<boolean>>;
  receiveBreak: ReceiveBreak;
  setReceiveBreak: Dispatch<SetStateAction<ReceiveBreak>>;
  /** Raw custom-break input (hex bytes, e.g. `0D 0A`). */
  receiveBreakCustom: string;
  setReceiveBreakCustom: Dispatch<SetStateAction<string>>;
  /** False when the custom input is unusable; the splitter then follows send. */
  customBreakValid: boolean;
  displayFormat: DisplayFormat;
  setDisplayFormat: Dispatch<SetStateAction<DisplayFormat>>;
  nonPrintable: NonPrintable;
  setNonPrintable: Dispatch<SetStateAction<NonPrintable>>;
}

const labelClass = 'text-xs text-gray-400 block mb-1';
const hintClass = 'text-xs text-gray-600 mt-1';
const inputClass =
  'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500';

/** Per-mode explanation shown under the receive-break dropdown. */
const BREAK_HINTS: Record<ReceiveBreak, string> = {
  follow: 'Received lines break on CR, LF or CRLF.',
  crlf: 'Only CRLF (0D 0A) ends a received line.',
  cr: 'Only CR (0D) ends a received line.',
  lf: 'Only LF (0A) ends a received line.',
  custom: 'Only this byte sequence ends a received line.',
};

/** Per-format explanation shown under the view dropdown. */
const VIEW_HINTS: Record<DisplayFormat, string> = {
  ascii: 'Plain text; line endings are already applied.',
  hex: 'Raw bytes as spaced hex pairs.',
  both: 'Hex and printable text on the same row.',
  'both-hexdump': '16 bytes per row, wrapped; continuation rows repeat no timestamp.',
};

const NON_PRINTABLE_OPTIONS: Array<{ value: NonPrintable; label: string }> = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'hex-except-crlf', label: 'Show as hex (except CR/LF)' },
  { value: 'hex-except-crlf-tab', label: 'Show as hex (except CR/LF/TAB)' },
  { value: 'hex-except-crlf-tab-bksp', label: 'Show as hex (except CR/LF/TAB/BKSP)' },
  { value: 'hex-all', label: 'Show as hex (all)' },
  { value: 'print', label: 'Print anyway' },
];

function DisplaySettings({
  showTimestamps,
  setShowTimestamps,
  receiveBreak,
  setReceiveBreak,
  receiveBreakCustom,
  setReceiveBreakCustom,
  customBreakValid,
  displayFormat,
  setDisplayFormat,
  nonPrintable,
  setNonPrintable,
}: DisplaySettingsProps) {
  return (
    <div className="max-w-md space-y-3">
      <div>
        <label className="flex items-center gap-2 text-sm text-gray-200">
          <input
            type="checkbox"
            checked={showTimestamps}
            onChange={(e) => setShowTimestamps(e.target.checked)}
            className="accent-emerald-600"
          />
          Show timestamps
        </label>
        <p className={hintClass}>Time each row was sent or received.</p>
      </div>

      <div>
        <label className={labelClass}>Receive start new line on</label>
        <select
          value={receiveBreak}
          onChange={(e) => setReceiveBreak(e.target.value as ReceiveBreak)}
          className={inputClass}
        >
          <option value="follow">Follow send</option>
          <option value="crlf">CRLF (0D 0A)</option>
          <option value="cr">CR (0D)</option>
          <option value="lf">LF (0A)</option>
          <option value="custom">Custom…</option>
        </select>
        {receiveBreak === 'custom' && (
          <input
            type="text"
            value={receiveBreakCustom}
            onChange={(e) => setReceiveBreakCustom(e.target.value)}
            placeholder="0D 0A"
            className={`${inputClass} mt-1 font-mono text-xs ${customBreakValid ? '' : 'border-red-600'}`}
          />
        )}
        <p className={hintClass}>
          {BREAK_HINTS[receiveBreak]}
          {receiveBreak === 'custom' && !customBreakValid && ' Invalid hex — falling back to Follow send.'}
        </p>
      </div>

      <div>
        <label className={labelClass}>View</label>
        <select
          value={displayFormat}
          onChange={(e) => setDisplayFormat(e.target.value as DisplayFormat)}
          className={inputClass}
        >
          <option value="ascii">ASCII</option>
          <option value="hex">HEX</option>
          <option value="both">Both (append)</option>
          <option value="both-hexdump">Both (hexdump)</option>
        </select>
        <p className={hintClass}>{VIEW_HINTS[displayFormat]}</p>
      </div>

      <div>
        <label className={labelClass}>Show non-printable chars</label>
        <select
          value={nonPrintable}
          onChange={(e) => setNonPrintable(e.target.value as NonPrintable)}
          className={inputClass}
        >
          {NON_PRINTABLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className={hintClass}>
          Control characters (0x00–0x1F, DEL) in the text view render as red hex bytes.
        </p>
      </div>
    </div>
  );
}

function MonitorIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

/** Display settings as a settings-modal section. */
export function displaySection(props: DisplaySettingsProps): SettingsSection {
  return {
    id: 'display',
    label: 'Display',
    icon: <MonitorIcon />,
    content: <DisplaySettings {...props} />,
  };
}
