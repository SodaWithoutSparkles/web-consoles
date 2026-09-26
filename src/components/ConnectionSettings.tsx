import type { Dispatch, SetStateAction } from 'react';
import {
  BLE_PRESETS,
  type BLEConnectionOptions,
  type SerialConnectionOptions,
  type SerialPortSettings,
} from '../lib';
import type { SettingsSection } from './SettingsModal';

interface ConnectionSettingsProps {
  serialConfig: SerialConnectionOptions;
  setSerialConfig: Dispatch<SetStateAction<SerialConnectionOptions>>;
  bleConfig: BLEConnectionOptions;
  setBleConfig: Dispatch<SetStateAction<BLEConnectionOptions>>;
  blePresetKey: string;
  setBlePresetKey: Dispatch<SetStateAction<string>>;
}

const labelClass = 'text-xs text-gray-400 block mb-1';
const inputClass =
  'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-emerald-500';

function SerialSettings({ serialConfig, setSerialConfig }: Pick<ConnectionSettingsProps, 'serialConfig' | 'setSerialConfig'>) {
  return (
    <div className="grid max-w-md grid-cols-2 gap-2">
      <div>
        <label className={labelClass}>Baud Rate</label>
        <select
          value={serialConfig.baudRate}
          onChange={(e) => setSerialConfig({ ...serialConfig, baudRate: Number(e.target.value) })}
          className={inputClass}
        >
          {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Data Bits</label>
        <select
          value={serialConfig.dataBits}
          onChange={(e) => setSerialConfig({ ...serialConfig, dataBits: Number(e.target.value) as 7 | 8 })}
          className={inputClass}
        >
          <option value={7}>7</option>
          <option value={8}>8</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Stop Bits</label>
        <select
          value={serialConfig.stopBits}
          onChange={(e) => setSerialConfig({ ...serialConfig, stopBits: Number(e.target.value) as 1 | 2 })}
          className={inputClass}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>Parity</label>
        <select
          value={serialConfig.parity}
          onChange={(e) => setSerialConfig({ ...serialConfig, parity: e.target.value as SerialPortSettings['parity'] })}
          className={inputClass}
        >
          <option value="none">None</option>
          <option value="even">Even</option>
          <option value="odd">Odd</option>
        </select>
      </div>
    </div>
  );
}

function BLESettings({
  bleConfig,
  setBleConfig,
  blePresetKey,
  setBlePresetKey,
}: Pick<ConnectionSettingsProps, 'bleConfig' | 'setBleConfig' | 'blePresetKey' | 'setBlePresetKey'>) {
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
    <div className="max-w-md space-y-3">
      <div>
        <label className={labelClass}>Preset</label>
        <select value={blePresetKey} onChange={(e) => handlePresetChange(e.target.value)} className={inputClass}>
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
          <label className={labelClass}>Service UUID</label>
          <input
            type="text"
            value={bleConfig.serviceUUID}
            onChange={(e) => { setBlePresetKey('custom'); setBleConfig({ ...bleConfig, serviceUUID: e.target.value }); }}
            className={`${inputClass} font-mono text-xs`}
          />
        </div>
        <div>
          <label className={labelClass}>TX Char (Write)</label>
          <input
            type="text"
            value={bleConfig.txCharacteristicUUID}
            onChange={(e) => { setBlePresetKey('custom'); setBleConfig({ ...bleConfig, txCharacteristicUUID: e.target.value }); }}
            className={`${inputClass} font-mono text-xs`}
          />
        </div>
        <div>
          <label className={labelClass}>RX Char (Notify)</label>
          <input
            type="text"
            value={bleConfig.rxCharacteristicUUID}
            onChange={(e) => { setBlePresetKey('custom'); setBleConfig({ ...bleConfig, rxCharacteristicUUID: e.target.value }); }}
            className={`${inputClass} font-mono text-xs`}
          />
        </div>
      </div>
    </div>
  );
}

function PlugIcon() {
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
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  );
}

/** Connection settings as a settings-modal section (serial + BLE tabs). */
export function connectionSection(props: ConnectionSettingsProps): SettingsSection {
  return {
    id: 'connection',
    label: 'Connection',
    icon: <PlugIcon />,
    tabs: [
      { id: 'serial', label: 'Serial', content: <SerialSettings {...props} /> },
      { id: 'ble', label: 'BLE', content: <BLESettings {...props} /> },
    ],
  };
}
