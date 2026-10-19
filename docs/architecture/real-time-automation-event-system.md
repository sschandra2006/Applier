# Applier 2.0 — Real-Time Automation Event System

## 1. Overview and Core Objectives

Prior to Phase 18, client applications relied on fixed-interval HTTP polling (e.g., querying `GET /api/v1/automation/status/:jobId` every 2000ms) to monitor browser execution progress, detect OTP/CAPTCHA checkpoints, and track completion. This polling generated unnecessary network load, introduced latency between browser events and user notifications, and risked missing brief execution state transitions.

Phase 18 introduces the **Real-Time Automation Event System**, an event-driven execution update engine adhering to the following core tenets:
- **Zero-Latency Execution Stream**: Replaces blind polling with push-based event streaming as the browser worker navigates, discovers, fills, verifies, pauses, recovers, or completes.
- **Architectural Simplicity**: Uses Server-Sent Events (SSE) over HTTP/HTTPS, avoiding extraneous bidirectional protocols (like WebSockets) where unidirectional streaming suffices.
- **Strict Event Ordering**: Guarantees strictly monotonic sequence numbering (`1, 2, 3...`) per job.
- **Native Reconnection & Replay**: Supports browser-native reconnection via `Last-Event-ID` and query parameters, backed by an in-memory ring-buffer for fast replay.
- **Consumer Deduplication**: Provides built-in client/worker deduplication by `eventId` and stale `sequenceNumber`, preventing duplicate state mutations.
- **Durable Source of Truth**: Events are strictly ephemeral notifications. MongoDB remains the authoritative source of truth. Even in total client disconnects or restarts, job state is completely reconcilable against persistent records.

---

## 2. SSE vs. WebSocket Decision

Per the specification: *"Prefer the simpler option unless bidirectional communication is genuinely required."*

| Feature | Server-Sent Events (SSE) | WebSockets (WS) | Applier 2.0 Decision |
| :--- | :--- | :--- | :--- |
| **Directionality** | Unidirectional (Server → Client) | Bidirectional (Full Duplex) | **SSE Chosen**: Execution updates flow Server → Client. Client actions (e.g. submitting OTP, CAPTCHA, manual intervention, resume) already utilize existing REST endpoints (`POST /automation/resume`). |
| **Transport & Overhead** | Standard HTTP/1.1 or HTTP/2 | Custom `ws://` / `wss://` protocol upgrade | **SSE Chosen**: Zero additional ports, passes through standard enterprise proxies/WAFs, no protocol handshake complexity. |
| **Dependencies** | Native Express 5 response streaming | Requires external packages (`ws`, `socket.io`) & stateful socket clustering | **SSE Chosen**: Zero external dependencies required. |
| **Reconnection Support** | Native browser `EventSource` with automatic backoff and `Last-Event-ID` header | Manual ping/pong, heartbeat, and reconnection logic needed | **SSE Chosen**: Browser automatically reconnects and replays missed events from the exact sequence counter. |

---

## 3. Canonical Event Types and Schema Contract

All automation events are validated against the `automation-event.json` (`v2.0.0`) canonical schema.

### Canonical Schema Definition (`shared/schemas/automation-event.json`)
```json
{
  "$id": "https://applier.ai/schemas/automation-event.json",
  "version": "2.0.0",
  "type": "object",
  "required": ["schemaVersion", "eventId", "sequenceNumber", "eventType", "jobId", "timestamp", "payload"],
  "properties": {
    "schemaVersion": { "type": "string", "const": "2.0.0" },
    "eventId": { "type": "string", "pattern": "^evt_[a-zA-Z0-9_.-]+$" },
    "sequenceNumber": { "type": "integer", "minimum": 1 },
    "eventType": {
      "type": "string",
      "enum": [
        "JOB_CREATED",
        "JOB_STARTED",
        "PAGE_CHANGED",
        "FIELD_DETECTED",
        "FIELD_MAPPED",
        "FIELD_FILLED",
        "FIELD_VERIFIED",
        "DOCUMENT_UPLOADED",
        "CHECKPOINT_REQUIRED",
        "USER_INPUT_REQUIRED",
        "RECOVERY_STARTED",
        "RECOVERY_COMPLETED",
        "SUBMISSION_STARTED",
        "SUBMISSION_VERIFIED",
        "JOB_COMPLETED",
        "JOB_FAILED"
      ]
    },
    "jobId": { "type": "string" },
    "applicationId": { "type": "string" },
    "timestamp": { "type": "string", "format": "date-time" },
    "payload": { "type": "object" }
  }
}
```

