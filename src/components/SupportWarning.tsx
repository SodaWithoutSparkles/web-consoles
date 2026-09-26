import { BLEConnection, SerialConnection } from '../lib';

/** Browser support warning. Renders nothing when at least one transport works. */
export function SupportWarning() {
  if (SerialConnection.isSupported() || BLEConnection.isSupported()) return null;

  return (
    <div className="px-4 py-2 bg-yellow-950/50 border-t border-yellow-900 text-yellow-400 text-xs">
      ⚠️ Your browser does not support Web Serial or Web Bluetooth. Please use Chrome or Edge on desktop.
    </div>
  );
}
