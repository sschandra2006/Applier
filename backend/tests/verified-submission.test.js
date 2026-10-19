/**
 * Applier 2.0 — Phase 17: Verified Submission and Receipt Capture Tests
 *
 * Core Principle:
 * "A successful click is NOT equivalent to successful submission."
 *
 * Required Scenarios Tested:
 * 1. success: Multi-signal confirmation, reference number extracted, receipt captured, schema verified.
 * 2. failure: Pre-submission conflicts/validation errors, invalid tokens, or post-submission error banner.
 * 3. timeout: Submit observation or network timeout handled with SUBMISSION_TIMEOUT.
 * 4. ambiguous submission: Ambiguous state without verified signals marked SUBMISSION_UNCERTAIN with human review.
 * 5. duplicate submission protection: Pre-existing submitted application blocked from duplicate clicks.
 * 6. receipt unavailable: Successful submission without downloadable file captures receipt screenshot cleanly.
 * 7. execution loop integration: VerifiedExecutionEngine with ActionVerifier.verifySubmit.
 */

import { jest } from '@jest/globals';
import { chromium } from 'playwright';
import {
  VerifiedSubmissionEngine,
  DuplicateSubmissionError,
  VerifiedExecutionEngine,
  ActionVerifier
} from '../../browser-worker/execution/index.js';
import { ConfirmationTokenService, ActionPolicyEngine } from '../../browser-worker/policy/index.js';
import {
  SubmissionStatus,
  SubmissionSignalType,
  ApplicationStatus,
  ActionVerificationStatus
} from '../../shared/enums/index.js';
import { validateVerifiedSubmission } from '../../shared/validators/index.js';

