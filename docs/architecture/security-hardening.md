# Applier 2.0 — Phase 23: Security Hardening Architecture

## 1. Executive Summary

Phase 23 establishes end-to-end security hardening across Applier 2.0. Because Applier automates arbitrary third-party web portals and handles highly sensitive applicant identity records and supporting documents, zero-trust security controls are enforced across all boundaries:
1. **Network Layer:** Strict SSRF protection, IP blocking (RFC 1918, loopbacks, cloud metadata IMDS), and administrative/DB port blocking.
2. **Browser Execution Layer:** Isolated contexts with minimal OS privileges, disabled permissions (camera, microphone, geolocation), and deterministic timeouts.
3. **Document & File Layer:** Path traversal sanitization, strict MIME & magic-byte verification, file size enforcement (10MB default), malware scanning integration points (EICAR standard signature & script injection detection), and sandboxed temp directories.
4. **Storage & Data Protection:** Authenticated AES-256-GCM encryption at rest with tamper detection and per-record IVs.
5. **Secret Isolation:** Deep sanitization and redaction of database credentials, LLM keys, worker secrets, and internal endpoints from logs, errors, and frontend API responses.
6. **Authorization & Multi-Tenancy:** User-scoped job ownership and cross-user document access barriers (403 Forbidden).
7. **Action Confirmation Tokens:** HMAC-SHA256 signed, expiring, one-time submission confirmation tokens preventing replay attacks and form mutation tampering.
8. **Security Audit Logging:** Canonical `SecurityAuditEvent` schema (`security-audit-event.json` `v2.0.0`) tracking all security-relevant occurrences.

---

## 2. Threat Model & Defense Architecture

```mermaid
flowchart TD
    User([User / Attacker]) -->|1. Submit Target URL| SSRF[SSRF Guard]
    SSRF -->|Block RFC1918 / IMDS / Localhost| BlockSSRF[400 SSRFViolationError]
    SSRF -->|Valid Public URL| Browser[Browser Isolation Service]
    
    User -->|2. Upload Document| FileSec[File Security Service]
    FileSec -->|Path Traversal / Bad Ext / Spoofed MIME / Malware| RejectUpload[400 / 422 FileSecurityError]
    FileSec -->|Valid File| Encrypt[Document Encryption AES-256-GCM]
    Encrypt --> GridFS[(Encrypted Storage)]

    User -->|3. API Request / Job Control| Auth[Job Authorization Service]
    Auth -->|Cross-User Access Check| RejectAuth[403 UnauthorizedAccessError]
    Auth -->|Authorized| Automation[Automation Engine]

    Automation -->|4. Final Submission| TokenGuard[Submission Token Guard]
    TokenGuard -->|HMAC Verify / Replay Check / Form Hash| Submit[Browser Worker Submit]
    TokenGuard -->|Expired / Replayed / Mutated| RejectToken[403 TokenValidationError]

    SecurityAudit[(Security Audit Logger)] --- SSRF
    SecurityAudit --- FileSec
    SecurityAudit --- Auth
    SecurityAudit --- TokenGuard
```

---

## 3. Subsystem Breakdown

### 3.1. SSRF Protection (`backend/src/security/ssrf-guard.js`)
Arbitrary URL automation must never probe internal microservices, cloud metadata endpoints, or local databases.
- **Protocol Enforcement:** Only `http:` and `https:` are permitted. Protocols like `file:`, `gopher:`, `ftp:`, `data:`, `javascript:` are strictly blocked.
- **Cloud Metadata Protection:** Explicit blocking of AWS/GCP/Azure link-local metadata endpoints (`169.254.169.254`, `metadata.google.internal`).
- **Private & Reserved IP Ranges:**
  - IPv4 loopback (`127.0.0.0/8`, `localhost`)
  - RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  - Carrier-grade NAT (`100.64.0.0/10`)
  - IPv6 loopback (`::1`), link-local (`fe80::/10`), unique local (`fc00::/7`)
- **Port Blacklisting:** Non-standard ports commonly associated with internal services are rejected (e.g., MongoDB `27017`, Redis `6379`, Postgres `5432`, MySQL `3306`, Docker `2375`, Elastic `9200`).
- **Obfuscation Defense:** Decimal (`http://2130706433/`) and hex IP address representations are resolved and evaluated against private CIDR blocks.

### 3.2. Browser Isolation (`backend/src/security/browser-isolation.service.js`)
- **Permission Deprivation:** Incognito browser contexts are instantiated with explicit rejection of geolocation, notifications, camera, microphone, and clipboard permissions.
- **Deterministic Timeouts:** Standardized 30,000ms navigation timeouts and 10,000ms per-action timeouts prevent worker stalling and denial-of-service.
- **Pre-Navigation Verification:** `assertSafeNavigation(url)` verifies target URLs via the SSRF Guard before Playwright initiates network requests.

### 3.3. File Security & Malware Scanning (`backend/src/security/file-security.service.js`)
- **Path Traversal Protection:** Filenames are stripped of directory traversal sequences (`../`, `..\`) and null bytes (`%00`, `\0`), preserving only safe base filenames.
- **Strict File Type Whitelist:** Only expected document and image formats are allowed (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.docx`, `.doc`, `.txt`). Executable and script extensions (`.exe`, `.bat`, `.cmd`, `.sh`, `.js`, `.vbs`, `.py`, `.dll`, `.so`) are immediately rejected.
- **Magic Byte Verification:** File payloads are verified against binary signatures to defeat MIME-spoofing (e.g. ensuring a `.pdf` file header begins with `%PDF-`).
- **Malware Scanning Integration Point:** Integrates signature detection against the EICAR test string (`EICAR-STANDARD-ANTIVIRUS-TEST-FILE!`) and embedded `<script>` tags, ready to route to external anti-malware daemons (e.g., ClamAV).
- **Sandboxed Workspaces:** Manages temporary directories in isolated scratch spaces with guaranteed automated lifecycle cleanup.

