/**
 * Multi-Level Browser Recovery Test Suite
 * Applier 2.0 — Phase 15: Multi-Level Browser Recovery
 *
 * Verifies:
 * 1. One test per failure class (all 10 failure types):
 *    - selector failure
 *    - element missing
 *    - timeout
 *    - navigation failure
 *    - session expired
 *    - unexpected modal
 *    - validation failure
 *    - upload rejection
 *    - page changed
 *    - browser crash
 * 2. Recovery loop detection and cycle breaking
 * 3. Maximum attempts limit and clean escalation to Human Checkpoint
 * 4. Structured logging recording original action, failure, strategy, result, attempt, duration
 * 5. Immutable user data invariant: recovery must NEVER modify user data silently
 */

import { jest } from '@jest/globals';
import { chromium } from 'playwright';
import {
  MultiLevelRecoveryEngine,
  defaultMultiLevelRecoveryEngine
} from '../../browser-worker/execution/multi-level-recovery.engine.js';
import {
  FailureClass,
  RecoveryLevel,
  RecoveryResultStatus
} from '../../shared/enums/index.js';
import { validateRecoveryRecord } from '../../shared/validators/index.js';

jest.setTimeout(35000);

describe('Applier 2.0 — Phase 15: Multi-Level Browser Recovery', () => {
  let browser;
  let page;
  let recoveryEngine;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 20000);

  afterAll(async () => {
    if (browser) await browser.close();
  }, 20000);

  beforeEach(async () => {
    page = await browser.newPage();
    recoveryEngine = new MultiLevelRecoveryEngine({
      maxAttempts: 6
    });
  });

  afterEach(async () => {
    if (page && !page.isClosed()) await page.close();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. SELECTOR FAILURE
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 1: Selector Failure', () => {
    it('should classify invalid selector syntax and recover by re-resolving locator via semantic target', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><body>
        <label for="applicantName">Full Name</label>
        <input id="applicantName" type="text" />
      </body></html>`;
      await page.goto(html);

      const action = {
        type: 'fill',
        target: 'input:invalid-syntax[(@#',
        selector: 'input:invalid-syntax[(@#',
        value: 'Rahul Sharma'
      };

      const step = {
        field: 'applicant.fullName',
        semanticTarget: 'applicant.fullName',
        stepIndex: 1
      };

      const error = new Error('SyntaxError: "input:invalid-syntax[(@#" is not a valid selector');

      const classified = recoveryEngine.classifyFailure(error);
      expect(classified.type).toBe(FailureClass.SELECTOR_FAILURE);

      const result = await recoveryEngine.recover({
        page,
        action,
        error,
        step,
        executeActionFn: async (act) => {
          if (act.resolvedLocator) {
            await act.resolvedLocator.fill(act.value);
          }
        }
      });

      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryLevel.RE_RESOLVE_LOCATOR);
      expect(result.log.failure.type).toBe(FailureClass.SELECTOR_FAILURE);
      expect(result.log.result).toBe(RecoveryResultStatus.SUCCESS);
      expect(result.log.dataModified).toBe(false);

      const filledVal = await page.inputValue('#applicantName');
      expect(filledVal).toBe('Rahul Sharma');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. ELEMENT MISSING
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 2: Element Missing', () => {
    it('should classify missing element and recover using accessible label locator resolution', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><body>
        <div>
          <label for="txtEmail">Email Address</label>
          <input id="txtEmail" type="email" />
        </div>
      </body></html>`;
      await page.goto(html);

      const action = {
        type: 'fill',
        target: '#non_existent_email_input',
        selector: '#non_existent_email_input',
        value: 'rahul@example.com'
      };

      const step = {
        field: 'contact.email',
        semanticTarget: 'contact.email',
        stepIndex: 2
      };

      const error = new Error('Element missing: Target element was not found in the DOM (count is 0)');
      const classified = recoveryEngine.classifyFailure(error);
      expect(classified.type).toBe(FailureClass.ELEMENT_MISSING);

      const result = await recoveryEngine.recover({
        page,
        action,
        error,
        step,
        executeActionFn: async (act) => {
          if (act.resolvedLocator) {
            await act.resolvedLocator.fill(act.value);
          }
        }
      });

      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryLevel.RE_RESOLVE_LOCATOR);
      expect(result.log.failure.type).toBe(FailureClass.ELEMENT_MISSING);

      const val = await page.inputValue('#txtEmail');
      expect(val).toBe('rahul@example.com');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. TIMEOUT
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 3: Timeout', () => {
    it('should classify timeout and recover on retry when element settles', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><body>
        <input id="asyncInput" type="text" style="display:none;" />
        <script>
          setTimeout(() => {
            document.getElementById('asyncInput').style.display = 'block';
          }, 50);
        </script>
      </body></html>`;
      await page.goto(html);

      const action = {
        type: 'fill',
        target: '#asyncInput',
        selector: '#asyncInput',
        value: '+919876543210'
      };

      const step = { field: 'contact.phone', stepIndex: 3 };
      const timeoutError = new Error('TimeoutError: locator.waitFor: Timeout 1000ms exceeded');

      const classified = recoveryEngine.classifyFailure(timeoutError);
      expect(classified.type).toBe(FailureClass.TIMEOUT);

      const result = await recoveryEngine.recover({
        page,
        action,
        error: timeoutError,
        step,
        executeActionFn: async (act) => {
          const locator = page.locator(act.target);
          await locator.waitFor({ state: 'visible', timeout: 2000 });
          await locator.fill(act.value);
        }
      });

      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryLevel.RETRY_SAME_ACTION);
      expect(result.log.failure.type).toBe(FailureClass.TIMEOUT);
      expect(await page.inputValue('#asyncInput')).toBe('+919876543210');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. NAVIGATION FAILURE
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 4: Navigation Failure', () => {
    it('should classify navigation failure and recover via session reload / navigation retry', async () => {
      const targetUrl = 'data:text/html,<!DOCTYPE html><html><body><h1>Loaded Successfully</h1></body></html>';
      const action = {
        type: 'navigate',
        target: targetUrl,
        url: targetUrl
      };

      const step = { url: targetUrl, expectedUrl: 'Loaded', stepIndex: 0 };
      const navError = new Error('Navigation failed: net::ERR_CONNECTION_RESET at target');

      const classified = recoveryEngine.classifyFailure(navError);
      expect(classified.type).toBe(FailureClass.NAVIGATION_FAILURE);

      let attemptsCount = 0;
      const result = await recoveryEngine.recover({
        page,
        action,
        error: navError,
        step,
        executeActionFn: async (act) => {
          attemptsCount++;
          if (attemptsCount >= 1) {
            await page.goto(act.url);
          }
        }
      });

      expect(result.recovered).toBe(true);
      expect(result.log.failure.type).toBe(FailureClass.NAVIGATION_FAILURE);
      expect(await page.textContent('h1')).toContain('Loaded Successfully');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. SESSION EXPIRED
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 5: Session Expired', () => {
    it('should classify session expiration and recover via page refresh/re-hydration', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><body>
        <div id="status">Active Portal</div>
        <input id="tokenInput" type="text" />
      </body></html>`;
      await page.goto(html);

      const action = {
        type: 'fill',
        target: '#tokenInput',
        value: 'active_session_token'
      };

      const step = { field: 'sessionToken', stepIndex: 4 };
      const sessionError = new Error('Session expired: 401 Unauthorized, login required or CSRF token expired');

      const classified = recoveryEngine.classifyFailure(sessionError);
      expect(classified.type).toBe(FailureClass.SESSION_EXPIRED);

      let refreshed = false;
      const mockPage = {
        reload: jest.fn().mockImplementation(async () => {
          refreshed = true;
        }),
        waitForTimeout: jest.fn().mockResolvedValue(true),
        waitForLoadState: jest.fn().mockResolvedValue(true)
      };

      recoveryEngine.actionVerifier = {
        verify: jest.fn().mockImplementation(async () => {
          return { passed: refreshed };
        })
      };

      const result = await recoveryEngine.recover({
        page: mockPage,
        action,
        error: sessionError,
        step,
        executeActionFn: async () => {}
      });

      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryLevel.REFRESH_SESSION);
      expect(result.log.failure.type).toBe(FailureClass.SESSION_EXPIRED);
      expect(refreshed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. UNEXPECTED MODAL
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 6: Unexpected Modal', () => {
    it('should classify unexpected modal and recover via Level 4 adaptive reasoning dismissing overlay', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><body>
        <div id="mainForm">
          <button id="submitBtn" onclick="window.clicked=true">Submit Form</button>
        </div>
        <!-- Blocking Overlay Modal -->
        <div id="cookieModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5);">
          <button class="close" onclick="this.parentElement.remove()">Accept All</button>
        </div>
      </body></html>`;
      await page.goto(html);

      const action = {
        type: 'click',
        target: '#submitBtn',
        selector: '#submitBtn'
      };

      const step = { stepIndex: 5, field: 'submitBtn' };
      const modalError = new Error('unexpected modal: <div id="cookieModal"> intercepts pointer events; another element would receive the click');

      const classified = recoveryEngine.classifyFailure(modalError);
      expect(classified.type).toBe(FailureClass.UNEXPECTED_MODAL);

      const result = await recoveryEngine.recover({
        page,
        action,
        error: modalError,
        step,
        executeActionFn: async (act) => {
          const modalCount = await page.locator('#cookieModal').count();
          if (modalCount === 0) {
            await page.click(act.target);
          } else {
            throw modalError;
          }
        }
      });

      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryLevel.ADAPTIVE_REASONING);
      expect(result.log.failure.type).toBe(FailureClass.UNEXPECTED_MODAL);

      const wasClicked = await page.evaluate(() => window.clicked);
      expect(wasClicked).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. VALIDATION FAILURE & DATA INVARIANT
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 7: Validation Failure & Data Invariant', () => {
    it('should classify validation failure, enforce immutable user data, and escalate to Human Checkpoint without silent data mutation', async () => {
      const originalUserIncome = '₹500000';
      const action = {
        type: 'fill',
        target: '#income',
        value: originalUserIncome
      };

      const step = { field: 'financial.annualIncome', stepIndex: 6 };
      const valError = new Error('Validation failure: format constraint violated for annualIncome');

      const classified = recoveryEngine.classifyFailure(valError);
      expect(classified.type).toBe(FailureClass.VALIDATION_FAILURE);

      recoveryEngine.actionVerifier = {
        verify: jest.fn().mockResolvedValue({ passed: false, error: 'VALIDATION_FAILURE' })
      };

      const result = await recoveryEngine.recover({
        page,
        action,
        error: valError,
        step,
        executeActionFn: async () => {}
      });

      expect(result.recovered).toBe(false);
      expect(result.strategy).toBe(RecoveryLevel.HUMAN_CHECKPOINT);
      expect(result.checkpoint).toBeDefined();
      expect(result.checkpoint.pauseReason).toBe('MANUAL_REVIEW');

      expect(action.value).toBe(originalUserIncome);
      expect(result.log.dataModified).toBe(false);
    });

    it('should throw DataInvariantViolation if user data was tampered with during recovery', async () => {
      const action = {
        type: 'fill',
        target: '#email',
        value: 'original_user_email@example.com'
      };

      const step = { field: 'contact.email', stepIndex: 7 };

      await expect(
        recoveryEngine.recover({
          page,
          action,
          error: new Error('validation failure: invalid format'),
          step,
          executeActionFn: async (act) => {
            act.value = 'tampered_fake_email@example.com';
          }
        })
      ).rejects.toThrow('DataInvariantViolation: Recovery must never modify user data silently');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. UPLOAD REJECTION
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 8: Upload Rejection', () => {
    it('should classify upload rejection and immediately create a Human Checkpoint for manual review', async () => {
      const action = {
        type: 'upload',
        target: 'input[type="file"]',
        value: 'invalid_format.exe'
      };

      const step = { field: 'documentUpload', stepIndex: 8 };
      const uploadError = new Error('Upload rejected: file type not supported or exceeds portal size limit');

      const classified = recoveryEngine.classifyFailure(uploadError);
      expect(classified.type).toBe(FailureClass.UPLOAD_REJECTION);

      const result = await recoveryEngine.recover({
        page,
        action,
        error: uploadError,
        step
      });

      expect(result.recovered).toBe(false);
      expect(result.strategy).toBe(RecoveryLevel.HUMAN_CHECKPOINT);
      expect(result.checkpoint.pauseReason).toBe('MANUAL_REVIEW');
      expect(result.checkpoint.fieldName).toBe('input[type="file"]');
      expect(result.log.failure.type).toBe(FailureClass.UPLOAD_REJECTION);
      expect(result.log.result).toBe(RecoveryResultStatus.CHECKPOINT_CREATED);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. PAGE CHANGED
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 9: Page Changed', () => {
    it('should classify page changed and recover by re-observing settled state and locator re-resolution', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><body>
        <div id="stepContainer">
          <input id="step2Input" type="text" />
        </div>
      </body></html>`;
      await page.goto(html);

      const action = {
        type: 'fill',
        target: '#step1Input',
        value: 'Bengaluru'
      };

      const step = { field: 'address.city', semanticTarget: 'address.city', stepIndex: 9 };
      const pageChangedError = new Error('page changed: stale element reference, DOM changed dynamically');

      const classified = recoveryEngine.classifyFailure(pageChangedError);
      expect(classified.type).toBe(FailureClass.PAGE_CHANGED);

      recoveryEngine.locatorResolver = {
        resolveLocator: jest.fn().mockResolvedValue({
          found: true,
          element: page.locator('#step2Input'),
          strategy: 'SEMANTIC_RELATIONSHIP',
          confidence: 0.95
        })
      };

      const result = await recoveryEngine.recover({
        page,
        action,
        error: pageChangedError,
        step,
        executeActionFn: async () => {}
      });

      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryLevel.RE_RESOLVE_LOCATOR);
      expect(result.log.failure.type).toBe(FailureClass.PAGE_CHANGED);
      expect(await page.inputValue('#step2Input')).toBe('Bengaluru');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. BROWSER CRASH
  // ─────────────────────────────────────────────────────────────
  describe('Failure Class 10: Browser Crash', () => {
    it('should classify browser crash and recover session via BrowserManager', async () => {
      const action = {
        type: 'fill',
        target: '#studentId',
        value: 'STU_9948'
      };

      const step = { field: 'studentId', stepIndex: 10 };
      const crashError = new Error('TargetClosedError: Target page, context or browser has been closed. Browser crash detected.');

      const classified = recoveryEngine.classifyFailure(crashError);
      expect(classified.type).toBe(FailureClass.BROWSER_CRASH);

      const revivedPage = await browser.newPage();
      await revivedPage.setContent('<input id="studentId" type="text" />');

      recoveryEngine.browserManager = {
        recoverSession: jest.fn().mockResolvedValue({
          page: revivedPage,
          contextId: 'ctx_recovered'
        })
      };

      const result = await recoveryEngine.recover({
        page: null,
        action,
        error: crashError,
        step,
        executeActionFn: async (act) => {
          await revivedPage.fill(act.target, act.value);
        }
      });

      expect(result.recovered).toBe(true);
      expect(result.strategy).toBe(RecoveryLevel.REFRESH_SESSION);
      expect(result.log.failure.type).toBe(FailureClass.BROWSER_CRASH);
      expect(await revivedPage.inputValue('#studentId')).toBe('STU_9948');

      await revivedPage.close();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 11. RECOVERY LOOPS & MAXIMUM ATTEMPTS
  // ─────────────────────────────────────────────────────────────
  describe('11. Recovery Loops & Maximum Attempts', () => {
    it('should break recovery loops and escalate when identical strategy fails repeatedly', async () => {
      const action = { type: 'click', target: '#stuckButton' };
      const step = { stepIndex: 11, field: 'stuckButton' };
      const persistentError = new Error('Persistent timeout waiting for selector');

      let executionCount = 0;
      const result = await recoveryEngine.recover({
        page,
        action,
        error: persistentError,
        step,
        executeActionFn: async () => {
          executionCount++;
          throw persistentError;
        }
      });

      expect(result.recovered).toBe(false);
      expect(result.strategy).toBe(RecoveryLevel.HUMAN_CHECKPOINT);
      expect(result.attempts).toBeLessThanOrEqual(6);

      const auditLog = recoveryEngine.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(1);
      const strategies = auditLog.map(l => l.strategy);
      expect(strategies).toContain(RecoveryLevel.RETRY_SAME_ACTION);
      expect(strategies).toContain(RecoveryLevel.HUMAN_CHECKPOINT);
    });

    it('should strictly respect maximum attempts limit and halt cleanly', async () => {
      const strictEngine = new MultiLevelRecoveryEngine({ maxAttempts: 2 });
      const action = { type: 'click', target: '#doomedBtn' };
      const step = { stepIndex: 12 };
      const error = new Error('Element missing');

      const result = await strictEngine.recover({
        page,
        action,
        error,
        step,
        executeActionFn: async () => {
          throw error;
        }
      });

      expect(result.recovered).toBe(false);
      expect(result.strategy).toBe(RecoveryLevel.HUMAN_CHECKPOINT);
      expect(result.attempts).toBeLessThanOrEqual(3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 12. LOGGING COMPLIANCE & CANONICAL CONTRACT
  // ─────────────────────────────────────────────────────────────
  describe('12. Structured Recovery Logging Compliance', () => {
    it('should record originalAction, failure, strategy, result, attempt, and duration conforming to canonical schema', async () => {
      const html = `data:text/html,<!DOCTYPE html><html><body><input id="testField" type="text" /></body></html>`;
      await page.goto(html);

      const action = {
        type: 'fill',
        target: '#testField',
        value: 'LogVerification'
      };

      const step = { field: 'testField', stepIndex: 13 };

      const result = await recoveryEngine.recover({
        page,
        action,
        error: new Error('TimeoutError waiting for element'),
        step,
        executeActionFn: async (act) => {
          await page.fill(act.target, act.value);
        }
      });

      expect(result.recovered).toBe(true);
      const auditLog = recoveryEngine.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);

      const lastEntry = auditLog[auditLog.length - 1];

      expect(lastEntry.originalAction).toBeDefined();
      expect(lastEntry.originalAction.type).toBe('fill');
      expect(lastEntry.originalAction.value).toBe('LogVerification');

      expect(lastEntry.failure).toBeDefined();
      expect(lastEntry.failure.type).toBe(FailureClass.TIMEOUT);

      expect(lastEntry.strategy).toBe(RecoveryLevel.RETRY_SAME_ACTION);
      expect(lastEntry.result).toBe(RecoveryResultStatus.SUCCESS);
      expect(lastEntry.attempt).toBeGreaterThanOrEqual(1);
      expect(lastEntry.duration).toBeGreaterThanOrEqual(0);
      expect(lastEntry.dataModified).toBe(false);

      const validation = validateRecoveryRecord(lastEntry);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});
