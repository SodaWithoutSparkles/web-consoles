# web-consoles

[Demo](https://sodawithoutsparkles.github.io/web-consoles/)

A framework-agnostic TypeScript library for talking to serial and BLE UART devices from the browser.
It puts the Web Serial API and the Web Bluetooth API behind one small, event-driven interface.

- Zero runtime dependencies.
- No framework code. Use it with React, Vue, Svelte, or plain JavaScript.
- Ships ESM JavaScript plus TypeScript declarations.

## Requirements

Support for [web-serial](https://caniuse.com/web-serial) or [web-bluetooth](https://caniuse.com/web-bluetooth) api.
As of writing, Only Chromium-based support both, firefox only supports web-serial.

## Install

```sh
npm install web-consoles
```

ESM only — there is no CommonJS build, so `require('web-consoles')` will not work. 

Note: Releases are currently bugged, please copy the lib files if urgent

## Releases

Versions are automated with [semantic-release](https://semantic-release.org).
Commits on `main` following [Conventional Commits](https://www.conventionalcommits.org/)
produce a release automatically — npm publish, Git tag, GitHub Release, and
`CHANGELOG.md`:

| Commit                                                       | Release |
| ------------------------------------------------------------ | ------- |
| `fix: ...`                                                   | patch   |
| `feat: ...`                                                  | minor   |
| `fix!: ...` / `feat!: ...` or `BREAKING CHANGE:` in the body | major   |
| anything else                                                | none    |

## Quick start

### Serial

```ts
import { SerialConnection } from 'web-consoles';

const conn = new SerialConnection({ baudRate: 115200 });

conn.onData((bytes) => console.log(bytes));
conn.onDisconnect(() => console.log('port closed'));

await conn.connect();                                  // opens the browser port picker
await conn.send(new TextEncoder().encode('hello\r\n'));
await conn.disconnect();
```

### BLE UART

```ts
import { BLEConnection, BLE_PRESETS } from 'web-consoles';

// BLEConnection() already defaults to the Nordic UART Service.
// Use BLE_PRESETS.fff0 for FFF0/FFF1/FFF2 modules such as HC-08.
const conn = new BLEConnection({
  serviceUUID: BLE_PRESETS.fff0.serviceUUID,
  txCharacteristicUUID: BLE_PRESETS.fff0.txCharacteristicUUID,
  rxCharacteristicUUID: BLE_PRESETS.fff0.rxCharacteristicUUID,
});

conn.onData((bytes) => console.log(bytes));

await conn.connect();                                  // opens the browser device picker
await conn.send(new TextEncoder().encode('AT\r\n'));
await conn.disconnect();
```

Both classes share the same API, so the same UI code can drive either transport.

## API overview

`SerialConnection` and `BLEConnection` both extend `DeviceConnection`.

### Methods

| Member                           | Description                                                      |
| -------------------------------- | ---------------------------------------------------------------- |
| `connect()`                      | Opens the browser picker and connects. Resolves when ready.      |
| `disconnect()`                   | Closes the connection and releases the port, reader, and writer. |
| `send(data: Uint8Array)`         | Writes bytes. Rejects when not connected.                        |
| `sendString(text: string)`       | Encodes a string as UTF-8 and sends it.                          |
| `setOptions(options)`            | Updates options. Applied on the next `connect()`.                |
| `getOptions()`                   | Returns a copy of the current options.                           |
| `removeAllListeners()`           | Drops every listener.                                            |
| `SerialConnection.isSupported()` | Static. True when the Web Serial API exists.                     |
| `BLEConnection.isSupported()`    | Static. True when the Web Bluetooth API exists.                  |

### Properties

| Member        | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| `state`       | Current `ConnectionState`.                                      |
| `isConnected` | True when `state` is `connected`.                               |
| `deviceName`  | Device name reported by the transport. Empty when disconnected. |

### Events

Every `on*` method returns an unsubscribe function.

| Member                    | Payload           | Fires when                                   |
| ------------------------- | ----------------- | -------------------------------------------- |
| `onData(listener)`        | `Uint8Array`      | A chunk arrives from the device.             |
| `onStateChange(listener)` | `ConnectionState` | The connection state changes.                |
| `onError(listener)`       | `Error`           | The transport reports an error.              |
| `onDisconnect(listener)`  | —                 | The device disconnects outside your control. |

```ts
const off = conn.onData((bytes) => append(bytes));
off(); // unsubscribe
```

### Options

`SerialConnection` takes `SerialConnectionOptions`. Defaults come from
`DEFAULT_SERIAL_OPTIONS`.

| Option               | Default  | Description                                                                                          |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `baudRate`           | `115200` | Serial port speed.                                                                                   |
| `dataBits`           | `8`      |                                                                                                      |
| `stopBits`           | `1`      |                                                                                                      |
| `parity`             | `'none'` |                                                                                                      |
| `flowControl`        | `'none'` |                                                                                                      |
| `port`               | —        | Pre-authorized port to open instead of showing the picker (e.g. from `navigator.serial.getPorts()`). |
| `portRequestOptions` | —        | Passed to `navigator.serial.requestPort()` when no `port` is given (VID/PID filters).                |

`BLEConnection` takes `BLEConnectionOptions`. The three UUID fields default to
`DEFAULT_BLE_OPTIONS` (Nordic UART).

| Option                 | Default                         | Description                                                                          |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `serviceUUID`          | Nordic UART                     | Service to discover.                                                                 |
| `txCharacteristicUUID` | Nordic UART                     | Characteristic that `send()` writes to.                                              |
| `rxCharacteristicUUID` | Nordic UART                     | Characteristic subscribed to for notifications.                                      |
| `chunkSize`            | `20`                            | Max bytes per BLE write. Larger payloads are split into sequentially awaited writes. |
| `filters`              | `[{ services: [serviceUUID] }]` | Device-picker filters.                                                               |
| `acceptAllDevices`     | —                               | Show every device in the picker instead of filtering by service UUID.                |

### Helpers and constants

| Export                                          | Description                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `hexToBytes(text)`                              | `"48 65 6C"` to `Uint8Array`. Throws on odd length or invalid hex.                |
| `bytesToHex(bytes)`                             | `Uint8Array` to uppercase hex pairs.                                              |
| `bytesToAscii(bytes)`                           | `Uint8Array` to printable ASCII. Other bytes become `.`.                          |
| `bytesToString(bytes)`                          | Decodes one chunk as UTF-8.                                                       |
| `createStreamDecoder()`                         | Returns a decode function that keeps UTF-8 characters split across chunks intact. |
| `appendLineEnding(text, ending)`                | Appends a `LineEnding` value.                                                     |
| `LineEnding`                                    | `None`, `LF`, `CR`, `CRLF`.                                                       |
| `ConnectionState`                               | `Disconnected`, `Connecting`, `Connected`, `Error`.                               |
| `BLE_PRESETS`                                   | Nordic UART and FFF0 service/profile UUID sets.                                   |
| `DEFAULT_SERIAL_OPTIONS`, `DEFAULT_BLE_OPTIONS` | Default option objects.                                                           |

## Demo

The repository contains a React, Vite, and Tailwind terminal UI that uses the library.

```sh
npm install
npm run dev      # http://localhost:3000
```

## Development

| Command                      | Description                                                    |
| ---------------------------- | -------------------------------------------------------------- |
| `npm run dev`                | Starts the demo dev server.                                    |
| `npm run build`              | Typechecks and builds the demo.                                |
| `npm run build:lib`          | Builds the library into `dist/` as ESM plus type declarations. |
| `npm run typecheck`          | Runs `tsc --noEmit`.                                           |
| `npm run test`               | Runs the vitest suite.                                         |
| `npm run check:lib-agnostic` | Fails when `src/lib` imports external code.                    |

Publish with `npm run build:lib && npm publish`. The `files` field limits the
package to `dist/`, plus the README and LICENSE.

## License

MIT. See [LICENSE](./LICENSE).
