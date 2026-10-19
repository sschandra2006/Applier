# Security & Privacy Specification — Applier 3.0

This document outlines the security architecture, threat model, cryptographic controls, and privacy commitments for the Applier 3.0 platform.

---

## 1. Threat Model & Boundaries

Applier operates across two distinct security zones:
1. **Untrusted Client Domain:** Third-party employer job portals (Greenhouse, Lever, Workday) and user web tabs. Any HTML, form label, or hidden input from these sites is treated as potentially hostile and untrusted.
2. **Trusted Service Domain:** The Node.js backend, MongoDB database, encrypted Vault on disk, and internal Python AI microservice.

---

## 2. Authentication & Multi-Tenant Isolation

* **JWT Verification:** All API requests must present a signed JSON Web Token via the `Authorization: Bearer <TOKEN>` header.
* **Document Isolation:** Every MongoDB query and file retrieval binds strictly to `{ userId, sessionId }`. Accessing a resume belonging to another user ID returns an immediate `HTTP 404/403` Access Denied error.
* **Random 128-Bit Identifiers:** All session IDs (`mis_<timestamp>_<hex>`) and document IDs use high-entropy pseudorandom values, preventing ID enumeration attacks.

---

## 3. Cryptography & At-Rest Encryption

* **Algorithm:** **AES-256-GCM** (Galois/Counter Mode).
* **Key Derivation:** SHA-256 digest of the master `DOCUMENT_ENCRYPTION_KEY`.
* **Initialization Vector (IV):** Unique 96-bit cryptographically secure pseudorandom IV (`crypto.randomBytes(12)`) per document.
* **Authentication Tag:** 128-bit authentication tag ensuring ciphertext integrity. Any file tampering causes decryption to fail with a cryptographic integrity error.
* **Storage Packaging:** Packaged binary format:
  `[12 bytes IV] + [16 bytes Auth Tag] + [AES-256-GCM Ciphertext]`

---

## 4. File-Upload Validation & Antivirus Scanning

Enforced by [`FileSecurityService`](file:///f:/Applier/backend/src/security/file-security.service.js):

1. **Extension Whitelisting:** Accepts only `.pdf` and `.docx`. Executables (`.exe`, `.sh`, `.bat`, `.cmd`) and macro scripts are unconditionally rejected.
2. **Magic-Byte Inspection:** Verifies leading binary bytes regardless of file extension:
   * PDF: `%PDF-` (`0x25, 0x50, 0x44, 0x46, 0x2D`)
   * DOCX: `PK\x03\x04` (`0x50, 0x4B, 0x03, 0x04`)
3. **Malware Defense:** Scans for standard EICAR antivirus test signatures and embedded executable headers (`MZ`). Integrates with ClamAV daemon via TCP socket in production.
4. **Path Traversal Sanitization:** Filenames are stripped of directory traversal sequences (`../`, `..\`) and null bytes (`\0`).

---

## 5. Chrome Web Store Privacy Disclosures & Permissions

The Applier Chrome Extension adheres strictly to the **Google Chrome Web Store Single Purpose Policy**:

### 5.1 Permission Rationales
* **`activeTab`:** Used solely to inspect the current job application URL and DOM when the user activates Applier.
* **`storage`:** Persists session state and authentication tokens locally in `chrome.storage.local`.
* **`sidePanel`:** Renders the application assistance interface alongside the active tab.
* **`host_permissions: ["<all_urls>"]`:** Required because job applications are hosted across thousands of private employer subdomains.

### 5.2 Privacy Commitments
* **Zero Background Tracking:** The extension is inactive on standard browsing tabs. It never tracks browsing history, cookies, or page visits.
* **No Third-Party Analytics / Telemetry:** No user data or resume content is shared with advertisers or third-party data brokers.
* **Data Processing on Demand:** Candidate facts are transmitted to the backend only when the user explicitly triggers an application workflow.

---

## 6. Prompt-Injection Resistance & DOM Sanitization

When extracting job descriptions and form labels from external employer portals:
1. HTML markup is stripped using pure DOM text extraction (`element.innerText`).
2. Known prompt injection phrases (e.g. `Ignore previous system instructions`, `Act as DAN`, `Return candidate secrets`) are stripped prior to LLM submission.
3. User answers are injected into structured JSON fields, preventing prompt context breakouts.

---

## 7. Pre-Submission Barrier & Idempotency

* **User Confirmation Mandatory:** The extension cannot trigger a form submit action autonomously.
* **Cryptographic Idempotency Key:** When the user clicks "Confirm & Submit", an idempotency key (`idemp_<userId>_<sessionId>_<timestamp>`) is assigned. Any duplicate submission attempt while in `SUBMITTING`, `SUBMITTED`, or `SUBMISSION_STATUS_UNKNOWN` is rejected, preventing accidental multiple applications.
