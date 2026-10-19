/**
 * Security & Reliability Comprehensive Audit Test Suite (Applier 3.0)
 *
 * Covers:
 * 1. Authentication & Authorization Boundaries
 * 2. Multi-tenant User Document Isolation
 * 3. File Upload Validation & Malware Scanning (Magic bytes, EICAR, Size limits)
 * 4. AES-256-GCM Encryption at Rest & Private Storage Access
 * 5. Corrupted File & Extraction Failure Graceful Degradation
 * 6. Idempotency & Safe Failure Handling (SUBMISSION_STATUS_UNKNOWN)
 * 7. Pre-Submission Review Barrier Enforcement
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';
import path from 'path';
import mongoose from 'mongoose';
import {
  FileSecurityService,
  BLOCKED_EXTENSIONS,
  ALLOWED_EXTENSIONS
} from '../src/security/file-security.service.js';
import { DocumentEncryptionService } from '../src/security/document-encryption.service.js';
import { JobAuthorizationService } from '../src/security/job-authorization.service.js';
import { WorkflowOrchestratorService } from '../src/workflow/workflow-orchestrator.service.js';
import { WorkflowState } from '../../shared/src/index.js';

// In-Memory Mock Profile Store
class MockProfileModel {
  static store = new Map();
  static async findOne({ userId }) {
    return MockProfileModel.store.get(String(userId)) || null;
  }
  constructor(data) {
    Object.assign(this, data);
    this._id = data._id || `prof_${Date.now()}`;
  }
  async save() {
    MockProfileModel.store.set(String(this.userId), this);
    return this;
  }
  toJSON() {
    return { ...this };
  }
}

// In-Memory Mock Session Store
class MockSessionModel {
  static store = new Map();
  static async findOne({ sessionId, userId }) {
    const s = MockSessionModel.store.get(sessionId);
    if (!s) return null;
    if (userId && String(s.userId) !== String(userId)) return null;
    return s;
  }
  constructor(data) {
    Object.assign(this, data);
    this._id = data._id || `sess_obj_${Date.now()}`;
    this.sessionId = data.sessionId || `wf_${Date.now()}`;
    this.workflowState = data.workflowState || WorkflowState.INITIALIZING;
    this.stateHistory = data.stateHistory || [];
    this.questions = data.questions || [];
    this.confirmedProfileUpdates = data.confirmedProfileUpdates || [];
    this.declinedQuestionIds = data.declinedQuestionIds || [];
    this.applicationAnswers = data.applicationAnswers || {};
  }
  transitionTo(newState, reason = '') {
    this.workflowState = newState;
    this.stateHistory.push({ state: newState, enteredAt: new Date(), reason });
    this.lastActiveAt = new Date();
  }
  async save() {
    MockSessionModel.store.set(this.sessionId, this);
    return this;
  }
}

describe('Security & Reliability Audit Suite (Applier 3.0)', () => {
  let fileSecurityService;
  let encryptionService;

  const mockMissingInfoService = {
    initializeSession: async ({ userId, jobTitle, companyName, jobDescription }) => {
      const s = new MockSessionModel({
        sessionId: `sess_${Date.now()}`,
        userId,
        jobTitle,
        companyName,
        jobDescription,
        workflowState: WorkflowState.INITIALIZING
      });
      await s.save();
      return s;
    },
    getCurrentQuestion: async () => null,
    submitAnswer: async () => ({ confirmedProfileUpdates: [] })
  };

  beforeEach(() => {
    MockProfileModel.store.clear();
    MockSessionModel.store.clear();
    fileSecurityService = new FileSecurityService({ maxFileSize: 10 * 1024 * 1024 });
    encryptionService = new DocumentEncryptionService({
      masterKeyHex: crypto.randomBytes(32).toString('hex')
    });
  });

  describe('1. Authentication, Authorization & User Document Isolation', () => {
    it('prevents User A from reading or accessing User B\'s document', () => {
      const userA = { _id: 'user_111', email: 'userA@example.com', role: 'user' };
      const userB = { _id: 'user_222', email: 'userB@example.com', role: 'user' };
      const docB = { _id: 'doc_999', userId: 'user_222', fileName: 'private_resume.pdf' };

      // User B accesses their own document -> Allowed
      expect(() => JobAuthorizationService.authorizeDocumentAccess(userB, docB)).not.toThrow();

      // User A attempts to access User B's document -> Forbidden
      expect(() => JobAuthorizationService.authorizeDocumentAccess(userA, docB)).toThrow(/Access denied/i);
    });

    it('rejects access when user context is null or unauthenticated', () => {
      const doc = { _id: 'doc_1', userId: 'user_111' };
      expect(() => JobAuthorizationService.authorizeDocumentAccess(null, doc)).toThrow();
      expect(() => JobAuthorizationService.authorizeDocumentAccess({}, doc)).toThrow();
    });

    it('isolates workflow session access strictly by userId', async () => {
      const validUserIdA = new mongoose.Types.ObjectId().toString();
      const validUserIdB = new mongoose.Types.ObjectId().toString();

      const profileA = new MockProfileModel({
        userId: validUserIdA,
        fullName: 'Alice',
        skills: [{ name: 'Go' }]
      });
      await profileA.save();

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService
      });

      const session = await orchestrator.initializeWorkflow({
        userId: validUserIdA,
        jobTitle: 'Backend Engineer',
        jobDescription: 'Go developer needed'
      });

      expect(session.userId).toBe(validUserIdA);

      // Attempting to answer a gap question with another user's session should fail if mismatched
      await expect(
        orchestrator.submitGapAnswer(session.sessionId, {
          userId: validUserIdB,
          questionId: 'q1',
          answer: 'Hacked answer'
        })
      ).rejects.toThrow();
    });
  });

  describe('2. File Upload Validation & Malware Scanning', () => {
    it('blocks dangerous executable and script file extensions unconditionally', () => {
      const blockedList = ['.exe', '.bat', '.cmd', '.sh', '.js', '.php', '.py'];
      blockedList.forEach(ext => {
        expect(BLOCKED_EXTENSIONS.has(ext)).toBe(true);
        const res = fileSecurityService.validateExtension(`malicious_file${ext}`);
        expect(res.valid).toBe(false);
        expect(res.reason).toMatch(/forbidden/i);
      });
    });

    it('allows valid document extensions', () => {
      const allowed = ['resume.pdf', 'cv.docx', 'portfolio.png', 'photo.jpg'];
      allowed.forEach(file => {
        const res = fileSecurityService.validateExtension(file);
        expect(res.valid).toBe(true);
      });
    });

    it('detects and rejects spoofed file extensions using magic byte inspection', () => {
      // Plain text disguised as a PDF
      const fakePdfBuffer = Buffer.from('Hello this is just plain text, not a PDF!');
      const check = fileSecurityService.validateMagicBytes(fakePdfBuffer, 'resume.pdf');
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/lacks valid %PDF header/i);

      // Genuine PDF header: %PDF-
      const genuinePdfBuffer = Buffer.from('%PDF-1.7\n%fake pdf content');
      const validCheck = fileSecurityService.validateMagicBytes(genuinePdfBuffer, 'resume.pdf');
      expect(validCheck.valid).toBe(true);
      expect(validCheck.detectedType).toBe('application/pdf');
    });

    it('rejects files exceeding the maximum file size limit (10MB)', () => {
      const oversized = 11 * 1024 * 1024;
      const res = fileSecurityService.validateFileSize(oversized);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/exceeds maximum allowed limit/i);

      const acceptable = 4 * 1024 * 1024;
      const resOk = fileSecurityService.validateFileSize(acceptable);
      expect(resOk.valid).toBe(true);
    });

    it('detects standard EICAR antivirus test signatures and blocks upload', async () => {
      const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      const infectedBuffer = Buffer.from(eicarString);

      const scanResult = await fileSecurityService.scanForMalware(infectedBuffer);
      expect(scanResult.isClean).toBe(false);
      expect(scanResult.threatName).toBe('EICAR-Test-Signature');
    });

    it('sanitizes directory traversal tokens and null bytes in uploaded filenames', () => {
      const dirty1 = '../../../etc/passwd';
      expect(fileSecurityService.sanitizeFilename(dirty1)).toBe('passwd');

      const dirty2 = '..\\..\\windows\\system32\\cmd.exe';
      expect(fileSecurityService.sanitizeFilename(dirty2)).toBe('cmd.exe');

      const dirty3 = 'resume\0.pdf';
      expect(fileSecurityService.sanitizeFilename(dirty3)).toBe('resume.pdf');
    });
  });

  describe('3. AES-256-GCM Encryption at Rest & Private Storage Access', () => {
    it('encrypts file buffers with AES-256-GCM and authenticates decryption', () => {
      const sensitiveData = Buffer.from('CONFIDENTIAL CANDIDATE RESUME: Alex Vance, SSN: 000-11-2222');
      const encrypted = encryptionService.encryptBuffer(sensitiveData);

      // Ciphertext must not contain plaintext
      expect(encrypted.encryptedBuffer.toString('utf8').includes('Alex Vance')).toBe(false);
      expect(encrypted.packaged).toBeDefined();

      // Decrypt
      const decrypted = encryptionService.decryptBuffer(encrypted.packaged);
      expect(decrypted.toString('utf8')).toBe(sensitiveData.toString('utf8'));
    });

    it('fails decryption if ciphertext or authentication tag is tampered with', () => {
      const sensitiveData = Buffer.from('Original verified resume text');
      const encrypted = encryptionService.encryptBuffer(sensitiveData);

      // Tamper with the packaged buffer
      const tampered = Buffer.from(encrypted.packaged);
      tampered[tampered.length - 5] ^= 0xFF; // Flip bits in ciphertext / tag

      expect(() => encryptionService.decryptBuffer(tampered)).toThrow();
    });
  });

  describe('4. Reliability, Graceful Failure & Idempotency', () => {
    it('safely handles empty or corrupted PDF buffers without crashing', async () => {
      const corruptedBuffer = Buffer.from('%PDF-1.4 [corrupted trailing stream]');
      const check = fileSecurityService.validateMagicBytes(corruptedBuffer, 'corrupted.pdf');
      expect(check.valid).toBe(true);

      const emptyBuffer = Buffer.alloc(0);
      const emptyCheck = fileSecurityService.validateMagicBytes(emptyBuffer, 'empty.pdf');
      expect(emptyCheck.valid).toBe(false);
    });

    it('enforces pre-submission barrier: rejects submission without user confirmation', async () => {
      const validUid = new mongoose.Types.ObjectId().toString();
      const profile = new MockProfileModel({ userId: validUid, fullName: 'User 1' });
      await profile.save();

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService
      });

      const session = await orchestrator.initializeWorkflow({ userId: validUid, jobTitle: 'SRE', jobDescription: 'SRE job' });

      // Attempt to confirm with userConfirmed = false
      await expect(
        orchestrator.confirmSubmission(session.sessionId, false)
      ).rejects.toThrow(/Explicit user confirmation is mandatory/i);

      // Confirm with userConfirmed = true -> Success
      const confirmed = await orchestrator.confirmSubmission(session.sessionId, true);
      expect(confirmed.workflowState).toBe(WorkflowState.SUBMITTING);
      expect(confirmed.idempotencyKey).toBeDefined();
    });

    it('blocks duplicate submissions once confirmed or submitted (Idempotency)', async () => {
      const validUid = new mongoose.Types.ObjectId().toString();
      const profile = new MockProfileModel({ userId: validUid, fullName: 'User 1' });
      await profile.save();

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService
      });

      const session = await orchestrator.initializeWorkflow({ userId: validUid, jobTitle: 'SRE', jobDescription: 'SRE job' });
      await orchestrator.confirmSubmission(session.sessionId, true);

      // Attempt second confirmation -> Blocked
      await expect(
        orchestrator.confirmSubmission(session.sessionId, true)
      ).rejects.toThrow(/already in SUBMITTING/i);
    });

    it('transitions to SUBMISSION_STATUS_UNKNOWN upon ambiguous network failure and prevents retries', async () => {
      const validUid = new mongoose.Types.ObjectId().toString();
      const profile = new MockProfileModel({ userId: validUid, fullName: 'User 1' });
      await profile.save();

      const orchestrator = new WorkflowOrchestratorService({
        profileModel: MockProfileModel,
        sessionModel: MockSessionModel,
        missingInfoService: mockMissingInfoService
      });

      const session = await orchestrator.initializeWorkflow({ userId: validUid, jobTitle: 'SRE', jobDescription: 'SRE job' });
      await orchestrator.confirmSubmission(session.sessionId, true);

      // Network drops or connection severed while employer portal was processing
      const recorded = await orchestrator.recordSubmissionOutcome(session.sessionId, {
        status: 'SUBMISSION_STATUS_UNKNOWN',
        error: 'ECONNRESET: Connection dropped during POST'
      });

      expect(recorded.status).toBe('SUBMISSION_STATUS_UNKNOWN');

      // Attempting to re-submit must be blocked
      await expect(
        orchestrator.confirmSubmission(session.sessionId, true)
      ).rejects.toThrow(/Cannot submit application/i);
    });
  });
});
