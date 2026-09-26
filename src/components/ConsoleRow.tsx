import { memo } from 'react';
import { bytesToAscii, bytesToHex, bytesToString, type DisplayFormat } from '../lib';
import { formatTime } from '../utils';
import type { ConsoleLine } from '../types';

interface ConsoleRowProps {
  line: ConsoleLine;
  showTimestamps: boolean;
  displayFormat: DisplayFormat;
}

/**
 * Single console row. Memoized: props are stable (line identity, primitives), so
 * existing rows are skipped during the per-frame flush re-render.
 */
export const ConsoleRow = memo(function ConsoleRow({
  line,
  showTimestamps,
  displayFormat,
}: ConsoleRowProps) {
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
