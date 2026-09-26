# Plugin system for the demo console

**Date:** 2026-09-27
**Status:** Reviewed 2026-09-27 — review fixes folded in; awaiting go-ahead before Phase 1
**Workflow:** `large-change-workflow` (phases are gated: action plan → implement → review → fix → commit)

## Goal

Let users extend the console with plugins that:

- transform **outgoing** bytes (prepend/append bytes, compute a checksum),
- transform and annotate **incoming** bytes (verify a checksum),
- provide a **command book** of frequently used commands,
- **change app settings** (e.g. force line ending to None while a framing plugin is active),
- add **one custom settings sub-menu entry** (with unlimited tabs).

Users add plugins either from a built-in catalogue by enabling them, or by entering an
**index URL** of a plugin list.

## Scope

In scope:

- Plugin runtime, hook pipeline, ordering UI, permission metadata, declarative settings UI.
- One built-in checksum plugin proving the API.
- Demo app only (`src/App.tsx`, `src/components/**`, `src/hooks/**`, new `src/plugins/**`).

Out of scope (explicit):

- Any change to `src/lib/**` (published, zero-dep, agnostic — `scripts/check-lib-agnostic.mjs` must stay green).
- Worker/sandboxed plugin execution and consent UI (deferred with remote loading to v2).
- Remote plugin loading and update checks (deferred to v2).
- Plugin marketplace browse UI, ratings, search.
- Async hooks (v1 hooks are synchronous).
- React/JSX plugin UI (declarative schema only).

## Decisions (confirmed with user)

| #   | Question                          | Decision                                                                                                                                                                                          |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Where does plugin code come from? | Built-in registry in v1. Remote index loading (JSON manifest → fetch → sha256 check → blob import) is deferred to v2.                                                                               |
| 2   | Permission enforcement?           | **Advisory** + consent screen. Dialog states plainly that code runs in page context and can exceed declared permissions.                                                                          |
| 3   | Plugin settings UI?               | **Declarative schema** (`FieldSpec[]`); app renders fields with existing settings styles.                                                                                                         |
| 4   | Engine location?                  | **Demo app only** (`src/plugins/**`). `src/lib` untouched.                                                                                                                                        |
| 5   | Hook ordering?                    | **Three ordered lists** (Send / Receive / Display) as tabs inside the Plugin settings section. A multi-hook plugin appears in each list it touches.                                               |
| 6   | Line ending vs pipeline?          | Line ending appended **before** the send pipeline (as today); framing plugins force `line-ending = none`.                                                                                         |
| 7   | Plugin setting writes?            | **Declarative managed settings** — field renders locked with a plugin badge; override auto-reverts when the plugin is disabled.                                                                   |
| 8   | Command book click?               | Entries are **hex strings**. Click **fills** the input box and switches Send to Hex; Ctrl/Cmd+click **sends immediately** as a hex payload (through the send pipeline, recorded in send history). |
| 9   | Sync hooks?                       | Yes, v1 is synchronous.                                                                                                                                                                           |
| 10  | Update checks?                    | Not in v1.                                                                                                                                                                                        |
| 11  | Worker sandbox?                   | Later. API designed to be sandbox-ready (serializable data, no functions in plugin output).                                                                                                       |
| 12  | Git commits?                      | Yes — semantic commit after each phase that passes review.                                                                                                                                        |
| 13  | Phase gating?                     | Review each phase, then **pause for user approval** before the next phase starts.                                                                                                                 |
| 14  | Display patches vs hex views      | Spans/text apply to the ASCII view only; hex/both/hexdump render the wire bytes untouched; badge/detail show in every view.                                                                       |
| 15  | Command book payload format       | Hex strings — covers non-ASCII modules over serial.                                                                                                                                               |
| 16  | Lifecycle hooks in v1?            | Yes: optional `onSessionReset`, `onDisable`. Remote plugins pin `PLUGIN_API_VERSION`, so they cannot be added later without a v2.                                                                 |
| 17  | Ordering UI control               | Keyboard up/down buttons, no drag-and-drop.                                                                                                                                                       |
| 18  | Remote index hosting              | Deferred with remote loading to v2.                                                                                                                                                |

## Permission model (advisory in v1)

| Permission        | Grants                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `send:read`       | `observeSend(bytes, ctx)` after a successful transmit                                                                 |
| `send:write`      | `send(bytes, ctx) -> bytes` in the send chain                                                                         |
| `receive:read`    | `observeReceive(bytes, ctx)` per inbound chunk                                                                        |
| `receive:write`   | `receive(bytes, ctx) -> bytes`, runs before line splitting                                                            |
| `display:read`    | `observeDisplay(row, ctx)` when a row closes                                                                          |
| `display:write`   | `display(row, ctx) -> patch` `{ text, badge, detail, severity }`                                                      |
| `display:replace` | patch may carry `spans`, replacing the row body in the ASCII view                                                     |
| `toolbar:add`     | declarative `toolbar[]` actions                                                                                       |
| `settings:read`   | `ctx.settings.get(key)` on whitelisted keys                                                                           |
| `settings:write`  | `managedSettings[]` overrides                                                                                         |
| _free_            | lifecycle hooks (`onSessionReset`, `onDisable`), command book, declarative settings section, `ctx.storage`, `ctx.log` |

