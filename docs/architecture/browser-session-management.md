# Applier 2.0 — Phase 3: Browser Session & Context Management Architecture

## 1. Overview & Objective

Phase 3 establishes **BrowserSession** as a first-class, stateful orchestration object within the distributed browser-worker layer (`browser-worker/browser/`).

Before this phase, browser interactions operated ephemerally directly inside execution functions, creating risks of untracked tabs, leaking Chromium OS processes on crashes or cancellations, and an inability to reliably capture or resume execution state.

Phase 3 introduces a modular, 7-manager subsystem that strictly enforces:
1. **First-Class Session Identity**: Stateful lifecycle management (`INITIALIZING` → `ACTIVE` → `PAUSED` → `CHECKPOINTED` → `CLOSED` / `FAILED` / `TIMED_OUT` / `CANCELLED` / `CRASHED`).
2. **Strict Separation of Concerns**: Live Playwright objects (`Browser`, `BrowserContext`, `Page`, `Frame`) are held strictly in transient memory. Only JSON-serializable state is persisted or transmitted.
3. **Multi-Window & Nested Iframe Traversal**: Automated popup and new tab detection with opener tracking, and hierarchical frame navigation along serializable `framePath` coordinates.
4. **Resumable State Checkpoints**: Capture of storage state (cookies, localStorage), URL, workflow/execution step counters, and resume capability into brand new isolated browser instances.
5. **Leak-Free Process Teardown**: Guaranteed OS process termination across all 5 terminal states (`SUCCESS`, `FAILURE`, `TIMEOUT`, `CANCEL`, `WORKER_CRASH`) with zero orphaned Chromium processes.

---

## 2. Directory Structure

```
browser-worker/browser/
├── browser-manager.js     # Manages Chromium processes, tracks OS PIDs, force kills zombies
├── context-manager.js     # Manages isolated BrowserContexts & cookie/storageState export
├── page-manager.js        # Tab tracking, popup auto-detection, opener tracking, page crashes
├── frame-manager.js       # Traverses single & nested iframes along hierarchical framePath
├── checkpoint-manager.js  # Serializes execution snapshots without Playwright references
├── cleanup-manager.js     # Enforces complete teardown across 5 terminal conditions
├── session-manager.js     # BrowserSession object & central SessionManager orchestrator
└── index.js               # Canonical barrel export
```

---

## 3. Core Architecture & Components

```mermaid
flowchart TD
    subgraph SessionLayer [Browser Session Orchestration]
        SM[SessionManager]
        BS[BrowserSession]
    end

    subgraph ManagerLayer [Component Managers]
        BM[BrowserManager<br/>Chromium PID & Lifecycle]
        CM[ContextManager<br/>Context Isolation & Storage State]
        PM[PageManager<br/>Tabs, Popups & Opener Tracking]
        FM[FrameManager<br/>Hierarchical Nested Iframes]
        CPM[CheckpointManager<br/>Serializable State Snapshots]
        CLM[CleanupManager<br/>Multi-Condition Teardown]
    end

    subgraph PlaywrightRuntime [Live Playwright Runtime (Memory Only)]
        PProc[OS Chromium Process]
        PBrowser[Playwright Browser]
        PContext[Playwright BrowserContext]
        PPage[Playwright Page]
        PFrame[Playwright Frame]
    end

    SM -->|creates & tracks| BS
    BS --> BM
    BS --> CM
    BS --> PM
    BS --> FM
    BS --> CPM
    BS --> CLM

    BM -.->|launches & monitors| PProc
    BM -.->|wraps| PBrowser
    CM -.->|wraps| PContext
    PM -.->|manages| PPage
    FM -.->|traverses| PFrame
```

### 3.1. BrowserManager (`browser-manager.js`)
- **Process PID Tracking**: Obtains OS process PIDs via `browser.process()?.pid` immediately upon launch and registers them in an active PID registry.
- **Process Termination Hooks**: Registers global process termination handlers (`SIGINT`, `SIGTERM`, `beforeExit`) to guarantee clean browser shutdown on host termination.
- **Cross-Platform Force Kill**: If `browser.close()` hangs (enforcing a 5000ms safety timeout), invokes `taskkill /F /PID <pid> /T` on Windows or `process.kill(pid, 'SIGKILL')` on Linux/POSIX.

### 3.2. ContextManager (`context-manager.js`)
- **Isolation**: Each browser context is provisioned with hardened defaults (`bypassCSP: true`, `acceptDownloads: true`, `ignoreHTTPSErrors: true`, standard viewport & user agent).
- **State Serialization**: Provides `exportStorageState(contextId)` to export cookies and origins (localStorage) without needing live browser handles.
- **State Rehydration**: Accepts exported storage state when spawning resumed contexts.

### 3.3. PageManager (`page-manager.js`)
- **Multi-Tab Tracking**: Automatically registers tabs created explicitly via `createPage()` or triggered via popup links / scripts.
- **Popup & Opener Detection**: Binds to `context.on('page')` while guarding against duplicate registrations during explicit `newPage()` calls. Captures `opener()` to establish parent-child tab relationships.
- **Crash Isolation**: Listens to `page.on('crash')`. Transitions individual page status to `CRASHED` and emits notification without crashing the host worker process.
- **Download & Navigation Tracking**: Monitors `framenavigated` for main frame URL updates and `download` events for secure local capture.