describe('Applier 2.0 — Phase 17: Verified Submission and Receipt Capture', () => {
  jest.setTimeout(25000);

  let browser;
  let page;
  let tokenService;
  let submissionEngine;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    tokenService = new ConfirmationTokenService({ secret: 'test-secret-phase17' });
  }, 20000);

  afterAll(async () => {
    if (browser) await browser.close();
  }, 20000);

  beforeEach(async () => {
    page = await browser.newPage();
    submissionEngine = new VerifiedSubmissionEngine({ tokenService });
  });

  afterEach(async () => {
    if (page && !page.isClosed()) await page.close();
  });

  // Helper to generate a valid token for an applicationId
  function createValidToken(applicationId, answers = {}, userId = 'default_user') {
    const res = tokenService.generateConfirmationToken({
      applicationId,
      userId,
      fieldState: answers
    });
    return res.token;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. SCENARIO: SUCCESS
  // ─────────────────────────────────────────────────────────────
  describe('1. Success Scenario', () => {
    it('should verify multi-signal submission, extract reference number, capture receipt and persist result', async () => {
      const applicationId = 'app_success_001';
      const answers = { fullName: 'Aarav Patel', email: 'aarav@example.com' };
      const token = createValidToken(applicationId, answers);

      // Mock realistic portal routes for real HTTP navigation
      await page.route('https://portal.test/review', (route) => {
        route.fulfill({
          contentType: 'text/html',
          body: `<!DOCTYPE html><html><head><title>Review & Submit</title></head><body>
            <h1>Application Review</h1>
            <form id="submission-form" action="/confirmation" method="GET">
              <input type="hidden" name="fullName" value="Aarav Patel" />
              <button id="submit-btn" type="submit">Confirm & Final Submit</button>
            </form>
          </body></html>`
        });
      });

      await page.route('https://portal.test/confirmation*', (route) => {
        route.fulfill({
          contentType: 'text/html',
          body: `<!DOCTYPE html><html><head><title>Confirmation - Application Submitted</title></head><body>
            <h1>Application Submitted Successfully</h1>
            <p>Thank you for submitting. We have received your application.</p>
            <div class="alert alert-success">
              <span>Application Reference: <strong>APP-2026-987654</strong></span>
            </div>
            <div id="receipt-section">
              <a href="https://example.com/receipts/APP-2026-987654.pdf" class="btn btn-primary" download>Download Receipt (PDF)</a>
            </div>
          </body></html>`
        });
      });

      await page.goto('https://portal.test/review');

      const result = await submissionEngine.submitAndVerify({
        page,
        action: {
          selector: '#submit-btn',
          confirmationToken: token
        },
        context: {
          applicationId,
          jobId: 'job_success_001',
          answers
        },
        options: {
          settleTimeoutMs: 1000
        }
      });

      // Assertions on Submission Status & Signals
      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMITTED);
      expect(result.referenceNumber).toBe('APP-2026-987654');
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
      expect(result.requiresHumanReview).toBe(false);

      // Multi-Signal Evidence
      const signals = result.finalPageEvidence.signalsDetected;
      expect(signals).toContain(SubmissionSignalType.SUCCESS_PAGE);
      expect(signals).toContain(SubmissionSignalType.CONFIRMATION_TEXT);
      expect(signals).toContain(SubmissionSignalType.APPLICATION_NUMBER);
      expect(signals).toContain(SubmissionSignalType.RECEIPT_DOWNLOAD);
      expect(signals).toContain(SubmissionSignalType.URL_TRANSITION);
      expect(result.finalPageEvidence.errorSignals).toHaveLength(0);

      // Receipt Evidence
      expect(result.receipt).toBeDefined();
      expect(result.receipt.available).toBe(true);
      expect(result.receipt.receiptUrl).toBe('https://example.com/receipts/APP-2026-987654.pdf');
      expect(result.receipt.receiptType).toBe('PDF');

      // Screenshot captured (not relying on screenshot alone!)
      expect(typeof result.receiptScreenshot).toBe('string');
      expect(result.receiptScreenshot.length).toBeGreaterThan(100);

      // Schema Validation
      const validation = validateVerifiedSubmission(result);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. SCENARIO: FAILURE
  // ─────────────────────────────────────────────────────────────
  describe('2. Failure Scenarios', () => {
    it('should halt immediately with SUBMISSION_FAILED if pre-submission conflicts exist', async () => {
      const applicationId = 'app_fail_conflict';
      const token = createValidToken(applicationId);

      const html = `data:text/html,<!DOCTYPE html><html><body><button id="submit-btn">Submit</button></body></html>`;
      await page.goto(html);

      const result = await submissionEngine.submitAndVerify({
        page,
        action: { selector: '#submit-btn', confirmationToken: token },
        context: {
          applicationId,
          hasConflicts: true
        }
      });

      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMISSION_FAILED);
      expect(result.requiresHumanReview).toBe(true);
      expect(result.finalPageEvidence.errorSignals).toContain('UNRESOLVED_CONFLICTS');

      const validation = validateVerifiedSubmission(result);
      expect(validation.valid).toBe(true);
    });

    it('should halt immediately with SUBMISSION_FAILED if validation errors are present', async () => {
      const applicationId = 'app_fail_validation';
      const token = createValidToken(applicationId);

      const html = `data:text/html,<!DOCTYPE html><html><body><button id="submit-btn">Submit</button></body></html>`;
      await page.goto(html);

      const result = await submissionEngine.submitAndVerify({
        page,
        action: { selector: '#submit-btn', confirmationToken: token },
        context: {
          applicationId,
          hasValidationErrors: true
        }
      });

      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMISSION_FAILED);
      expect(result.requiresHumanReview).toBe(true);
      expect(result.finalPageEvidence.errorSignals).toContain('PRE_SUBMISSION_VALIDATION_ERROR');

      const validation = validateVerifiedSubmission(result);
      expect(validation.valid).toBe(true);
    });

    it('should halt with SUBMISSION_FAILED if confirmation token is missing or invalid', async () => {
      const applicationId = 'app_fail_token';

      const html = `data:text/html,<!DOCTYPE html><html><body><button id="submit-btn">Submit</button></body></html>`;
      await page.goto(html);

      const result = await submissionEngine.submitAndVerify({
        page,
        action: { selector: '#submit-btn', confirmationToken: 'invalid-or-forged-token' },
        context: { applicationId }
      });

      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMISSION_FAILED);
      expect(result.requiresHumanReview).toBe(true);
      expect(result.finalPageEvidence.errorSignals).toContain('TOKEN_INVALID');

      const validation = validateVerifiedSubmission(result);
      expect(validation.valid).toBe(true);
    });

    it('should detect post-submission DOM error banner and mark SUBMISSION_FAILED', async () => {
      const applicationId = 'app_fail_post_submit';
      const token = createValidToken(applicationId);

      const html = `data:text/html,<!DOCTYPE html><html><head><title>Submission</title></head><body>
        <form onsubmit="event.preventDefault(); document.getElementById('err').style.display='block';">
          <button id="submit-btn" type="submit">Submit</button>
        </form>
        <div id="err" role="alert" class="alert alert-danger" style="display:none;">
          Submission failed: Mandatory identity document invalid or expired.
        </div>
      </body></html>`;

      await page.goto(html);

      const result = await submissionEngine.submitAndVerify({
        page,
        action: { selector: '#submit-btn', confirmationToken: token },
        context: { applicationId, jobId: 'job_fail_banner' },
        options: { settleTimeoutMs: 500 }
      });

      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMISSION_FAILED);
      expect(result.requiresHumanReview).toBe(true);
      expect(result.finalPageEvidence.errorSignals.some(s => s.toLowerCase().includes('submission failed'))).toBe(true);

      const validation = validateVerifiedSubmission(result);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. SCENARIO: TIMEOUT
  // ─────────────────────────────────────────────────────────────
  describe('3. Timeout Scenario', () => {
    it('should transition to SUBMISSION_TIMEOUT with human review when submission hangs or times out', async () => {
      const applicationId = 'app_timeout_001';
      const token = createValidToken(applicationId);

      const mockPage = {
        url: () => 'https://portal.example.org/form',
        locator: () => ({
          first: () => ({
            count: async () => 1,
            click: async () => {
              const err = new Error('Timeout 500ms exceeded while waiting for submit click');
              err.name = 'TimeoutError';
              throw err;
            }
          })
        }),
        waitForLoadState: async () => {
          const err = new Error('Timeout waiting for load state');
          err.name = 'TimeoutError';
          throw err;
        },
        evaluate: async () => {
          throw new Error('Evaluation timed out');
        },
        screenshot: async () => Buffer.from('fake_timeout_screenshot')
      };

      const result = await submissionEngine.submitAndVerify({
        page: mockPage,
        action: { selector: '#submit-btn', confirmationToken: token },
        context: { applicationId, jobId: 'job_timeout' },
        options: { settleTimeoutMs: 200 }
      });

      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMISSION_TIMEOUT);
      expect(result.requiresHumanReview).toBe(true);
      expect(result.referenceNumber).toBeNull();

      const validation = validateVerifiedSubmission(result);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. SCENARIO: AMBIGUOUS SUBMISSION
  // ─────────────────────────────────────────────────────────────
  describe('4. Ambiguous Submission Scenario', () => {
    it('should NEVER claim success on ambiguous state and must set SUBMISSION_UNCERTAIN with human review', async () => {
      const applicationId = 'app_ambiguous_001';
      const token = createValidToken(applicationId);

      // Portal transitions to generic dashboard without confirmation text, reference number, or receipt
      const preSubmitHtml = `data:text/html,<!DOCTYPE html><html><head><title>Form Page</title></head><body>
        <form onsubmit="event.preventDefault();
          window.location.hash = 'dashboard';
          document.title = 'Portal Dashboard';
          document.body.innerHTML = '<h1>Welcome to the Dashboard</h1>' +
            '<p>Select an option from the menu below to continue browsing programs.</p>' +
            '<ul><li>Program List</li><li>Campus Map</li></ul>';">
          <button id="submit-btn" type="submit">Submit Form</button>
        </form>
      </body></html>`;

      await page.goto(preSubmitHtml);

      const result = await submissionEngine.submitAndVerify({
        page,
        action: { selector: '#submit-btn', confirmationToken: token },
        context: { applicationId, jobId: 'job_ambiguous' },
        options: { settleTimeoutMs: 500 }
      });

      // Strict Ambiguity Protocol:
      // Status must NOT be SUBMITTED!
      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMISSION_UNCERTAIN);
      expect(result.requiresHumanReview).toBe(true);
      expect(result.confidence).toBeLessThan(0.60);
      expect(result.referenceNumber).toBeNull();

      const validation = validateVerifiedSubmission(result);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. SCENARIO: DUPLICATE SUBMISSION PROTECTION
  // ─────────────────────────────────────────────────────────────
  describe('5. Duplicate Submission Protection Scenario', () => {
    it('should block duplicate submission clicks when application is already verified and submitted', async () => {
      const applicationId = 'app_already_submitted_999';
      const token = createValidToken(applicationId);

      const html = `data:text/html,<!DOCTYPE html><html><body>
        <button id="submit-btn" onclick="window.clicked = true;">Submit</button>
      </body></html>`;

      await page.goto(html);

      // Existing application record that is already verified
      const existingRecord = {
        applicationId,
        status: ApplicationStatus.SUBMITTED,
        submissionStatus: SubmissionStatus.SUBMITTED,
        referenceNumber: 'REF-2026-PRIOR-4455',
        submittedAt: new Date(Date.now() - 3600000).toISOString(),
        confirmationUrl: 'https://portal.example.org/confirmation/4455',
        receipt: {
          available: true,
          receiptUrl: 'https://portal.example.org/receipts/4455.pdf',
          receiptType: 'PDF'
        }
      };

      const result = await submissionEngine.submitAndVerify({
        page,
        action: { selector: '#submit-btn', confirmationToken: token },
        context: {
          applicationId,
          applicationRecord: existingRecord
        },
        options: {
          preventDuplicate: true
        }
      });

      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMISSION_DUPLICATE_BLOCKED);
      expect(result.referenceNumber).toBe('REF-2026-PRIOR-4455');
      expect(result.confidence).toBe(1.0);
      expect(result.requiresHumanReview).toBe(false);

      // Confirm button on page was never clicked
      const wasClicked = await page.evaluate(() => Boolean(window.clicked));
      expect(wasClicked).toBe(false);

      const validation = validateVerifiedSubmission(result);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. SCENARIO: RECEIPT UNAVAILABLE
  // ─────────────────────────────────────────────────────────────
  describe('6. Receipt Unavailable Scenario', () => {
    it('should succeed with SUBMITTED when portal provides reference number but lacks downloadable receipt', async () => {
      const applicationId = 'app_no_receipt_link';
      const token = createValidToken(applicationId);

      // Portal confirms submission and gives application number, but provides no PDF/download link
      const preSubmitHtml = `data:text/html,<!DOCTYPE html><html><head><title>Submit Form</title></head><body>
        <form onsubmit="event.preventDefault();
          window.location.hash = 'complete';
          document.title = 'Application Complete';
          document.body.innerHTML = '<h2>Application Received Successfully</h2>' +
            '<p>Your application has been submitted. Keep your tracking number safe.</p>' +
            '<p>Application ID: <strong>REF-2026-NODOWNLOAD-1122</strong></p>' +
            '<p>No downloadable PDF receipt is issued by this institution.</p>';">
          <button id="submit-btn" type="submit">Submit</button>
        </form>
      </body></html>`;

      await page.goto(preSubmitHtml);

      const result = await submissionEngine.submitAndVerify({
        page,
        action: { selector: '#submit-btn', confirmationToken: token },
        context: { applicationId, jobId: 'job_no_receipt' },
        options: { settleTimeoutMs: 500 }
      });

      // Still cleanly SUBMITTED
      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMITTED);
      expect(result.referenceNumber).toBe('REF-2026-NODOWNLOAD-1122');
      expect(result.requiresHumanReview).toBe(false);

      // Receipt marked unavailable with clear reason
      expect(result.receipt.available).toBe(false);
      expect(result.receipt.reason).toBe('NO_RECEIPT_DOWNLOAD_FOUND');

      // Full page screenshot evidence is still captured
      expect(typeof result.receiptScreenshot).toBe('string');
      expect(result.receiptScreenshot.length).toBeGreaterThan(100);

      const validation = validateVerifiedSubmission(result);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. INTEGRATION: EXECUTION ENGINE & ACTION VERIFIER
  // ─────────────────────────────────────────────────────────────
  describe('7. Verified Execution Loop Integration', () => {
    it('should verify submit action end-to-end within VerifiedExecutionEngine and ActionVerifier', async () => {
      const applicationId = 'app_exec_engine_integration';
      const answers = { student: 'Priya Verma' };
      const token = createValidToken(applicationId, answers, 'default_user');

      const engine = new VerifiedExecutionEngine({
        verifiedSubmissionEngine: submissionEngine,
        actionPolicyEngine: new ActionPolicyEngine({ tokenService })
      });

      const portalHtml = `data:text/html,<!DOCTYPE html><html><head><title>Admission</title></head><body>
        <label for="student">Student Name</label>
        <input id="student" name="student" type="text" />
        <form onsubmit="event.preventDefault();
          window.location.hash = 'confirmed';
          document.title = 'Confirmation';
          document.body.innerHTML = '<h1>Application Submitted</h1>' +
            '<p>Your application has been successfully submitted.</p>' +
            '<p>Acknowledgement Number: <strong>APP-2026-EXEC-7788</strong></p>' +
            '<a href=\\'https://example.com/receipt.pdf\\' download>Download Receipt</a>';">
          <button id="submit-btn" type="submit">Final Submit</button>
        </form>
      </body></html>`;

      const steps = [
        { type: 'navigate', url: portalHtml, description: 'Go to form' },
        { type: 'fill', selector: '#student', field: 'student', value: 'Priya Verma', description: 'Fill name' },
        {
          type: 'submit',
          selector: '#submit-btn',
          confirmationToken: token,
          description: 'Submit verified application'
        }
      ];

      const execResult = await engine.execute({
        jobId: 'job_engine_test',
        applicationId,
        userId: 'default_user',
        steps,
        answers,
        page
      });

      expect(execResult.status).toBe('COMPLETED');
      expect(execResult.verifiedStepsCount).toBe(3);

      // Verify the submit step
      const submitStepRecord = execResult.state.verifiedSteps[2];
      expect(submitStepRecord.actionType).toBe('submit');
      expect(submitStepRecord.status).toBe(ActionVerificationStatus.PASSED);
      expect(submitStepRecord.actual).toBe(SubmissionStatus.SUBMITTED);
      expect(submitStepRecord.evidence).toContain('APP-2026-EXEC-7788');
    });

    it('should fail verification in ActionVerifier if submission status is SUBMISSION_UNCERTAIN', () => {
      const verifier = new ActionVerifier();

      const verification = verifier.verifySubmit({
        stepIndex: 3,
        target: '#submit-btn',
        expected: 'SUBMITTED',
        actual: {
          submissionStatus: SubmissionStatus.SUBMISSION_UNCERTAIN,
          referenceNumber: null,
          finalPageEvidence: { errorSignals: [] }
        }
      });

      expect(verification.passed).toBe(false);
      expect(verification.status).toBe(ActionVerificationStatus.FAILED);
      expect(verification.error).toBe(SubmissionStatus.SUBMISSION_UNCERTAIN);
      expect(verification.evidence).toContain('SUBMISSION_UNCERTAIN');
    });
  });
});
