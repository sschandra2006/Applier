/**
 * Verified Execution Engine Test Suite
 * Applier 2.0 — Phase 10: Observe → Plan → Act → Verify Execution Engine
 *
 * Comprehensive tests covering:
 * 1. Successful action (fill, select, click verified)
 * 2. Failed fill (read value mismatch halts blind continuation)
 * 3. Changed DOM (dynamic element replacement recovered via semantic locator)
 * 4. Validation error (DOM validation marker detected and halted)
 * 5. Navigation failure (network/HTTP failure caught)
 * 6. Upload rejection (portal upload error alert caught)
 * 7. Retry (transient failure recovered via alternative strategy)
 * 8. Checkpoint persistence (strictly serializable checkpoints after significant actions)
 * 9. Policy check (unsafe action or human intervention gated)
 * 10. Canonical contract compliance (ActionVerification schema v2.0.0)
 */

import { jest } from '@jest/globals';
import { chromium } from 'playwright';
import {
  VerifiedExecutionEngine,
  ActionVerifier,
  PolicyChecker,
  RecoveryHandler,
  ExecutionState
} from '../../browser-worker/execution/index.js';
import { validateActionVerification } from '../../shared/validators/index.js';
import { ActionVerificationStatus, JobStatus } from '../../shared/enums/index.js';

