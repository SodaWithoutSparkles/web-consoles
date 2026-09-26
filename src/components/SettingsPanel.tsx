import type { Dispatch, SetStateAction } from 'react';
import {
  BLE_PRESETS,
  type BLEConnectionOptions,
  type SerialConnectionOptions,
  type SerialPortSettings,
} from '../lib';

interface SettingsPanelProps {
  serialConfig: SerialConnectionOptions;
  setSerialConfig: Dispatch<SetStateAction<SerialConnectionOptions>>;
  bleConfig: BLEConnectionOptions;
  setBleConfig: Dispatch<SetStateAction<BLEConnectionOptions>>;
  blePresetKey: string;
  setBlePresetKey: Dispatch<SetStateAction<string>>;
}

/** Collapsible panel for serial port settings and BLE UUIDs. */
export function SettingsPanel({
  serialConfig,
  setSerialConfig,
  bleConfig,
  setBleConfig,
  blePresetKey,
  setBlePresetKey,
}: SettingsPanelProps) {
  const handlePresetChange = (key: string) => {
    setBlePresetKey(key);
    if (BLE_PRESETS[key]) {
      const p = BLE_PRESETS[key];
      setBleConfig({
        serviceUUID: p.serviceUUID,
        txCharacteristicUUID: p.txCharacteristicUUID,
        rxCharacteristicUUID: p.rxCharacteristicUUID,
      });
    }
  };

  return (
    <div className="bg-gray-900 border-b border-gray-800 p-4 shrink-0">
      <div className="max-w-6xl mx-auto">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Connection Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Serial */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Web Serial</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Baud Rate</label>
                <select
                  value={serialConfig.baudRate}
                  onChange={(e) => setSerialConfig({ ...serialConfig, baudRate: Number(e.target.value) })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
                >
                  {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Data Bits</label>
                <select
                  value={serialConfig.dataBits}
                  onChange={(e) => setSerialConfig({ ...serialConfig, dataBits: Number(e.target.value) as 7 | 8 })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value={7}>7</option>
                  <option value={8}>8</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Stop Bits</label>
                <select
                  value={serialConfig.stopBits}
                  onChange={(e) => setSerialConfig({ ...serialConfig, stopBits: Number(e.target.value) as 1 | 2 })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Parity</label>
                <select
                  value={serialConfig.parity}
                  onChange={(e) => setSerialConfig({ ...serialConfig, parity: e.target.value as SerialPortSettings['parity'] })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="none">None</option>
                  <option value="even">Even</option>
                  <option value="odd">Odd</option>
                </select>
              </div>
            </div>
          </div>

          {/* BLE */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Web Bluetooth</h4>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Preset</label>
              <select
                value={blePresetKey}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              >
                {Object.entries(BLE_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.name}</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
              <p className="text-xs text-gray-600 mt-1">
                {BLE_PRESETS[blePresetKey]?.description || 'Enter UUIDs manually below'}
              </p>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Service UUID</label>
                <input
                  type="text"
                  value={bleConfig.serviceUUID}
                  onChange={(e) => { setBlePresetKey('custom'); setBleConfig({ ...bleConfig, serviceUUID: e.target.value }); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">TX Char (Write)</label>
                <input
                  type="text"
                  value={bleConfig.txCharacteristicUUID}
                  onChange={(e) => { setBlePresetKey('custom'); setBleConfig({ ...bleConfig, txCharacteristicUUID: e.target.value }); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">RX Char (Notify)</label>
                <input
                  type="text"
                  value={bleConfig.rxCharacteristicUUID}
                  onChange={(e) => { setBlePresetKey('custom'); setBleConfig({ ...bleConfig, rxCharacteristicUUID: e.target.value }); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
