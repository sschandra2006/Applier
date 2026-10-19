/**
 * Security Hardening Module Entrypoint
 * Applier 2.0 — Phase 23
 */

export {
  SSRFGuard,
  SSRFViolationError
} from './ssrf-guard.js';

export {
  FileSecurityService,
  FileSecurityError,
  defaultFileSecurityService,
  BLOCKED_EXTENSIONS,
  ALLOWED_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE
} from './file-security.service.js';

export {
  DocumentEncryptionService,
  DocumentEncryptionError,
  defaultDocumentEncryptionService
} from './document-encryption.service.js';

export {
  SecretIsolationService,
  SecretExposureError,
  defaultSecretIsolationService
} from './secret-isolation.service.js';

export {
  JobAuthorizationService,
  UnauthorizedAccessError,
  defaultJobAuthorizationService
} from './job-authorization.service.js';

export {
  SubmissionTokenGuardService,
  SubmissionTokenError,
  defaultSubmissionTokenGuardService
} from './submission-token-guard.service.js';

export {
  SecurityAuditService,
  defaultSecurityAuditService
} from './security-audit.service.js';

export {
  BrowserIsolationService,
  BrowserIsolationError,
  defaultBrowserIsolationService,
  DEFAULT_BROWSER_SECURITY_CONFIG
} from './browser-isolation.service.js';