## Pipeline model

Three pipes, each a user-ordered list, each running sequentially in page context.

**Send** (order: encode → pipeline → transmit):

```
input text/hex
  -> bytes = text ? encode(text + lineEnding)    // unchanged from today
                  : hexToBytes(typed hex)      // hex sends get no line ending
  -> for plugin in sendOrder:                   // plugins declared send:*
       bytes = plugin.send(bytes, ctx)          //   last returned bytes win
  -> addLine(text = typed command, data = final bytes)
  -> if bytes.length === 0: skip transmit       // e.g. managed line-ending=none + empty send
  -> transmit(bytes)
  -> for plugin in sendOrder:
       plugin.observeSend(bytes, ctx)           // final wire bytes, observe only
```

**Receive** (order: pipeline → split → rows):

```
chunk arrives (pipeline read through a ref at call time)
  -> for plugin in receiveOrder:
       bytes = plugin.receive(bytes, ctx)       // transform first
  -> existing line splitter (mode from ReceiveBreak setting)
  -> rows appended
  -> for plugin in receiveOrder:
       plugin.observeReceive(bytes, ctx)        // whole chunk as it arrived, observe only
```

**Display** (order: view build at row close, render):

```
row closes (terminated, or a send interrupts it)
  -> for plugin in displayOrder:
       patch = plugin.display(row, ctx)         // {text, badge, detail, spans}
       accumulate patch (last writer per field wins; spans replace body — ASCII view)
  -> store as row.view; ConsoleRow renders view when present
```

Display patches: `spans` and patched `text` apply to the **ASCII view only**. Badge and detail show
in every view. Hex / both / hexdump render the wire bytes untouched — the hex view must show
exactly what went on the line, as best the app can.

### Engine invariants

- **Defensive copies.** Every hook gets its own `Uint8Array` copy of the bytes. The receive
  path already detaches from the connection buffer (`new Uint8Array(data)` in `handleData`);
  the same rule applies between plugins and to stored line data — hooks can never mutate
  another plugin's buffers or the console rows.
- **Observe hooks see wire bytes.** `observeSend` sees the final transmitted bytes;
  `observeReceive` sees the chunk as it arrived, before any plugin touched it. Neither
  returns anything.

### Lifecycle

Optional, synchronous, permission-free hooks. Both are part of API version 1 — remote plugins
pin `PLUGIN_API_VERSION`, so they cannot be added later without a v2:

- `onSessionReset()` — fired from the existing `resetSession()` (reconnect, session swap).
  Stateful receive plugins (framing accumulators, partial-sentence buffers) drop partial
  state instead of corrupting the new session's first rows.
- `onDisable()` — fired when the user toggles the plugin off, mid-connection included.

Plugin failure handling:

- A **send** hook that throws aborts the send before transmit; a system row reports it.
- A **receive** hook that throws is skipped; the original bytes continue down the pipe; a system row reports it (rate-limited to one per plugin per session).
- A **display** hook that throws drops that plugin's patch only.
- A **toolbar action** or **command book send** that throws aborts the action; a system row
  reports it (same per-plugin rate limit).

Lifecycle hooks are isolated from host state transitions: a throwing `onSessionReset` is reported
without blocking connection setup, and a throwing `onDisable` is reported after the plugin is
already removed from active pipelines.

### Managed settings (two-state resolution)

`useStoredState` writes every change to localStorage, so a plugin override must **not** go
through the normal setter — the user's stored preference would be destroyed, and the
"auto-revert on disable" promise would have nothing to revert to.

- **Stored value** — untouched by plugins; keeps the user's own preference.
- **Effective value** — `override ?? stored`, resolved in memory. The three consumers read
  the effective value: App send path, Toolbar `End` select, SendSettings `Line ending`
  select (today duplicates bound to the same state).
- **Locked writes** — user writes are suppressed while a field is locked with a plugin
  badge; disabling the plugin drops the override and the effective value falls back to the
  stored one.

## Files and modules affected

### New

```
src/plugins/
  types.ts                 # public plugin contract (PLUGIN_API_VERSION = 1, lifecycle hooks included)
  pipeline.ts              # pure hook runners (send / receive / display)
  managed-settings.ts      # override resolution, last-wins, orphan detection
  app-settings.ts          # AppSettingKey union + whitelist + facade helper
  registry.ts              # built-in list and install state
  plugin-storage.ts        # namespaced JSON KV for plugin config + storage
  usePluginHost.ts         # React glue: enabled slots, commands, toolbar actions
  builtin/
    checksum/index.ts      # generic checksum/framing plugin
src/components/
  PluginSettings.tsx       # pluginSection() factory with Installed/Send/Receive/Display tabs
  PluginSettingsForm.tsx   # renders FieldSpec[] as settings fields
  CommandsMenu.tsx         # command-book dropdown, grouped by plugin; entries are hex strings (invalid hex rejected, never sent)
```

### Modified

