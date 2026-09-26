import { memo } from 'react';
import { bytesToAscii, bytesToHex, bytesToString, type DisplayFormat } from '../lib';
import { formatTime, hexdumpRows, splitControlChars } from '../utils';
import type { ConsoleLine, NonPrintable } from '../types';

interface ConsoleRowProps {
  line: ConsoleLine;
  showTimestamps: boolean;
  displayFormat: DisplayFormat;
  nonPrintable: NonPrintable;
}

/** Bytes per row in the hexdump view. */
const HEXDUMP_WIDTH = 16;
/** Invisible stand-in that keeps continuation rows aligned under the timestamp. */
const TIMESTAMP_SPACER = '00:00:00.000';

/** Text with control characters escaped as red hex bytes (`print` keeps them). */
function TextContent({ text, nonPrintable }: { text: string; nonPrintable: NonPrintable }) {
  const runs = splitControlChars(text, nonPrintable);
  return (
    <>
      {runs.map((run, index) =>
        run.escaped ? (
          <span key={index} className="text-red-500">
            {run.text}
          </span>
        ) : (
          run.text
        ),
      )}
    </>
  );
}

/**
 * Single console row. Memoized: props are stable (line identity, primitives), so
 * existing rows are skipped during the per-frame flush re-render.
 *
 * The hexdump view replaces the row with 16-byte rows. Only the first carries
 * the timestamp and direction arrow; the rest hold the columns with an
 * invisible timestamp. Slots past the data end pad with `..` — never with bytes
 * the device did not send. Sent lines dump too; colour still marks direction.
 */
export const ConsoleRow = memo(function ConsoleRow({
  line,
  showTimestamps,
  displayFormat,
  nonPrintable,
}: ConsoleRowProps) {
  const text = line.text ?? bytesToString(line.data);
  const arrow =
    line.direction === 'sent' ? (
      <span className="text-emerald-600">→</span>
    ) : line.direction === 'received' ? (
      <span className="text-blue-500">←</span>
    ) : (
      <span className="text-yellow-600">●</span>
    );

  const colorClass =
    line.direction === 'sent'
      ? 'text-emerald-400'
      : line.direction === 'received'
        ? 'text-gray-200'
        : 'text-yellow-500 italic';

  // System rows are messages, not data: always plain text, never dumped.
  if (line.direction !== 'system' && displayFormat === 'both-hexdump') {
    const rows = hexdumpRows(line.data, HEXDUMP_WIDTH);
    // An empty payload dumps to no rows; keep one so the row stays visible.
    const dumpRows = rows.length > 0 ? rows : [{ hex: '', ascii: '' }];
    return (
      <div className={`flex gap-2 text-sm leading-relaxed ${colorClass}`}>
        <span className="flex min-w-0 flex-col">
          {dumpRows.map((row, index) => (
            <span key={index} className="flex gap-2">
              {showTimestamps && (
                <span className="text-gray-600 text-xs shrink-0 pt-0.5 select-none">
                  {index === 0 ? (
                    formatTime(line.timestamp)
                  ) : (
                    <span className="invisible">{TIMESTAMP_SPACER}</span>
                  )}
                </span>
              )}
              <span className="shrink-0 select-none w-3 text-center">{index === 0 && arrow}</span>
              <span className="whitespace-pre">{row.hex}</span>
              {row.ascii && <span className="text-gray-500">{`|${row.ascii}|`}</span>}
              {index === 0 && line.failed && (
                <span className="text-red-500 shrink-0" title="Send failed — bytes may be partially written">
                  ✗ failed
                </span>
              )}
            </span>
          ))}
        </span>
      </div>
    );
  }

  const content =
    line.direction === 'system' || displayFormat === 'ascii' ? (
      <TextContent text={text} nonPrintable={nonPrintable} />
    ) : displayFormat === 'hex' ? (
      bytesToHex(line.data)
    ) : (
      `${bytesToHex(line.data)}  |  ${bytesToAscii(line.data)}`
    );

  return (
    <div className={`flex gap-2 text-sm leading-relaxed ${colorClass}`}>
      {showTimestamps && (
        <span className="text-gray-600 text-xs shrink-0 pt-0.5 select-none">
          {formatTime(line.timestamp)}
        </span>
      )}
      <span className="shrink-0 select-none w-3 text-center">{arrow}</span>
      <span className="break-all whitespace-pre-wrap">{content}</span>
      {line.failed && (
        <span className="text-red-500 shrink-0" title="Send failed — bytes may be partially written">
          ✗ failed
        </span>
      )}
    </div>
  );
});
