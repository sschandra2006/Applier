# Chrome Extension Build & Architecture Guide — Applier 3.0

Applier 3.0 is built exclusively using the **Chrome Extension Manifest V3** standard, utilizing modern service workers, side panels, and isolated content scripts.

---

## 1. Directory Structure

```
extension/
├── manifest.json              # Extension Manifest V3 declaration
├── package.json               # Build scripts & esbuild devDependency
├── icons/                     # Standard extension icons (16, 32, 48, 128px)
└── src/
    ├── background/
    │   ├── index.js           # Background service worker entrypoint
    │   ├── session-manager.js # Tab session state sync & message router
    │   └── api-client.js      # Authenticated REST client communicating with backend
    ├── content/
    │   ├── index.js           # Content Script coordinator entrypoint
    │   ├── content.bundle.js  # Bundled standalone content script (compiled via esbuild)
    │   ├── page-analyzer.js   # ATS portal fingerprinting (Greenhouse, Lever, etc.)
    │   ├── jd-extractor.js    # Job title, company, and JD DOM extractor
    │   ├── form-detector.js   # Form input, select, textarea, file input locator
    │   ├── field-mapper.js    # Deterministic & fuzzy profile attribute matching
    │   ├── form-filler.js     # Native DOM value setter & synthetic event dispatcher
    │   ├── file-attacher.js   # DataTransfer base64 PDF injection into file inputs
    │   └── dynamic-observer.js# MutationObserver detecting dynamic multi-step form changes
    ├── sidepanel/
    │   ├── sidepanel.html     # Dedicated side panel UI layout
    │   ├── sidepanel.css      # Design system styles
    │   └── sidepanel.js       # Interactive UI logic, gap questions, review screen
    ├── popup/
    │   ├── popup.html         # Quick-status extension popup
    │   ├── popup.css          # Popup styling
    │   └── popup.js           # Quick action router (opens side panel)
    └── utils/
        ├── constants.js       # Action enums & API configuration
        └── storage.js         # chrome.storage.local wrapper
```

---

## 2. Content Script Modules & Responsibilities

Because Chrome content scripts cannot use native ES module imports in all environments, all modules under `src/content/` are bundled into `src/content/content.bundle.js` using `esbuild`.

| Module | Responsibility |
| :--- | :--- |
| **`PageAnalyzer`** | Inspects URLs, meta tags, and DOM markers to identify if the current tab is a supported job application page and determines the ATS platform (`GREENHOUSE`, `LEVER`, `WORKDAY`, `ASHBY`, `TALEO`, `BAMBOOHR`, `GENERIC`). |
| **`JdExtractor`** | Scrapes job title, company name, location, and the full job description text with HTML tag stripping and whitespace normalization. |
| **`FormDetector`** | Discovers all interactive form fields, detects required status, parses `<label>` elements, `aria-label`, placeholders, and inspects dropdown `<option>` choices. |
| **`FieldMapper`** | Maps detected inputs to candidate profile properties (`fullName`, `email`, `phone`, `linkedin`, `github`, `experience`, `education`) and gap answers. Produces a confidence score. |
| **`FormFiller`** | Dispatches native `input`, `change`, and `blur` events with React/Angular/Vue internal value-tracker synchronization to ensure frameworks register typed values. |
| **`FileAttacher`** | Converts base64 PDF data into a native `File` object and injects it into `<input type="file">` elements using the browser `DataTransfer` API. |
| **`DynamicObserver`** | Monitors DOM mutations; when a multi-step form transitions to the next page or reveals additional fields, notifies the Side Panel to re-scan. |

---

## 3. Extension Permissions Breakdown

Declared in [`manifest.json`](file:///f:/Applier/extension/manifest.json):

```json
"permissions": [
  "activeTab",
  "storage",
  "sidePanel",
  "scripting"
],
"host_permissions": [
  "http://localhost:5000/*",
  "http://127.0.0.1:5000/*",
  "*://*.greenhouse.io/*",
  "*://*.lever.co/*",
  "*://*.myworkdayjobs.com/*",
  "*://*.ashbyhq.com/*",
  "*://*.taleo.net/*",
  "*://*.bamboohr.com/*",
  "<all_urls>"
]
```

### Permission Justifications:
* **`activeTab`:** Enables reading the URL and DOM of the job application page currently focused by the user.
* **`storage`:** Persists candidate authentication tokens, active session IDs, and user preferences locally in `chrome.storage.local`.
* **`sidePanel`:** Powers the dedicated side panel UI where the user answers gap questions and reviews the tailored resume.
* **`scripting`:** Used to inject and execute content scripts safely inside the active application tab.
* **`<all_urls>` (Host Permissions):** Required because employer job portals are hosted across thousands of independent company domains (e.g. `careers.airbnb.com`, `jobs.netflix.com`). Operation is strictly user-initiated; the extension does not run in the background on arbitrary browsing tabs.

---

## 4. Build & Compilation Instructions

To compile the content scripts into the distributable `content.bundle.js`:

```bash
cd extension
npm run build
```

Under the hood, this executes:
```bash
esbuild src/content/index.js --bundle --outfile=src/content/content.bundle.js --format=iife
```

### Development Watch Mode
For live development with auto-recompilation on save:
```bash
npm run watch
```

---

## 5. Chrome Web Store Packaging

To prepare a production release package for the Chrome Web Store:

1. Ensure all tests pass:
   ```bash
   npm run build:extension
   ```
2. Archive the `extension/` folder into a `.zip` file (excluding `node_modules`):
   ```bash
   cd extension
   git archive -o ../applier-extension-v3.0.0.zip HEAD
   ```
   *Alternatively on Windows PowerShell:*
   ```powershell
   Compress-Archive -Path manifest.json, icons, src -DestinationPath applier-extension-v3.0.0.zip -Force
   ```
3. Upload `applier-extension-v3.0.0.zip` to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
