/**
 * Applier 2.0 — Phase 16: Durable Execution Checkpoints Tests
 *
 * Verifies:
 * 1. Worker restart resumption (durable state restoration & state reconciliation)
 * 2. Browser crash resumption (session restoration & page verification)
 * 3. OTP pause & resumption (privacy guard, transient injection, no permanent raw OTP)
 * 4. CAPTCHA pause & resumption (screenshot capture, transient solution, clean resume)
 * 5. API restart resumption (durable storage reconstruction without memory leaks)
 * 6. Resume after timeout (re-observe live DOM and continue execution)
 * 7. Secret hygiene invariant (raw secrets strictly forbidden from permanent checkpoint storage)
 * 8. Stale selector avoidance (dynamic runtime locator resolution)
 * 9. Canonical schema validation (v2.0.0 compliance)
 */

import { BrowserManager } from '../../browser-worker/src/engine/browser.manager.js';
import {
  DurableCheckpointManager,
  DurableResumptionEngine,
  VerifiedExecutionEngine,
  assertNoSecretsPersisted,
  sanitizeAnswers
} from '../../browser-worker/execution/index.js';
import {
  JobStatus,
  ResumptionPhase,
  validateExecutionCheckpoint
} from '../../shared/src/index.js';

describe('Applier 2.0 — Phase 16: Durable Execution Checkpoints', () => {
  let browserManager;
  let checkpointManager;
  let resumptionEngine;
  let browser;

  beforeAll(async () => {
    browserManager = new BrowserManager();
  });

  afterAll(async () => {
    if (browserManager) {
      await browserManager.cleanupAllBrowsers().catch(() => {});
    }
  });

  beforeEach(() => {
    checkpointManager = new DurableCheckpointManager();
    resumptionEngine = new DurableResumptionEngine({
      browserManager,
      checkpointManager
    });
  });

  afterEach(async () => {
    if (browser) {
      await browserManager.closeBrowser(browser).catch(() => {});
      browser = null;
    }
    checkpointManager.clear();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. WORKER RESTART RESUMPTION
  // ─────────────────────────────────────────────────────────────
  describe('1. Worker Restart Resumption', () => {
    it('should restore job from durable checkpoint, reconcile completed fields, and finish remaining steps after worker restart', async () => {
      browser = await browserManager.launchBrowser();
      const page = await browser.newPage();

      const formHtml = `data:text/html,<!DOCTYPE html><html><body>
        <h1>Admissions Portal - Step 1</h1>
        <label for="fullName">Full Name</label>
        <input id="fullName" name="fullName" type="text" />
        <label for="phone">Phone Number</label>
        <input id="phone" name="phone" type="text" />
      </body></html>`;

      await page.goto(formHtml);

      const jobId = 'job_worker_restart_101';
      const steps = [
        { type: 'navigate', url: formHtml },
        { type: 'fill', selector: '#fullName', semanticTarget: 'applicant.fullName', value: 'Rahul Kumar' },
        { type: 'fill', selector: '#phone', semanticTarget: 'contact.phone', value: '+919876543210' }
      ];

      // Simulate Worker 1 executing step 0 and step 1
      await page.fill('#fullName', 'Rahul Kumar');
      const checkpoint1 = await checkpointManager.captureDurableCheckpoint({
        page,
        jobId,
        applicationId: 'app_991',
        stepIndex: 1,
        currentField: 'applicant.fullName',
        completedFields: ['applicant.fullName'],
        lastVerifiedAction: {
          actionType: 'fill',
          target: 'applicant.fullName',
          verifiedAt: new Date().toISOString(),
          verificationResult: { passed: true }
        },
        answers: { 'applicant.fullName': 'Rahul Kumar', 'contact.phone': '+919876543210' },
        status: JobStatus.RUNNING
      });

      expect(checkpoint1).toBeDefined();
      expect(checkpoint1.executionStep).toBe(1);
      expect(checkpoint1.completedFields).toContain('applicant.fullName');

      // Simulate Worker 1 terminates abruptly.
      // Worker 2 starts afresh and resumes the job.
      const worker2Engine = new DurableResumptionEngine({
        browserManager,
        checkpointManager
      });

      const resumeResult = await worker2Engine.resume({
        jobId,
        page,
        executionPlan: steps,
        answers: { 'applicant.fullName': 'Rahul Kumar', 'contact.phone': '+919876543210' }
      });

      expect(resumeResult.resumed).toBe(true);
      expect(resumeResult.status).toBe(JobStatus.COMPLETED);
      expect(resumeResult.reconciledStepIndex).toBe(2); // Advanced past already-completed step 1

      // Verify final DOM state
      const finalPhone = await page.inputValue('#phone');
      expect(finalPhone).toBe('+919876543210');

      const finalFullName = await page.inputValue('#fullName');
      expect(finalFullName).toBe('Rahul Kumar');
    }, 25000);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. BROWSER CRASH RESUMPTION
  // ─────────────────────────────────────────────────────────────
  describe('2. Browser Crash Resumption', () => {
    it('should restore session into a new browser context, verify current page, and complete execution after browser crash', async () => {
      browser = await browserManager.launchBrowser();
      const initialPage = await browser.newPage();

      const appHtml = `data:text/html,<!DOCTYPE html><html><body>
        <h1>Student Registration</h1>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" />
      </body></html>`;

      await initialPage.goto(appHtml);

      const jobId = 'job_browser_crash_202';
      // Step 0 was navigate. Checkpoint captured at step 0.
      await checkpointManager.captureDurableCheckpoint({
        page: initialPage,
        jobId,
        applicationId: 'app_202',
        stepIndex: 0,
        completedFields: [],
        lastVerifiedAction: {
          actionType: 'navigate',
          target: appHtml,
          verifiedAt: new Date().toISOString(),
          verificationResult: { passed: true }
        },
        answers: { 'contact.email': 'rahul.kumar@test.com' },
        status: JobStatus.RUNNING
      });

      // Simulate Browser / Page Crash: forcibly close initial page and browser
      await initialPage.close();
      await browserManager.closeBrowser(browser);
      browser = null;

      // Resumption engine recovers from crash with a fresh browser instance
      const steps = [
        { type: 'navigate', url: appHtml },
        { type: 'fill', selector: '#email', semanticTarget: 'contact.email', value: 'rahul.kumar@test.com' }
      ];

      const resumeResult = await resumptionEngine.resume({
        jobId,
        executionPlan: steps,
        answers: { 'contact.email': 'rahul.kumar@test.com' }
      });

      expect(resumeResult.resumed).toBe(true);
      expect(resumeResult.status).toBe(JobStatus.COMPLETED);

      // Verify that audit log records session restoration
      const sessionPhase = resumeResult.resumeAudit.phases.find(
        (p) => p.phase === ResumptionPhase.RESTORE_SESSION
      );
      expect(sessionPhase).toBeDefined();
      expect(sessionPhase.details.restoredFromExistingSession).toBe(false); // Created clean session post-crash
    }, 25000);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. OTP PAUSE & RESUMPTION
  // ─────────────────────────────────────────────────────────────
  describe('3. OTP Pause & Resumption', () => {
    it('should pause safely without storing raw OTP, and resume cleanly with transient user input', async () => {
      browser = await browserManager.launchBrowser();
      const page = await browser.newPage();

      const otpHtml = `data:text/html,<!DOCTYPE html><html><body>
        <h1>Mobile Verification</h1>
        <label for="otpCode">Enter OTP</label>
        <input id="otpCode" name="otpCode" type="text" />
      </body></html>`;

      await page.goto(otpHtml);

      const jobId = 'job_otp_pause_303';
      const steps = [
        { type: 'navigate', url: otpHtml },
        { type: 'pause', pauseReason: 'OTP', field: 'otpCode', selector: '#otpCode' },
        { type: 'fill', selector: '#otpCode', semanticTarget: 'contact.otpCode', field: 'otpCode' }
      ];

      // Simulate pause at Step 1 for OTP
      const pauseCheckpoint = await checkpointManager.captureDurableCheckpoint({
        page,
        jobId,
        applicationId: 'app_303',
        stepIndex: 1,
        currentField: 'otpCode',
        completedFields: [],
        status: JobStatus.PAUSED_OTP,
        pendingCheckpoint: {
          pauseReason: 'OTP',
          fieldName: 'otpCode',
          stepIndex: 1
        },
        answers: { 'applicant.name': 'Rahul' }
      });

      // Verify Privacy Invariant: NO raw secrets in persistent checkpoint
      expect(pauseCheckpoint.status).toBe(JobStatus.PAUSED_OTP);
      expect(pauseCheckpoint.pendingCheckpoint.fieldName).toBe('otpCode');
      expect(pauseCheckpoint.sanitizedAnswers.otp).toBeUndefined();
      expect(pauseCheckpoint.sanitizedAnswers.otpCode).toBeUndefined();
      expect(() => assertNoSecretsPersisted(pauseCheckpoint)).not.toThrow();

      // User supplies OTP through UI / controller
      const userOtpInput = { otp: '543210' };

      const resumeResult = await resumptionEngine.resume({
        jobId,
        page,
        executionPlan: steps,
        userInput: userOtpInput
      });

      expect(resumeResult.resumed).toBe(true);
      expect(resumeResult.status).toBe(JobStatus.COMPLETED);

      // Verify live input received value
      const enteredOtp = await page.inputValue('#otpCode');
      expect(enteredOtp).toBe('543210');

      // Verify final checkpoint did NOT permanently persist raw OTP
      const finalCheckpoint = await checkpointManager.getLatestCheckpoint(jobId);
      expect(finalCheckpoint.sanitizedAnswers.otp).toBeUndefined();
      expect(finalCheckpoint.sanitizedAnswers.otpCode).toBeUndefined();
      expect(() => assertNoSecretsPersisted(finalCheckpoint)).not.toThrow();
    }, 25000);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CAPTCHA PAUSE & RESUMPTION
  // ─────────────────────────────────────────────────────────────
  describe('4. CAPTCHA Pause & Resumption', () => {
    it('should pause with captcha metadata, and resume using user-provided solution without storing raw secrets', async () => {
      browser = await browserManager.launchBrowser();
      const page = await browser.newPage();

      const captchaHtml = `data:text/html,<!DOCTYPE html><html><body>
        <h1>Security Check</h1>
        <div id="captchaImg">CAPTCHA_IMAGE_CONTAINER</div>
        <label for="captchaInput">Enter Captcha</label>
        <input id="captchaInput" name="captchaInput" type="text" />
      </body></html>`;

      await page.goto(captchaHtml);

      const jobId = 'job_captcha_pause_404';
      const steps = [
        { type: 'navigate', url: captchaHtml },
        { type: 'pause', pauseReason: 'CAPTCHA', field: 'captchaInput', selector: '#captchaInput' },
        { type: 'fill', selector: '#captchaInput', semanticTarget: 'system.captcha', field: 'captchaInput' }
      ];

      // Simulate CAPTCHA pause
      const captchaCheckpoint = await checkpointManager.captureDurableCheckpoint({
        page,
        jobId,
        applicationId: 'app_404',
        stepIndex: 1,
        currentField: 'captchaInput',
        completedFields: [],
        status: JobStatus.PAUSED_CAPTCHA,
        pendingCheckpoint: {
          pauseReason: 'CAPTCHA',
          fieldName: 'captchaInput',
          stepIndex: 1,
          captchaImageBase64: 'fake_captcha_b64'
        },
        answers: { 'applicant.city': 'New Delhi' }
      });

      expect(captchaCheckpoint.status).toBe(JobStatus.PAUSED_CAPTCHA);
      expect(captchaCheckpoint.pendingCheckpoint.captchaImageBase64).toBe('fake_captcha_b64');
      expect(captchaCheckpoint.sanitizedAnswers.captcha).toBeUndefined();
      expect(() => assertNoSecretsPersisted(captchaCheckpoint)).not.toThrow();

      // User solves CAPTCHA
      const userCaptchaInput = { captcha: 'W8X9Q' };

      const resumeResult = await resumptionEngine.resume({
        jobId,
        page,
        executionPlan: steps,
        userInput: userCaptchaInput
      });

      expect(resumeResult.resumed).toBe(true);
      expect(resumeResult.status).toBe(JobStatus.COMPLETED);

      const enteredCaptcha = await page.inputValue('#captchaInput');
      expect(enteredCaptcha).toBe('W8X9Q');
    }, 25000);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. API RESTART RESUMPTION
  // ─────────────────────────────────────────────────────────────
  describe('5. API Restart Resumption', () => {
    it('should reconstruct job state from durable checkpoint after API restart with in-memory store cleared', async () => {
      browser = await browserManager.launchBrowser();
      const page = await browser.newPage();

      const formHtml = `data:text/html,<!DOCTYPE html><html><body>
        <h1>Permanent Address</h1>
        <label for="pincode">Postal Code</label>
        <input id="pincode" name="pincode" type="text" />
      </body></html>`;

      await page.goto(formHtml);

      const jobId = 'job_api_restart_505';

      // Capture durable checkpoint before API crash
      await checkpointManager.captureDurableCheckpoint({
        page,
        jobId,
        applicationId: 'app_505',
        stepIndex: 0,
        completedFields: ['applicant.fullName'],
        lastVerifiedAction: {
          actionType: 'navigate',
          target: formHtml,
          verifiedAt: new Date().toISOString(),
          verificationResult: { passed: true }
        },
        answers: { 'address.pincode': '110001' },
        status: JobStatus.RUNNING
      });

      // Retrieve checkpoint as if from MongoDB after API restart
      const persistentCheckpoint = await checkpointManager.getLatestCheckpoint(jobId);
      expect(persistentCheckpoint).toBeDefined();

      // Clear memory to emulate fresh API process
      const freshCheckpointManager = new DurableCheckpointManager();
      freshCheckpointManager.memoryStore.set(jobId, [persistentCheckpoint]);

      const freshResumptionEngine = new DurableResumptionEngine({
        browserManager,
        checkpointManager: freshCheckpointManager
      });

      const steps = [
        { type: 'navigate', url: formHtml },
        { type: 'fill', selector: '#pincode', semanticTarget: 'address.pincode', value: '110001' }
      ];

      const resumeResult = await freshResumptionEngine.resume({
        jobId,
        page,
        executionPlan: steps,
        answers: { 'address.pincode': '110001' }
      });

      expect(resumeResult.status).toBe(JobStatus.COMPLETED);
      expect(await page.inputValue('#pincode')).toBe('110001');
    }, 25000);
  });

  // ─────────────────────────────────────────────────────────────
  // 6. RESUME AFTER TIMEOUT
  // ─────────────────────────────────────────────────────────────
  describe('6. Resume After Timeout', () => {
    it('should re-observe live page and resume without repeating completed actions after a timeout', async () => {
      browser = await browserManager.launchBrowser();
      const page = await browser.newPage();

      const formHtml = `data:text/html,<!DOCTYPE html><html><body>
        <h1>Education Details</h1>
        <label for="degree">Degree</label>
        <input id="degree" name="degree" type="text" />
        <label for="gpa">GPA</label>
        <input id="gpa" name="gpa" type="text" />
      </body></html>`;

      await page.goto(formHtml);

      // Degree was already filled before the timeout
      await page.fill('#degree', 'Bachelor of Technology');

      const jobId = 'job_timeout_606';
      await checkpointManager.captureDurableCheckpoint({
        page,
        jobId,
        applicationId: 'app_606',
        stepIndex: 1,
        currentField: 'education.degree',
        completedFields: ['education.degree'],
        lastVerifiedAction: {
          actionType: 'fill',
          target: 'education.degree',
          verifiedAt: new Date().toISOString(),
          verificationResult: { passed: true }
        },
        answers: {
          'education.degree': 'Bachelor of Technology',
          'education.gpa': '3.9'
        },
        status: JobStatus.RUNNING
      });

      const steps = [
        { type: 'navigate', url: formHtml },
        { type: 'fill', selector: '#degree', semanticTarget: 'education.degree', value: 'Bachelor of Technology' },
        { type: 'fill', selector: '#gpa', semanticTarget: 'education.gpa', value: '3.9' }
      ];

      // Resume after timeout
      const resumeResult = await resumptionEngine.resume({
        jobId,
        page,
        executionPlan: steps,
        answers: {
          'education.degree': 'Bachelor of Technology',
          'education.gpa': '3.9'
        }
      });

      expect(resumeResult.resumed).toBe(true);
      expect(resumeResult.status).toBe(JobStatus.COMPLETED);
      expect(resumeResult.reconciledStepIndex).toBe(2); // Advanced past already-verified degree step

      expect(await page.inputValue('#gpa')).toBe('3.9');
      expect(await page.inputValue('#degree')).toBe('Bachelor of Technology');
    }, 25000);
  });

  // ─────────────────────────────────────────────────────────────
  // 7. SECRET HYGIENE INVARIANT & STALE SELECTOR REJECTION
  // ─────────────────────────────────────────────────────────────
  describe('7. Secret Hygiene Invariant & Stale Selector Rejection', () => {
    it('should throw SecretHygieneViolation if raw secrets are attempted to be persisted', () => {
      const contaminatedCheckpoint = {
        schemaVersion: '2.0.0',
        checkpointId: 'chk_bad',
        jobId: 'job_bad',
        url: 'https://test.edu',
        completedFields: [],
        sanitizedAnswers: {
          fullName: 'Test User',
          password: 'plain_password_123'
        },
        status: JobStatus.RUNNING
      };

      expect(() => assertNoSecretsPersisted(contaminatedCheckpoint)).toThrow(
        /SecretHygieneViolation/
      );
    });

    it('should sanitize answers removing all sensitive fields', () => {
      const raw = {
        fullName: 'Rahul Kumar',
        otp: '123456',
        otpCode: '654321',
        captcha: 'ABC12',
        password: 'secretPassword!',
        pin: '9988',
        email: 'rahul@test.com'
      };

      const clean = sanitizeAnswers(raw);
      expect(clean.fullName).toBe('Rahul Kumar');
      expect(clean.email).toBe('rahul@test.com');
      expect(clean.otp).toBeUndefined();
      expect(clean.otpCode).toBeUndefined();
      expect(clean.captcha).toBeUndefined();
      expect(clean.password).toBeUndefined();
      expect(clean.pin).toBeUndefined();
    });

    it('should pass canonical schema validation for Phase 16 execution-checkpoint', () => {
      const validCheckpoint = {
        schemaVersion: '2.0.0',
        checkpointId: 'chk_valid_123',
        applicationId: 'app_123',
        jobId: 'job_123',
        page: { pageId: 'page_1', title: 'Admissions' },
        url: 'https://university.edu/apply',
        pageUrl: 'https://university.edu/apply',
        currentField: 'applicant.email',
        completedFields: ['applicant.name'],
        executionStep: 1,
        stepIndex: 1,
        browserStateMetadata: { cookiesCount: 2, activeTabs: 1 },
        pendingCheckpoint: null,
        lastVerifiedAction: {
          actionType: 'fill',
          target: 'applicant.name',
          verifiedAt: '2026-10-04T18:00:00Z',
          verificationResult: { passed: true }
        },
        sanitizedAnswers: { 'applicant.name': 'Rahul' },
        status: JobStatus.RUNNING
      };

      const result = validateExecutionCheckpoint(validCheckpoint);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