### 3.4. FrameManager (`frame-manager.js`)
- **Hierarchical Traversal**: Resolves target frames using a serializable path array (e.g. `['#outerIframe', '#innerIframe']` or `'root'`).
- **3-Tier Frame Resolution**:
  1. Searches frame name or URL substring matches across `page.frames()`.
  2. Resolves frame element by CSS selector within the current frame and accesses `frameElement.contentFrame()`.
  3. Traverses `currentFrame.childFrames()` inspecting `getAttribute('id')` and `getAttribute('name')`.
- **Safe Interactions**: Provides `safeFill()`, `safeClick()`, and `safeEvaluate()` wrapped in frame resolution logic.

### 3.5. CheckpointManager (`checkpoint-manager.js`)
- **Strictly Serializable Snapshots**: Captures a snapshot containing:
  - `checkpointVersion`: `"2.0.0"`
  - `sessionId`: Session UUID
  - `url`: Current active URL
  - `pageId`: Active page identifier
  - `workflowStep`: Current integer workflow step
  - `executionStep`: Current integer execution step
  - `framePath`: Serializable frame coordinates
  - `storageState`: Serializable cookies and local storage items
  - `checkpointState`: Domain-specific key-value state (form fields filled, OTP checkpoint status)
- **Zero Playwright Objects Persisted**: Never persists `Browser`, `Page`, or `ElementHandle` instances.
- **Resumption**: Rehydrates a new session at the saved URL and restores form fields and storage state.

### 3.6. CleanupManager (`cleanup-manager.js`)
- **Guaranteed Multi-Condition Teardown**: Enforces uniform, leak-free teardown across 5 terminal reasons:
  - `SUCCESS` → session transitions to `CLOSED`
  - `FAILURE` → session transitions to `FAILED`
  - `TIMEOUT` → session transitions to `TIMED_OUT`
  - `CANCEL` → session transitions to `CANCELLED`
  - `WORKER_CRASH` → session transitions to `CRASHED`
- **Ordered Cascading Close**: Closes all child pages → closes context → closes browser → verifies 0 lingering OS PIDs.

---

## 4. Serializable State Contract

When `session.toSerializableState()` or `session.toJSON()` is invoked, the resulting payload is strictly JSON-compatible:

```json
{
  "sessionId": "sess_89f074a1-0e12-4217-9150-fb9741e24747",
  "jobId": "job_application_67890",
  "browserId": "br_a859c264-b0a1-4ce8-be76-4dc5ca0217df",
  "contextId": "ctx_c0f7b11d-3b54-469b-8d8d-bf38b1399436",
  "activePageId": "page_1e737c17-640a-4286-90fe-09ad129fbaf1",
  "currentUrl": "https://portal.example.gov/step-2",
  "openedPages": [
    {
      "pageId": "page_1e737c17-640a-4286-90fe-09ad129fbaf1",
      "contextId": "ctx_c0f7b11d-3b54-469b-8d8d-bf38b1399436",
      "url": "https://portal.example.gov/step-2",
      "title": "Portal Application - Personal Info",
      "isPopup": false,
      "openerPageId": null,
      "status": "LOADED",
      "openedAt": "2026-10-03T11:20:00.000Z",
      "closedAt": null
    }
  ],
  "framePath": "root",
  "status": "ACTIVE",
  "createdAt": "2026-10-03T11:20:00.000Z",
  "lastActivityAt": "2026-10-03T11:20:05.120Z",
  "workflowStep": 2,
  "executionStep": 4,
  "checkpointState": {
    "applicantName": "John Doe",
    "otpVerified": true
  }
}
```

---

## 5. Verification & Test Results

### 5.1. Session Test Suite (`backend/tests/session.test.js`)
All 13 comprehensive Phase 3 tests passed:
- `Session Creation & State Model`: Verified first-class `BrowserSession` with serializable tracking and 0 Playwright leaks.
- `Multiple Pages & Tabs Management`: Verified multi-page tracking and active tab switching.
- `Popup Pages Handling`: Verified popup detection via `context.on('page')` and opener tracking.
- `Iframe & Nested Iframe Traversal`: Verified nested iframe resolution (`#outerIframe` → `#innerIframe`) and interactions (`fill`, `click`).
- `Timeout Handling`: Graceful navigation timeout handling without worker disruption.
- `Crash Handling (Page & Browser)`: Verified page crash isolation and unexpected browser disconnect detection.
- `Guaranteed Cleanup across Conditions`: Verified leak-free teardown across all 5 conditions (`SUCCESS`, `FAILURE`, `TIMEOUT`, `CANCEL`, `WORKER_CRASH`) with 0 lingering PIDs.
- `Checkpoint & Resumption`: Verified serializable checkpoint capture and complete state restoration in a new browser session.

### 5.2. Repository-Wide Verification
- **Backend Jest Suite**: 10 test suites, **67 passed, 0 failed** (54 Phase 1 & 2 tests + 13 Phase 3 session tests).
- **AI Service Pytest Suite**: **33 passed, 0 failed**.
- **Frontend Vite Build**: Successfully built production bundle in 1.04s.

---

## 6. Phase Boundary Compliance

As required by Phase 3:
- **No Semantic AI**: Did not implement Laya or semantic AI.
- **No Field Mapping Modifications**: Kept existing automation field logic untouched.
- **Stopped at Phase 3**: Phase 3 is fully verified and complete. Ready for Phase 4 instructions from the user.
