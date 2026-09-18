# Code Review — web-consoles

**Temp review file.** Delete when triaged.

## Context

- `src/lib/` is the **product**: framework-agnostic Serial + BLE UART library, meant to be imported/published.
- `src/App.tsx` is a **demo** of that library.
- Severity is weighted for library code. Demo-only issues are lower priority.

---

## 🔴 Library correctness

Ship-to-consumer bugs. Silent data corruption or broken-for-real-payloads.

- [ ] **`src/lib/types.ts` → `hexToBytes` — invalid hex silently passes.**
  `parseInt('1g', 16)` returns `1`, not `NaN`, so the `isNaN(byte)` guard never fires.
  Result: `hexToBytes('1g')` yields `[0x01]` instead of throwing — corrupt bytes on the wire.
  *Fix:* validate `cleaned` against `/^[0-9a-fA-F]*$/` before the parse loop.

- [ ] **`src/lib/ble-connection.ts` → `send` — no MTU chunking.**
  Writing more than ATT MTU − 3 bytes (default ~20) fails or silently drops on
  `writeValueWithoutResponse`. Any consumer sending JSON/AT payloads hits this immediately.
  *Fix:* read negotiated MTU (or default to 20), split, await writes sequentially.

- [ ] **`src/lib/ble-connection.ts` → `characteristicvaluechanged` — emitted view aliases reused buffer.**
  `new Uint8Array(char.value.buffer, char.value.byteOffset, char.value.byteLength)` is a view,
  not a copy. The BLE stack may reuse that DataView's backing buffer, so a `Uint8Array` handed to
  subscribers can mutate after the callback returns.
  *Fix:* `emitData(new Uint8Array(view))` — copy before emit.

- [ ] **`src/lib/serial-connection.ts` → `disconnect` — race with read loop.**
  `reader.cancel()` is not awaited to completion before `port.close()`. Intermittent
  `NetworkError` / failed re-connect. Also asymmetric: the read-loop error path emits
  `emitDisconnect()`, but `disconnect()` itself does not — subscribers can't rely on one signal.
  *Fix:* await loop exit (or a `loopDone` promise) before close; document or unify the disconnect event.

- [ ] **Chunk-boundary UTF-8 loss (lib-wide).**
  `bytesToString` builds a fresh `TextDecoder` per call. A multibyte character split across two
  reads renders `�`. For a library this needs a streaming-decoder helper
  (`TextDecoder` with `{ stream: true }`), and the demo should use it.

---

## 🔴 Packaging — not importable as a library today

- [ ] **`package.json` has no library entry points.**
  `"private": true`, name `sandbox-workspace`, no `main`/`module`/`types`/`exports`, no `files`.
  Nothing can consume this. *Fix:* add `exports` map + `types`, `files: ["dist"]`,
  a lib build (vite lib mode or tsup), and a `tsconfig.lib.json`.

- [ ] **React / Tailwind / Vite plugins are demo-only but sit in `dependencies`.**
  Move to `devDependencies`. The lib itself is zero-runtime-dep — keep verifying that.

- [ ] **Truly unused deps — remove entirely** (unused by both lib and demo):
  `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@supabase/supabase-js`,
  `canvas-confetti`, `@types/canvas-confetti`, `date-fns`, `framer-motion`, `lucide-react`,
  `react-router-dom`, `recharts`, `uuid`, `@types/uuid`.

- [ ] **No README.** The usage snippet in the `src/lib/index.ts` header is the seed — promote it.
  For a library the README *is* part of the deliverable.

- [ ] **No tests.** `hexToBytes` / `bytesToHex` / `bytesToAscii` / `bytesToString` are pure and
  trivial to cover — the `hexToBytes` bug above would have been caught. Add vitest.

- [ ] **`src/lib` imports no framework code** — the framework-agnostic claim holds. Enforce it
  (lint rule or CI check) so it stays true.

---

## 🟠 Library type declarations & API surface

- [ ] **`src/web-serial.d.ts` — hand-rolled ambient declarations.**
  `interface Navigator { serial: Serial; bluetooth: Bluetooth }` declares both as **required**,
  contradicting `isSupported()`'s existence check. Make them optional, or move to `declare global`.
  Additionally, consumers who also install `@types/web-bluetooth` / `@types/w3c-web-serial` get
  duplicate-identifier conflicts.
  *Fix:* consume those `@types` packages as devDependencies and delete the hand-rolled file.

