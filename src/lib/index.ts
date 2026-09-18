// ============================================================
// Web Serial Console – Core Library
// ============================================================
// A framework-agnostic library for communicating with serial
// and BLE UART devices via the Web Serial / Web Bluetooth APIs.
//
// Usage:
//   import { SerialConnection, BLEConnection } from './lib';
//
//   const conn = new SerialConnection({ baudRate: 115200 });
//   conn.onData((bytes) => console.log(bytes));
//   await conn.connect();
//   await conn.send(new TextEncoder().encode('hello\r\n'));
//   await conn.disconnect();
// ============================================================

// Base class
export { DeviceConnection } from './device-connection';

// Implementations
export { SerialConnection } from './serial-connection';
export { BLEConnection } from './ble-connection';

// Types, enums, constants, and utilities
export {
  type ConnectionOptions,
  type SerialConnectionOptions,
  type SerialPortSettings,
  type BLEConnectionOptions,
  type ConnectionStateListener,
  type DataListener,
  type ErrorListener,
  type DisconnectListener,
  type DisplayFormat,
  type BLEPreset,
  type SerialPortLike,
  type SerialPortInfoLike,
  type SerialPortFilterLike,
  type SerialPortRequestOptionsLike,
  type SerialOptionsLike,
  type BluetoothLEScanFilterLike,
  ConnectionState,
  LineEnding,
  BLE_PRESETS,
  DEFAULT_SERIAL_OPTIONS,
  DEFAULT_BLE_OPTIONS,
  appendLineEnding,
  hexToBytes,
  bytesToHex,
  bytesToAscii,
  bytesToString,
  createStreamDecoder,
} from './types';