### 3.4. Document Encryption at Rest (`backend/src/security/document-encryption.service.js`)
- **Algorithm:** AES-256-GCM authenticated symmetric encryption.
- **Integrity Guarantee:** Uses a 96-bit (12-byte) initialization vector per encryption and a 128-bit (16-byte) authentication tag to detect any payload corruption or tampering.
- **Zero Raw Secrets:** Encryption keys are injected via `APP_DOCUMENT_ENCRYPTION_KEY` or derived securely from the system secret.

### 3.5. Secret Isolation & Redaction (`backend/src/security/secret-isolation.service.js`)
- **Key Redaction:** Any object key matching sensitive patterns (`password`, `secret`, `token`, `apiKey`, `auth`, `creditCard`, `cvv`, `ssn`) is replaced with `[REDACTED]`.
- **URI Sanitization:** MongoDB and external database connection strings containing embedded credentials (e.g., `mongodb://user:pass@host:port/db`) are automatically masked to `mongodb://user:***@host:port/db`.
- **Express Middleware:** `stripSecretsMiddleware` intercepts outgoing JSON responses and strips secrets before network transmission to the frontend or browser.

### 3.6. Job Authorization & Multi-Tenancy (`backend/src/security/job-authorization.service.js`)
- **Ownership Verification:** Every action on an `AutomationJob` verifies that the requesting user's `userId` matches `job.userId`.
- **Cross-User Document Protection:** Access to documents (`GET /api/documents/:id`, `DELETE /api/documents/:id`) enforces ownership checks, returning HTTP 403 `Forbidden` on unauthorized requests.
- **Role Elevation:** Admin roles (`role: "admin"`) are explicitly permitted to review and recover jobs across users for operational debugging.

### 3.7. Submission Confirmation Tokens (`backend/src/security/submission-token-guard.service.js`)
- **Token Cryptography:** Generates HMAC-SHA256 tokens binding `jobId`, `userId`, a canonical hash of form field values, and an expiration timestamp (default TTL 10 minutes).
- **Replay Attack Defense:** When a token is verified, its ID is atomically recorded in a consumed-token cache. Second attempts to submit the same token are rejected with `TOKEN_ALREADY_USED`.
- **Form Mutation Detection:** The confirmation token includes a hash of the form field payload. If form values are altered between confirmation and final submission, the token is rejected with `FORM_PAYLOAD_MUTATED`.

### 3.8. Canonical Security Audit Event (`shared/schemas/security-audit-event.json`)
- Conforms to Applier Canonical Schema `security-audit-event.json` (`v2.0.0`).
- Fields: `eventId`, `schemaVersion`, `timestamp`, `eventType`, `threatLevel` (`INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), `userId`, `jobId`, `targetUrl`, `sourceIp`, `details`, and `actionTaken` (`ALLOWED`, `BLOCKED`, `FLAGGED`, `REDACTED`).

---

## 4. Verification & Attack Vector Test Coverage

All required security vectors are tested and verified in `backend/tests/security-hardening.test.js`:

| Attack Vector | Test Case | Expected Outcome |
| :--- | :--- | :--- |
| **SSRF** | Loopback IP (`127.0.0.1`, `localhost`) | Blocked with `SSRFViolationError` |
| **SSRF** | Private RFC 1918 ranges (`10.0.0.1`, `192.168.1.1`) | Blocked with `SSRFViolationError` |
| **SSRF** | Cloud metadata IMDS (`169.254.169.254`, `metadata.google.internal`) | Blocked with `SSRFViolationError` |
| **SSRF** | Non-HTTP schemes (`file://`, `ftp://`, `gopher://`) | Blocked with `SSRFViolationError` |
| **SSRF** | Obfuscated numeric/hex IP addresses (`2130706433`) | Blocked with `SSRFViolationError` |
| **Path Traversal** | `../../etc/passwd` or `..\..\boot.ini` | Sanitized to safe base filename |
| **Null Byte Injection** | `invoice.pdf\0.exe` | Sanitized; null bytes stripped |
| **Unauthorized Job Access** | User B attempts to access User A's job | Rejected with 403 `UnauthorizedAccessError` |
| **Cross-User Document Access** | User B attempts to fetch User A's document | Rejected with 403 `UnauthorizedAccessError` |
| **Malicious Upload** | Executable/script extensions (`.exe`, `.sh`, `.bat`) | Rejected with 400 `FileSecurityError` |
| **MIME Spoofing** | `.pdf` file with invalid magic bytes | Rejected with `FILE_MIME_MISMATCH` |
| **Malware / Exploit** | File containing EICAR signature or `<script>` tags | Rejected with `MALWARE_DETECTED` |
| **Oversized Upload** | File exceeding 10MB limit | Rejected with `FILE_TOO_LARGE` |
| **Expired Token** | Submission token used after expiration TTL | Rejected with `TOKEN_EXPIRED` |
| **Token Replay Attack** | Submission token used more than once | Rejected with `TOKEN_ALREADY_USED` |
| **Form Mutation** | Form data altered after confirmation token issue | Rejected with `FORM_PAYLOAD_MUTATED` |
| **Payload Tampering** | AES-256-GCM ciphertext modified | Decryption throws `DocumentEncryptionError` |
