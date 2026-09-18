// ============================================================
// Web Bluetooth API connection (BLE UART)
// ============================================================

import { DeviceConnection } from './device-connection';
import { BLEConnectionOptions, ConnectionState, DEFAULT_BLE_OPTIONS, toError } from './types';

/** ATT MTU 23 − 3 byte header: the smallest payload a BLE 4.0 peer must accept. */
const DEFAULT_CHUNK_SIZE = 20;

export class BLEConnection extends DeviceConnection {
  private options: BLEConnectionOptions;
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private txChar: BluetoothRemoteGATTCharacteristic | null = null;
  private rxChar: BluetoothRemoteGATTCharacteristic | null = null;
  private disconnectHandler: (() => void) | null = null;
  private dataHandler: ((event: Event) => void) | null = null;

  constructor(options: Partial<BLEConnectionOptions> = {}) {
    super();
    this.options = { ...DEFAULT_BLE_OPTIONS, ...options };
  }

  /** Check if Web Bluetooth API is available (safe in Node/SSR/workers — never throws) */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /**
   * Update connection options (only takes effect on next connect).
   * Omitted fields keep their current value.
   */
  setOptions(options: Partial<BLEConnectionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): BLEConnectionOptions {
    return { ...this.options };
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      this.setState(ConnectionState.Connecting);

      if (!BLEConnection.isSupported()) {
        throw new Error('Web Bluetooth API is not supported in this browser. Use Chrome or Edge.');
      }

      const device = await navigator.bluetooth.requestDevice(this.requestDeviceOptions());

      this.device = device;
      this._deviceName = device.name || 'Unknown BLE Device';

      // Listen for unexpected disconnection
      this.disconnectHandler = () => {
        this.cleanup();
        this.emitUnexpectedDisconnect();
      };
      device.addEventListener('gattserverdisconnected', this.disconnectHandler);

      const server = await device.gatt!.connect();
      this.server = server;

      const service = await server.getPrimaryService(this.options.serviceUUID);

      // TX characteristic (we write to this)
      this.txChar = await service.getCharacteristic(this.options.txCharacteristicUUID);

      // RX characteristic (we subscribe to notifications from this)
      this.rxChar = await service.getCharacteristic(this.options.rxCharacteristicUUID);

      // Subscribe to notifications
      this.dataHandler = (event: Event) => {
        const char = event.target as BluetoothRemoteGATTCharacteristic;
        if (char.value) {
          const view = new Uint8Array(char.value.buffer, char.value.byteOffset, char.value.byteLength);
          // Copy: the BLE stack may reuse the DataView's backing buffer once
          // this callback returns, which would mutate the bytes our
          // subscribers hold.
          this.emitData(new Uint8Array(view));
        }
      };
      this.rxChar.addEventListener('characteristicvaluechanged', this.dataHandler);
      await this.rxChar.startNotifications();

      this.armDisconnectNotification();
      this.setState(ConnectionState.Connected);
    } catch (err: unknown) {
      // User cancelled the device picker — not an error, just back to idle.
      // Only skip cleanup while no device was assigned: later in connect() a
      // NotFoundError is a real failure (service/characteristic lookup), and
      // cleanup() must run so the device + disconnect listener do not leak.
      if (err instanceof Error && err.name === 'NotFoundError' && this.device === null) {
        this.setState(ConnectionState.Disconnected);
        return;
      }
      this.cleanup();
      this.setState(ConnectionState.Error);
      this.emitError(toError(err));
    }
  }

  async disconnect(): Promise<void> {
    this.cleanup();
    this.setState(ConnectionState.Disconnected);
  }

  /**
   * Send bytes to the TX characteristic.
   * Web Bluetooth exposes no MTU negotiation, so anything larger than the
   * configured `chunkSize` (default 20) is split into sequentially awaited
   * writes instead of being truncated or dropped by the stack.
   */
  async send(data: Uint8Array): Promise<void> {
    const char = this.txChar;
    if (!char || !this.isConnected) {
      throw new Error('Not connected');
    }

    const chunkSize = Math.max(1, this.options.chunkSize ?? DEFAULT_CHUNK_SIZE);
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      // Copy: BufferSource needs an ArrayBuffer-backed view (TS 5.7), and the
      // copy also keeps the write independent of the caller's buffer.
      const chunk = new Uint8Array(data.subarray(offset, offset + chunkSize));
      try {
        if (char.properties.writeWithoutResponse) {
          await char.writeValueWithoutResponse(chunk);
        } else {
          await char.writeValueWithResponse(chunk);
        }
      } catch (err: unknown) {
        // BLE writes are not transactional: every chunk before `offset` already
        // reached the device, so report how far the payload got.
        const error = toError(err) as Error & { bytesWritten?: number };
        error.bytesWritten = offset;
        throw error;
      }
    }
  }

  // ---- Private ----

  /**
   * Device-picker options: `acceptAllDevices` wins, then custom `filters`,
   * then the default filter on the configured service UUID. The service UUID
   * is always requested as an optional service so it stays accessible after
   * the user picks a device through a custom filter.
   */
  private requestDeviceOptions(): RequestDeviceOptions {
    const { serviceUUID, filters, acceptAllDevices } = this.options;
    if (acceptAllDevices) {
      return { acceptAllDevices: true, optionalServices: [serviceUUID] };
    }
    return {
      filters: filters && filters.length > 0 ? filters : [{ services: [serviceUUID] }],
      optionalServices: [serviceUUID],
    };
  }

  private cleanup(): void {
    if (this.rxChar && this.dataHandler) {
      this.rxChar.removeEventListener('characteristicvaluechanged', this.dataHandler);
      this.rxChar.stopNotifications().catch(() => { });
    }
    if (this.device && this.disconnectHandler) {
      this.device.removeEventListener('gattserverdisconnected', this.disconnectHandler);
    }
    if (this.server) {
      this.server.disconnect();
    }

    this.rxChar = null;
    this.txChar = null;
    this.server = null;
    this.device = null;
    this.dataHandler = null;
    this.disconnectHandler = null;
    this._deviceName = '';
  }
}