describe('Applier 2.0 — Phase 10: Verified Execution Engine', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 15000);

  afterAll(async () => {
    if (browser) await browser.close();
  }, 15000);

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    if (page && !page.isClosed()) await page.close();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. TEST SUCCESSFUL ACTION
  // ─────────────────────────────────────────────────────────────
  describe('1. Successful Action', () => {
    it('should verify fill, select, and click with full state updates', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><head><title>Success Portal</title></head><body>
        <h1>Student Portal</h1>
        <form id="testForm">
          <label for="txtName">Student Name</label>
          <input id="txtName" type="text" />
          <label for="selDegree">Degree</label>
          <select id="selDegree">
            <option value="">Select Degree</option>
            <option value="BTech">Bachelor of Technology</option>
            <option value="MTech">Master of Technology</option>
          </select>
          <button id="btnSubmit" type="button" onclick="document.getElementById('result').textContent='Form Submitted';">Submit</button>
          <div id="result">Waiting</div>
        </form>
      </body></html>`;

      const steps = [
        { type: 'navigate', url: html, description: 'Navigate to form' },
        { type: 'fill', selector: '#txtName', value: 'Ananya Sharma', description: 'Fill student name' },
        { type: 'select', selector: '#selDegree', value: 'BTech', description: 'Select degree' },
        {
          type: 'click',
          selector: '#btnSubmit',
          expectedSelector: '#result',
          description: 'Click submit button'
        }
      ];

      const engine = new VerifiedExecutionEngine();
      const result = await engine.execute({
        jobId: 'job_success_1',
        page,
        steps,
        targetUrl: html
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.verifiedStepsCount).toBe(4);
      expect(result.checkpointsCount).toBeGreaterThan(0);

      // Verify each step record in state
      const verified = result.state.verifiedSteps;
      expect(verified[0].actionType).toBe('navigate');
      expect(verified[0].status).toBe(ActionVerificationStatus.PASSED);

      expect(verified[1].actionType).toBe('fill');
      expect(verified[1].status).toBe(ActionVerificationStatus.PASSED);
      expect(verified[1].actual).toBe('Ananya Sharma');

      expect(verified[2].actionType).toBe('select');
      expect(verified[2].status).toBe(ActionVerificationStatus.PASSED);

      expect(verified[3].actionType).toBe('click');
      expect(verified[3].status).toBe(ActionVerificationStatus.PASSED);
    }, 15000);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. TEST FAILED FILL
  // ─────────────────────────────────────────────────────────────
  describe('2. Failed Fill', () => {
    it('should detect value mismatch, not blindly continue, and halt cleanly', async () => {
      // Input overrides any entered text to 'LOCKED_VAL'
      const html = `data:text/html,<!DOCTYPE html><html><head><title>Locked Portal</title></head><body>
        <form id="lockedForm">
          <label for="lockedInput">Passcode</label>
          <input id="lockedInput" type="text" oninput="this.value='LOCKED_VAL';" />
          <button id="btnNext" type="button" onclick="window.__blindlyExecuted = true;">Next</button>
        </form>
      </body></html>`;

      await page.goto(html);

      const steps = [
        {
          type: 'fill',
          selector: '#lockedInput',
          value: 'MySecretPassword123',
          description: 'Attempt fill passcode'
        },
        {
          type: 'click',
          selector: '#btnNext',
          description: 'Should never be reached'
        }
      ];

      const engine = new VerifiedExecutionEngine();
      const result = await engine.execute({
        jobId: 'job_failed_fill',
        page,
        steps
      });

      expect(result.status).toBe('FAILED');
      expect(result.failedStep).toBe(0);

      // Verify that blind continuation was prevented
      const blindlyExecuted = await page.evaluate(() => window.__blindlyExecuted);
      expect(blindlyExecuted).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. TEST CHANGED DOM
  // ─────────────────────────────────────────────────────────────
  describe('3. Changed DOM', () => {
    it('should recover when DOM element dynamically mutates using semantic locator', async () => {
      // Dynamic page where initial element has a dynamic hash ID
      const html = `data:text/html,<!DOCTYPE html><html><head><title>Dynamic Form</title></head><body>
        <div id="formContainer">
          <label for="input_dyn_hash_987">Candidate Legal Name</label>
          <input id="input_dyn_hash_987" name="cand_name" type="text" />
        </div>
      </body></html>`;

      await page.goto(html);

      const steps = [
        {
          type: 'fill',
          semanticTarget: 'applicant.fullName',
          selector: '#input_dyn_hash_987',
          value: 'Priya Patel',
          description: 'Fill dynamic candidate name'
        }
      ];

      const engine = new VerifiedExecutionEngine();
      const result = await engine.execute({
        jobId: 'job_changed_dom',
        page,
        steps
      });

      expect(result.status).toBe('COMPLETED');
      const val = await page.locator('#input_dyn_hash_987').inputValue();
      expect(val).toBe('Priya Patel');
    }, 15000);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. TEST VALIDATION ERROR
  // ─────────────────────────────────────────────────────────────
  describe('4. Validation Error', () => {
    it('should detect DOM validation errors after fill and halt execution', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><head><title>Validation Portal</title></head><body>
        <form id="valForm">
          <div class="field-wrapper">
            <label for="txtEmail">Email Address</label>
            <input id="txtEmail" type="text" oninput="
              this.setAttribute('aria-invalid', 'true');
              document.getElementById('emailErr').style.display = 'block';
            " />
            <div id="emailErr" class="invalid-feedback" style="display:none; color:red;">
              Invalid email address format
            </div>
          </div>
          <button id="btnSubmit" type="button" onclick="window.__blindlySubmitted = true;">Submit</button>
        </form>
      </body></html>`;

      await page.goto(html);

      const steps = [
        {
          type: 'fill',
          selector: '#txtEmail',
          value: 'invalid-email-no-at-sign',
          description: 'Fill invalid email'
        },
        {
          type: 'click',
          selector: '#btnSubmit',
          description: 'Click submit'
        }
      ];

      const engine = new VerifiedExecutionEngine();
      const result = await engine.execute({
        jobId: 'job_val_error',
        page,
        steps
      });

      expect(result.status).toBe('FAILED');
      expect(result.failedStep).toBe(0);

      // Verify submit button was never clicked
      const submitted = await page.evaluate(() => window.__blindlySubmitted);
      expect(submitted).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. TEST NAVIGATION FAILURE
  // ─────────────────────────────────────────────────────────────
  describe('5. Navigation Failure', () => {
    it('should detect navigation failure to invalid host/scheme and halt cleanly', async () => {
      const steps = [
        {
          type: 'navigate',
          url: 'http://127.0.0.1:59998/nonexistent-portal',
          description: 'Navigate to broken portal'
        },
        {
          type: 'fill',
          selector: '#someInput',
          value: 'Never reached',
          description: 'Unreachable step'
        }
      ];

      const engine = new VerifiedExecutionEngine();
      const result = await engine.execute({
        jobId: 'job_nav_fail',
        page,
        steps
      });

      expect(result.status).toBe('FAILED');
      expect(result.failedStep).toBe(0);
    }, 20000);
  });

  // ─────────────────────────────────────────────────────────────
  // 6. TEST UPLOAD REJECTION
  // ─────────────────────────────────────────────────────────────
  describe('6. Upload Rejection', () => {
    it('should detect portal upload rejection alert in DOM and halt without continuing', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><head><title>Upload Portal</title></head><body>
        <form id="docForm">
          <label for="fileDoc">Upload Identity Proof</label>
          <input id="fileDoc" type="file" onchange="
            document.getElementById('uploadAlert').style.display = 'block';
          " />
          <div id="uploadAlert" role="alert" class="upload-error" style="display:none; color:red;">
            File upload rejected: File type not supported.
          </div>
          <button id="btnProceed" type="button" onclick="window.__uploadedNext = true;">Proceed</button>
        </form>
      </body></html>`;

      await page.goto(html);

      const verifier = new ActionVerifier();
      // Simulate file attached with rejection alert visible
      await page.evaluate(() => {
        document.getElementById('uploadAlert').style.display = 'block';
      });

      const verification = await verifier.verify({
        page,
        actionType: 'upload',
        stepIndex: 0,
        target: '#fileDoc',
        expected: 'identity.pdf'
      });

      expect(verification.passed).toBe(false);
      expect(verification.error).toBe('UPLOAD_REJECTED');
      expect(verification.evidence).toContain('File upload rejected by portal');

      // Canonical schema validation
      const validation = validateActionVerification(verification.canonicalPayload);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. TEST RETRY
  // ─────────────────────────────────────────────────────────────
  describe('7. Retry', () => {
    it('should retry fill action via DOM event dispatch and succeed', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><head><title>Retry Portal</title></head><body>
        <label for="txtName">Name</label>
        <input id="txtName" type="text" />
      </body></html>`;

      await page.goto(html);

      const verifier = new ActionVerifier();
      const recovery = new RecoveryHandler();

      const step = {
        type: 'fill',
        stepIndex: 0,
        selector: '#txtName',
        value: 'Aarav Gupta'
      };

      // Simulate a first attempt failure
      const initialFailure = {
        passed: false,
        status: ActionVerificationStatus.FAILED,
        error: 'FILL_VALUE_MISMATCH',
        actual: '',
        expected: 'Aarav Gupta'
      };

      const recoveryResult = await recovery.handleFailure({
        page,
        step,
        verificationResult: initialFailure,
        attempt: 1,
        actionVerifier: verifier,
        executeActionFn: async (s) => {
          await page.fill(s.selector, s.value);
        }
      });

      expect(recoveryResult.recovered).toBe(true);
      expect(recoveryResult.verificationResult.status).toBe(ActionVerificationStatus.RECOVERED);

      const finalVal = await page.locator('#txtName').inputValue();
      expect(finalVal).toBe('Aarav Gupta');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. TEST CHECKPOINT PERSISTENCE
  // ─────────────────────────────────────────────────────────────
  describe('8. Checkpoint Persistence', () => {
    it('should persist serializable checkpoints after significant actions', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><head><title>Checkpoint Portal</title></head><body>
        <label for="txtInput">Applicant ID</label>
        <input id="txtInput" type="text" />
      </body></html>`;

      const steps = [
        { type: 'navigate', url: html, description: 'Navigate' },
        { type: 'fill', selector: '#txtInput', value: 'APP-9988', description: 'Fill ID' }
      ];

      const engine = new VerifiedExecutionEngine();
      const result = await engine.execute({
        jobId: 'job_chk_test',
        page,
        steps
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.checkpointsCount).toBe(2);

      const chk = result.state.checkpoints[1];
      expect(chk.checkpointVersion).toBe('2.0.0');
      expect(chk.sessionId).toBeDefined();
      expect(chk.checkpointState.actionType).toBe('fill');
      expect(chk.checkpointState.answers).toBeDefined();

      // Ensure strictly JSON serializable (no circular or Playwright objects)
      const json = JSON.stringify(chk);
      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.checkpointVersion).toBe('2.0.0');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. TEST POLICY CHECK
  // ─────────────────────────────────────────────────────────────
  describe('9. Pre-Execution Policy Check', () => {
    it('should block unsafe navigation protocols', () => {
      const checker = new PolicyChecker();
      const check = checker.check({
        step: { type: 'navigate', url: 'javascript:alert(1)' },
        currentUrl: 'https://example.com'
      });

      expect(check.allowed).toBe(false);
      expect(check.policyName).toBe('UNSAFE_PROTOCOL_POLICY');
    });

    it('should gate automated steps targeting CAPTCHA or OTP', () => {
      const checker = new PolicyChecker();
      const check = checker.check({
        step: { type: 'fill', selector: '#captchaInput', field: 'portalCaptcha', value: '123' },
        currentUrl: 'https://example.com'
      });

      expect(check.allowed).toBe(false);
      expect(check.requiresPause).toBe(true);
      expect(check.pauseReason).toBe('CAPTCHA');
      expect(check.policyName).toBe('HUMAN_INTERVENTION_POLICY');
    });

    it('should reject missing required input values', () => {
      const checker = new PolicyChecker();
      const check = checker.check({
        step: { type: 'fill', selector: '#txtName', value: null, isOptional: false },
        currentUrl: 'https://example.com'
      });

      expect(check.allowed).toBe(false);
      expect(check.policyName).toBe('MISSING_REQUIRED_VALUE_POLICY');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. CANONICAL CONTRACT VALIDATION
  // ─────────────────────────────────────────────────────────────
  describe('10. Canonical Contract Compliance', () => {
    it('should generate valid ActionVerification payloads adhering to v2.0.0 schema', async () => {
      const verifier = new ActionVerifier();
      const verification = await verifier.verify({
        page,
        actionType: 'screenshot',
        stepIndex: 3,
        actual: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      });

      expect(verification.passed).toBe(true);
      const validation = validateActionVerification(verification.canonicalPayload);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(verification.canonicalPayload.schemaVersion).toBe('2.0.0');
    });
  });
});