- [ ] **`DEFAULT_BLE_OPTIONS` leaks preset metadata.**
  `{ ...BLE_PRESETS.nordic_uart }` copies `name` and `description`, which are not in
  `BLEConnectionOptions`. Excess-property checks don't catch spreads, so these phantom keys
  ship in the public constant. *Fix:* pick the three UUID fields explicitly.

- [ ] **`isSupported()` throws in non-browser environments.**
  `'serial' in navigator` throws in Node/SSR/worker contexts where `navigator` is undefined.
  *Fix:* `typeof navigator !== 'undefined' && 'serial' in navigator` (same for `bluetooth`).

- [ ] **`SerialConnection.connect()` can't use port filters or pre-authorized ports.**
  `requestPort()` is called with no arguments, so consumers cannot narrow the picker by
  VID/PID or reuse a granted port from `getPorts()`. *Fix:* accept
  `SerialPortRequestOptions` (and/or a `SerialPort`) in options.

- [ ] **`BLEConnection.connect()` hardcodes the picker filter.**
  `filters: [{ services: [serviceUUID] }]` hides any device that doesn't advertise that UUID.
  *Fix:* allow `acceptAllDevices` / custom filters via options.

- [ ] **`catch { /* swallow listener errors */ }` in all four emitters** (`device-connection.ts`).
  Hides consumer bugs with zero signal. *Fix:* `console.error`, or an optional
  `onListenerError` hook.

- [ ] **`catch (err: any)` in both `connect()`/`disconnect()` implementations.**
  Use `unknown` + narrowing. Published code; `any` is avoidable.

- [ ] **Retraction from earlier review:** deleting `setOptions` / `getOptions` / `sendString` /
  `removeAllListeners` / `appendLineEnding` / `ConnectionOptions` was wrong for a library.
  The public API is the product. Keep them.

---

## 🟡 Demo app (`src/App.tsx`)

Real but bounded to the demo. Fix opportunistically.

- [ ] **`setupConnection` never disconnects the previous connection.**
  Only unsubscribes. On a mid-session error the serial port stays open with the reader lock held;
  pressing Connect again leaks a port. *Fix:* await `disconnect()` before swapping connections.

- [ ] **`handleSend` clears input on failure.**
  `setInputValue('')` runs even when `send`/`hexToBytes` threw — typed command lost.
  *Fix:* clear only on success.

- [ ] **IME composition sends prematurely.**
  `handleKeyDown` doesn't check `e.nativeEvent.isComposing`, so Enter during CJK composition
  fires a send.

- [ ] **Per-packet `setLines` → render storm.**
  One state update per received chunk; at 115200 baud that's hundreds of renders/s, each mapping
  up to 2000 rows with no virtualization. Every row also re-runs `renderLineContent` each render.
  *Fix:* buffer + rAF/throttled flush, memoized rows, virtualize.

- [ ] **`bleConfig` initial state hand-duplicates the preset** instead of using `DEFAULT_BLE_OPTIONS`.

- [ ] **`generateId` uses `Math.random().toString(36)`** → `crypto.randomUUID()`.

---

## 🔵 Housekeeping

- [ ] `src/hooks/` is empty — delete.
- [ ] `index.html` loads a Font Awesome CDN stylesheet but no `fa-*` icon is used. Dead weight
  plus a third-party supply-chain surface — delete.
- [ ] `index.html` light/dark iframe theme script and inline theme CSS are dead; the app is
  hardcoded dark. Delete. Also Chinese comments in an otherwise English repo — pick one language.
- [ ] `vite.config.js` sets `host: "0.0.0.0"`, exposing the dev server on the LAN. Drop or opt-in.
- [ ] `build` script skips typecheck → `tsc --noEmit && vite build`.
- [ ] `tsconfig.json`: add `noUnusedLocals`, `noUnusedParameters`.
- [ ] `src/main.tsx` renders without `StrictMode`.
- [ ] No CI.

---

## Suggested fix order

1. `hexToBytes` correction + vitest coverage (silent data corruption)
2. BLE MTU chunking + buffer copy (broken for real payloads)
3. Packaging: `exports` map, lib build, dependency split, README
4. `d.ts` strategy + `DEFAULT_BLE_OPTIONS` field pick
5. Demo app fixes
6. Housekeeping