### The 16 Canonical Event Lifecycles
1. `JOB_CREATED`: Initial registration of an automation job.
2. `JOB_STARTED`: Browser session launched, verified execution engine activated.
3. `PAGE_CHANGED`: Browser navigated or progressed to a new URL/DOM context.
4. `FIELD_DETECTED`: Form field discovered during semantic page analysis.
5. `FIELD_MAPPED`: Field mapped against the applicant knowledge graph.
6. `FIELD_FILLED`: Value entered into target form element.
7. `FIELD_VERIFIED`: Element state verified deterministically post-fill.
8. `DOCUMENT_UPLOADED`: Verified file upload accepted by the website.
9. `CHECKPOINT_REQUIRED`: Execution checkpoint created or human intervention required.
10. `USER_INPUT_REQUIRED`: OTP, CAPTCHA, or clarification required from user.
11. `RECOVERY_STARTED`: Browser worker encountered error and initiated recovery tree.
12. `RECOVERY_COMPLETED`: Recovery strategy succeeded and execution resumed.
13. `SUBMISSION_STARTED`: Final form submission action initiated.
14. `SUBMISSION_VERIFIED`: Multi-signal verification confirmed successful submission and receipt captured.
15. `JOB_COMPLETED`: Complete workflow finished cleanly.
16. `JOB_FAILED`: Unrecoverable failure halted automation.

---

## 4. Server-Sent Events Engine Architecture

### Streaming Service (`AutomationEventService`)
- **Per-Job Monotonic Sequencing**: Maintains an atomic sequence counter per `jobId`. Each emitted event receives `sequenceNumber = currentSeq + 1`.
- **Ring-Buffer Storage**: Caches the last 200 events per `jobId` in memory. If a client disconnects briefly, it can catch up instantly without hitting the database.
- **Heartbeat Keep-Alive**: Emits periodic `: keep-alive\n\n` comments every 15 seconds to prevent intermediate proxy, gateway, or browser timeouts. Timers use `.unref()` to avoid blocking clean process shutdowns.
- **Express Route & Auth**:
  - Routes: `GET /api/v1/automation/events/:jobId` and `GET /api/v1/automation/:jobId/events`.
  - Authentication: Validates JWT via `Authorization: Bearer <token>` header or `?token=<token>` query param (enabling native browser `new EventSource(url)`).
  - Headers:
    - `Content-Type: text/event-stream`
    - `Cache-Control: no-cache, no-transform`
    - `Connection: keep-alive`
    - `X-Accel-Buffering: no` (disables Nginx reverse proxy response buffering)

---

## 5. Client Deduplication & Reconnection Protocol

### Reconnection Protocol
When an `EventSource` reconnects after a network interruption:
1. Browser automatically transmits the `Last-Event-ID` header containing the ID of the last received event.
2. Server extracts `lastEventId` from the header (or `?lastEventId` query param) and locates the event's sequence number.
3. Server streams all buffered events with `sequenceNumber > lastProcessedSequence` in order before piping live updates.

### Deduplication Engine (`AutomationEventDeduplicator`)
Consumers (frontend dashboard or background workers) employ `AutomationEventDeduplicator`:
- **ID Tracking**: Checks incoming `eventId` against a fixed-window cache of seen event IDs.
- **Sequence Verification**: Drops any event with `sequenceNumber <= lastProcessedSequence`.
- **Gap Detection**: If `sequenceNumber > lastProcessedSequence + 1`, a sequence gap is detected (`hasGap: true`), prompting the client to reconcile durable state against MongoDB.

---

## 6. Durable Source of Truth & Reconciliation Guarantees

> [!IMPORTANT]
> **Events are notifications; MongoDB remains the durable source of truth.**
> Applications must never rely exclusively on in-memory SSE streams for critical state.

1. **Initial Mount Sync**: When a client attaches to a running job, it executes `fetchAutomationStatusApi(jobId)` against MongoDB to hydrate baseline state.
2. **Buffer Overflow Recovery**: If a client is offline longer than the 200-event ring-buffer capacity, it receives a gap warning and falls back to MongoDB `AutomationJob` and `ExecutionCheckpoint` records.
3. **Job Restart Reconciliation**: On worker or server restart, `AutomationJob.findById(jobId)` restores the durable state, updates status to `RUNNING`, and resumes emitting events sequentially.

---

## 7. Verification and Test Matrix

The event system is verified by a dedicated test suite (`backend/tests/real-time-events.test.js`) and contract tests (`backend/tests/contract.test.js`):

| Test Case | Scenario Verified |
| :--- | :--- |
| **1. Connection** | Establishes SSE stream with correct headers (`text/event-stream`, `keep-alive`, `no-cache`), receives live events with correct formatting (`id`, `event`, `data`). |
| **2. Reconnection** | Client reconnects specifying `Last-Event-ID`, accurately replays only missed events in monotonic order. |
| **3. Event Ordering** | Emits high-concurrency event stream across 16 canonical types; verifies strict monotonic sequence ordering (`1..N`). |
| **4. Duplicate Event** | Injects duplicate event IDs and stale sequence numbers; deduplicator drops duplicates without mutating state. |
| **5. Missed Event** | Simulates missing sequence packet; deduplicator detects gap and triggers durable reconciliation. |
| **6. Job Restart** | Reconciles restarted job with durable MongoDB store, resetting and continuing clean sequential event delivery. |
| **7. Contract Schema** | Validates `automation-event` JSON schema across all 16 canonical types with 53 contract tests passing. |
