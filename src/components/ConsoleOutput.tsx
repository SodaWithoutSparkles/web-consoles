import { useEffect, useRef } from 'react';
import type { DisplayFormat } from '../lib';
import type { ConsoleLine, NonPrintable } from '../types';
import { ConsoleRow } from './ConsoleRow';

interface ConsoleOutputProps {
  lines: ConsoleLine[];
  showTimestamps: boolean;
  displayFormat: DisplayFormat;
  nonPrintable: NonPrintable;
  autoScroll: boolean;
}

/** Scrolling console output, with the empty state and auto-scroll behaviour. */
export function ConsoleOutput({ lines, showTimestamps, displayFormat, nonPrintable, autoScroll }: ConsoleOutputProps) {
  const consoleRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  return (
    <div
      ref={consoleRef}
      className="flex-1 overflow-y-auto p-4 bg-gray-950 scroll-smooth min-h-0"
    >
      {lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-600">
          <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
          <p className="text-sm">Select a connection type and click Connect to get started</p>
          <p className="text-xs mt-2 text-gray-700">Supports Web Serial API and Web Bluetooth (BLE)</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {lines.map((line) => (
            <ConsoleRow
              key={line.id}
              line={line}
              showTimestamps={showTimestamps}
              displayFormat={displayFormat}
              nonPrintable={nonPrintable}
            />
          ))}
        </div>
      )}
    </div>
  );
}
