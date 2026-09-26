import type { Dispatch, SetStateAction } from 'react';
import { LineEnding } from '../lib';
import type { SettingsSection } from './SettingsModal';

interface SendSettingsProps {
  lineEnding: LineEnding;
  setLineEnding: Dispatch<SetStateAction<LineEnding>>;
  allowEmptyLines: boolean;
  setAllowEmptyLines: Dispatch<SetStateAction<boolean>>;
}

const labelClass = 'text-xs text-gray-400 block mb-1';
const hintClass = 'text-xs text-gray-600 mt-1';
const inputClass =
  'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500';

/** Per-ending explanation shown under the line-ending dropdown. */
const ENDING_HINTS: Record<LineEnding, string> = {
  [LineEnding.None]: 'No line ending is appended to sent text.',
  [LineEnding.LF]: 'LF (0A) ends every sent text line.',
  [LineEnding.CR]: 'CR (0D) ends every sent text line.',
  [LineEnding.CRLF]: 'CR+LF (0D 0A) ends every sent text line.',
};

function SendSettings({
  lineEnding,
  setLineEnding,
  allowEmptyLines,
  setAllowEmptyLines,
}: SendSettingsProps) {
  return (
    <div className="max-w-md space-y-3">
      <div>
        <label className={labelClass}>Line ending</label>
        <select
          value={lineEnding}
          onChange={(e) => setLineEnding(e.target.value as LineEnding)}
          className={inputClass}
        >
          <option value={LineEnding.None}>None</option>
          <option value={LineEnding.LF}>LF (0A)</option>
          <option value={LineEnding.CR}>CR (0D)</option>
          <option value={LineEnding.CRLF}>CR+LF (0D 0A)</option>
        </select>
        <p className={hintClass}>
          {ENDING_HINTS[lineEnding]} Text sends only — hex sends the bytes as typed.
        </p>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-gray-200">
          <input
            type="checkbox"
            checked={allowEmptyLines}
            onChange={(e) => setAllowEmptyLines(e.target.checked)}
            className="accent-emerald-600"
          />
          Allow empty lines
        </label>
        <p className={hintClass}>
          Enter on an empty command sends the line ending alone — e.g. just 0D 0A with CR+LF.
        </p>
      </div>
    </div>
  );
}

function SendIcon() {
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
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

/** Send settings as a settings-modal section. */
export function sendSection(props: SendSettingsProps): SettingsSection {
  return {
    id: 'send',
    label: 'Send',
    icon: <SendIcon />,
    content: <SendSettings {...props} />,
  };
}