```
src/App.tsx                # pipeline wiring, managed settings, plugin section, toolbar props
src/types.ts               # ConsoleLine gains `view?: DisplayView`
src/hooks/useConsoleLines.ts  # receive pipeline read via a ref (onData is captured once per session — enable/disable/reorder must apply mid-connection), view computation, recomputeViews(), onSessionReset fan-out
src/components/Toolbar.tsx    # plugin buttons + CommandsMenu
src/components/ConsoleRow.tsx # render view (badge/detail in every view; spans in ASCII view only) — ConsoleOutput needs no change
```

### Untouched

```
src/lib/**                 # check:lib-agnostic.mjs enforces this
```

## Phases

### Phase 1 — Core API and pure engine (no React)

Deliver `types.ts` (hook signatures incl. `onSessionReset`/`onDisable`), `pipeline.ts` (per-hook
defensive copies), `managed-settings.ts`, `app-settings.ts`, plus unit tests for the engine.
Tests must cover hook ordering, defensive copies, thrown-hook behavior, lifecycle isolation, and
managed-setting last-wins/orphan resolution.
Zero UI. Exit criterion: `bun run test` green with new engine tests; `bun run typecheck` clean;
`bun run check:lib-agnostic` stays green.

### Phase 2 — Plugin host and settings UI

Deliver `registry.ts`, `plugin-storage.ts`, `usePluginHost.ts`, `PluginSettings.tsx`,
`PluginSettingsForm.tsx`. Built-in layout parser wired, but no built-ins yet.
Persisted state: enabled ids, the three order lists, consent records, plugin config
(localStorage, `web-consoles:` prefix). Ordering uses keyboard up/down buttons.
Exit criterion: a test-only dummy plugin can be enabled/disabled/reordered from the settings section.

### Phase 3 — App wiring

`App.tsx`, `useConsoleLines.ts`, `types.ts`, `Toolbar.tsx`, `ConsoleRow.tsx`.
Exit criterion: a stub plugin observed in a browser harness transforms sent and received bytes and
patches a displayed row; enabling, disabling and reordering mid-connection takes effect without a
reconnect. The harness must also verify that observers see wire/original bytes and that a failed
send hook prevents transmission.

### Phase 4 — Built-in and docs

Checksum plugin, `docs/plugin-authoring.md`, README section. Docs note that remote loading is a v2
feature, and that appending plugins should manage `line-ending` so appended bytes land after, not
before, the terminator. Exit criterion: a configured checksum/framing plugin can take the outbound
payload, compute a checksum over the configured range, add the configured frame head and tail, and
send the resulting bytes; tests prove the exact transmitted bytes and that managed line-ending
settings do not add an extra terminator.

## Risks and dependencies

| Risk                                            | Mitigation                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin output churn defeats `ConsoleRow` memo   | Compute `view` once at row close; store on the line object; `recomputeViews()` only on plugin revision change.                                                   |
| Per-frame flush rebuilds all lines              | View computed outside the rAF flush; only the new/closed row changes identity.                                                                                   |
| Remote code is arbitrary in page context        | Remote loading is deferred to v2. V2 consent must bind to `id + version + URL + sha256`; any artifact change requires new consent.                                    |
| Managed override conflicts between plugins      | Resolution order is explicit (Send → Receive → Display, later list wins); the badge tooltip names the winning plugin; conflicts surfaced in the settings form.   |
| Hook cost on hot receive path                   | Receive transforms run before splitting; document that plugins must be O(n). Observe hooks run per chunk, not per byte.                                          |
| Enable/disable mid-connection does nothing      | `attach()` captures `onData` once per session; the pipeline is read through a ref at call time (same pattern as `rawStreamRef`/`splitRef` in `useConsoleLines`). |
| Managed override destroys the stored preference | Two-state resolution — plugins never write through `useStoredState` (see Managed settings).                                                                      |
| Command book entry has invalid hex              | Rejected at render time; the entry shows an error and never sends.                                                                                               |

## Open items

None outstanding. Phase 0 questions and the 2026-09-27 plan-review findings (lifecycle hooks,
ref-read pipeline wiring, two-state managed settings, hex send path) are resolved — see the
Decisions table and the Lifecycle / Engine invariants / Managed settings sections.

## Commit strategy

Semantic commits, one per completed phase:

- `feat(plugins): add plugin engine types and hook pipelines`
- `feat(plugins): add plugin registry, host hook and settings UI`
- `feat(console): run plugin pipelines in send, receive and display paths`
- `feat(plugins): add checksum built-in plugin`
- `docs(plugins): document plugin authoring and index format`

## Per-phase loop (from the workflow)

1. Write `phase{N}_action-plan.md` in this folder (objective, todo list, files, status).
2. Implement (direct edits for mechanical work, subagents for parallelizable chunks).
3. Review agent: flaws/security/performance + intent match.
4. Flag off-scope findings to the user via a question.
5. Fix, re-review narrowly.
6. Verify phase gates: `bun run typecheck && bun run test && bun run check:lib-agnostic` green.
7. Update action plan, commit.
8. **Pause and report — wait for approval before the next phase.**

## Next step

Awaiting approval to start Phase 1 (core API and pure engine).
