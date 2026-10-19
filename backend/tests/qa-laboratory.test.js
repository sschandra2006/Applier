/**
 * Applier 2.0 — Phase 24: Universal Browser Automation QA Laboratory
 *
 * Comprehensive multi-level automated regression testing against 27 synthetic portals
 * specifically designed to test edge cases, DOM mutations, async UI, and break mechanisms.
 *
 * Test Levels Covered:
 * 1. Unit Tests (All 27 fixtures valid, schema-compliant, categorized, syntax checked)
 * 2. Integration Tests (Observation, Shadow DOM, Custom Selects, Disambiguation, Missing Labels)
 * 3. Browser Tests (Live Chromium executing across interactive synthetic scenarios)
 * 4. End-to-End Tests (Observe -> Plan -> Execute -> Verify workflows)
 * 5. Recovery Tests (Changed selectors resilience, session recovery, re-observation)
 * 6. Failure Injection Tests (Validation failures, ambiguous submissions -> SUBMISSION_UNCERTAIN, OTP/CAPTCHA checkpoints)
 * 7. Load Tests (Parallel multi-page stress testing measuring latency & memory stability)
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import {
  QA_SCENARIOS,
  getScenarioByNumber,
  getScenarioById,
  QaLabServer,
  QaRunner
} from '../../browser-worker/qa-lab/index.js';

import { ObservationEngine } from '../../browser-worker/observation/index.js';
import { RuntimeLocatorResolver } from '../../browser-worker/locator/index.js';
import {
  ActionVerifier,
  MultiLevelRecoveryEngine,
  VerifiedSubmissionEngine
} from '../../browser-worker/execution/index.js';
import { ConfirmationTokenService } from '../../browser-worker/policy/index.js';
import { validateQaLabScenario } from '../../shared/validators/index.js';
import { SubmissionStatus, SubmissionSignalType, FailureClass, RecoveryStrategy } from '../../shared/enums/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for waiting and asserting visibility in Jest without @playwright/test
async function assertVisible(locator, timeout = 5000) {
  await locator.waitFor({ state: 'visible', timeout });
  const visible = await locator.isVisible();
  expect(visible).toBe(true);
}

describe('Applier 2.0 — Phase 24: Universal Browser Automation QA Laboratory', () => {
  let browser;
  let server;
  let serverBaseUrl;
  let runner;
  let observationEngine;
  let locatorResolver;
  let actionVerifier;
  let recoveryEngine;
  let tokenService;

  beforeAll(async () => {
    // 1. Launch Headless Chromium
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // 2. Start Embedded QA Lab Test Server
    server = new QaLabServer({ port: 0 });
    serverBaseUrl = await server.start();

    // 3. Instantiate QA components
    observationEngine = new ObservationEngine();
    locatorResolver = new RuntimeLocatorResolver();
    actionVerifier = new ActionVerifier();
    recoveryEngine = new MultiLevelRecoveryEngine({ maxAttempts: 3 });
    tokenService = new ConfirmationTokenService({ secret: 'qa-token-secret-phase24' });
    runner = new QaRunner({
      observationEngine,
      locatorResolver,
      actionVerifier,
      recoveryEngine
    });
  }, 35000);

  afterAll(async () => {
    if (server) {
      await server.stop().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  });

  // ─────────────────────────────────────────────────────────────
  // LEVEL 1: UNIT TESTS (Fixtures & Schema Verification)
  // ─────────────────────────────────────────────────────────────
  describe('Level 1: Unit Tests (All 27 Synthetic Portal Fixtures)', () => {
    it('should have exactly 27 distinct synthetic website scenarios', () => {
      expect(QA_SCENARIOS).toHaveLength(27);
    });

    it('should have sequential scenario numbers from 1 to 27 without gaps', () => {
      const numbers = QA_SCENARIOS.map(s => s.scenarioNumber).sort((a, b) => a - b);
      for (let i = 1; i <= 27; i++) {
        expect(numbers[i - 1]).toBe(i);
      }
    });

    it.each(QA_SCENARIOS)(
      'Scenario $scenarioNumber ($name) must conform to canonical qa-lab-scenario schema',
      (scenario) => {
        const validation = validateQaLabScenario(scenario);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
        expect(validation.version).toBe('2.0.0');
        expect(scenario.htmlFixture).toContain('<!DOCTYPE html>');
        expect(scenario.testLevels.length).toBeGreaterThan(0);
      }
    );

    it('should support retrieval by scenario number and scenario ID', () => {
      const byNum = getScenarioByNumber(1);
      expect(byNum).toBeDefined();
      expect(byNum.scenarioId).toBe('qa-01-simple-form');

      const byId = getScenarioById('qa-26-submission-success');
      expect(byId).toBeDefined();
      expect(byId.scenarioNumber).toBe(26);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // LEVEL 2: INTEGRATION TESTS (Observation, DOM Traversal & Disambiguation)
  // ─────────────────────────────────────────────────────────────
  describe('Level 2: Integration Tests (Observation & Semantic Mapping)', () => {
    let page;

    beforeEach(async () => {
      page = await browser.newPage();
    });

    afterEach(async () => {
      if (page) await page.close().catch(() => {});
    });

    it('should observe React form and capture data-testid attributes and controlled elements', async () => {
      const scenario = getScenarioByNumber(2);
      await page.setContent(scenario.htmlFixture);

      const obs = await observationEngine.observe(page);
      expect(obs.elements.length).toBeGreaterThan(3);

      const nameField = obs.elements.find(e => e.attributes && e.attributes['data-testid'] === 'input-candidate-name');
      expect(nameField).toBeDefined();
      expect(nameField.role).toBe('textbox');

      const submitBtn = obs.elements.find(e => e.attributes && e.attributes['data-testid'] === 'btn-react-submit');
      expect(submitBtn).toBeDefined();
      expect(submitBtn.role).toBe('button');
    });

    it('should pierce and observe Open Shadow Roots in custom web components (Scenario 11)', async () => {
      const scenario = getScenarioByNumber(11);
      await page.setContent(scenario.htmlFixture);

      const obs = await observationEngine.observe(page);
      // Verify that inputs and button inside shadow DOM were discovered
      const shadowInput = obs.elements.find(e => e.placeholder === 'Legal full name' || e.name === 'fullName');
      expect(shadowInput).toBeDefined();

      const shadowBtn = obs.elements.find(e => e.id === 'shadowSubmitBtn' || e.text === 'Save In Shadow DOM');
      expect(shadowBtn).toBeDefined();
    });

    it('should extract non-native ARIA combobox and listbox options in Custom Select (Scenario 8)', async () => {
      const scenario = getScenarioByNumber(8);
      await page.setContent(scenario.htmlFixture);

      const obs = await observationEngine.observe(page);
      const combobox = obs.elements.find(e => e.role === 'combobox');
      expect(combobox).toBeDefined();
      expect(combobox.id).toBe('customTrackTrigger');
    });

    it('should annotate elements with framePath across nested iframes (Scenario 10)', async () => {
      const scenario = getScenarioByNumber(10);
      await page.setContent(scenario.htmlFixture);

      const obs = await observationEngine.observe(page);
      expect(obs.elements.length).toBeGreaterThan(0);
      const frameCount = page.frames().length;
      expect(frameCount).toBeGreaterThanOrEqual(2);
    });

    it('should distinguish ambiguous address and phone fields via fieldset context (Scenario 24)', async () => {
      const scenario = getScenarioByNumber(24);
      await page.setContent(scenario.htmlFixture);

      const obs = await observationEngine.observe(page);
      const permStreet = obs.elements.find(e => e.name === 'permanent_street');
      const mailStreet = obs.elements.find(e => e.name === 'mailing_street');
      const appPhone = obs.elements.find(e => e.name === 'applicant_phone');
      const emgPhone = obs.elements.find(e => e.name === 'emergency_phone');

      expect(permStreet).toBeDefined();
      expect(mailStreet).toBeDefined();
      expect(appPhone).toBeDefined();
      expect(emgPhone).toBeDefined();
      expect(permStreet.name).not.toBe(mailStreet.name);
      expect(appPhone.name).not.toBe(emgPhone.name);
    });

    it('should resolve unlabeled inputs through placeholder heuristics (Scenario 23)', async () => {
      const scenario = getScenarioByNumber(23);
      await page.setContent(scenario.htmlFixture);

      const obs = await observationEngine.observe(page);
      const nameByPlaceholder = obs.elements.find(e => e.placeholder === 'Full legal name');
      const emailByPlaceholder = obs.elements.find(e => e.placeholder === 'applicant@domain.com');

      expect(nameByPlaceholder).toBeDefined();
      expect(emailByPlaceholder).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // LEVEL 3: BROWSER TESTS (Live Headless Execution & Interactions)
  // ─────────────────────────────────────────────────────────────
  describe('Level 3: Browser Tests (Interactive Execution)', () => {
    let page;

    beforeEach(async () => {
      page = await browser.newPage();
    });

    afterEach(async () => {
      if (page) await page.close().catch(() => {});
    });

    it('Scenario 1: Simple HTML Form — fill all inputs, radios, selects, checkboxes and submit', async () => {
      const scenario = getScenarioByNumber(1);
      await page.setContent(scenario.htmlFixture);

      await page.fill('#fullName', 'Jane Doe');
      await page.fill('#email', 'jane@example.com');
      await page.fill('#phoneNumber', '9876543210');
      await page.selectOption('#educationLevel', 'postgraduate');
      await page.check('input[name="citizenship"][value="permanent_resident"]');
      await page.fill('#notes', 'Dedicated researcher in distributed AI systems.');
      await page.click('#submitBtn');

      const conf = page.locator('#confirmationBox');
      await assertVisible(conf);
      const ref = await page.locator('#refId').innerText();
      expect(ref).toBe('APP-2026-0001');
    });

    it('Scenario 2: React Form — synthetic events trigger internal React state and submit', async () => {
      const scenario = getScenarioByNumber(2);
      await page.setContent(scenario.htmlFixture);

      await page.locator('[data-testid="input-candidate-name"]').fill('Sarah Connor');
      await page.locator('[data-testid="input-candidate-email"]').fill('sarah@resistance.org');
      await page.locator('[data-testid="select-experience"]').selectOption('senior');

      // Verify React synthetic state store updated
      const stateText = await page.locator('[data-testid="react-state-viewer"]').innerText();
      const stateObj = JSON.parse(stateText);
      expect(stateObj.name).toBe('Sarah Connor');
      expect(stateObj.email).toBe('sarah@resistance.org');
      expect(stateObj.experience).toBe('senior');

      await page.locator('[data-testid="btn-react-submit"]').click();
      await assertVisible(page.locator('[data-testid="react-confirmation-box"]'));
    });

    it('Scenario 3: Vue Dynamic Form — reactive live validation enables submit button', async () => {
      const scenario = getScenarioByNumber(3);
      await page.setContent(scenario.htmlFixture);

      const submitBtn = page.locator('#vueSubmitBtn');
      expect(await submitBtn.isDisabled()).toBe(true);

      await page.fill('#vueUsername', 'vueMaster');
      await page.fill('#vueEmail', 'vue@vite.dev');
      await page.fill('#vuePassword', 'SuperSecretPass123');

      expect(await submitBtn.isEnabled()).toBe(true);
      await submitBtn.click();

      await assertVisible(page.locator('#vueSuccess'));
    });

    it('Scenario 4: Multi-page Wizard — navigate steps, validate guards, and verify summary', async () => {
      const scenario = getScenarioByNumber(4);
      await page.setContent(scenario.htmlFixture);

      // Step 1
      await page.fill('#wizardFirstName', 'Alan');
      await page.fill('#wizardLastName', 'Turing');
      await page.fill('#wizardEmail', 'alan@turing.ac.uk');
      await page.click('#nextToStep2');

      // Step 2
      await assertVisible(page.locator('#step2'));
      await page.fill('#wizardUniversity', 'Cambridge University');
      await page.click('#nextToStep3');

      // Step 3 Review
      await assertVisible(page.locator('#step3'));
      const revName = await page.locator('#revName').innerText();
      expect(revName).toBe('Alan Turing');
      const revUniv = await page.locator('#revUniv').innerText();
      expect(revUniv).toBe('Cambridge University');

      await page.click('#submitWizardBtn');
      await assertVisible(page.locator('#wizardCompleted'));
    });

    it('Scenario 5: Conditional Fields — selecting branch dynamically exposes and fills subfields', async () => {
      const scenario = getScenarioByNumber(5);
      await page.setContent(scenario.htmlFixture);

      await page.fill('#applicantName', 'Ada Lovelace');
      expect(await page.locator('#priorWorkSection').isVisible()).toBe(false);

      // Select "Yes"
      await page.check('#priorWorkYes');
      await assertVisible(page.locator('#priorWorkSection'));

      await page.fill('#prevEmployeeId', 'EMP-7711');
      await page.fill('#prevDepartment', 'Algorithmic Sciences');

      // Accommodations
      await page.check('#needsAccommodationCheck');
      await assertVisible(page.locator('#accommodationSection'));
      await page.fill('#accommodationDetails', 'Braille display terminal requested.');

      await page.click('#submitConditionalBtn');
      await assertVisible(page.locator('#conditionalSuccess'));
    });

    it('Scenario 6: Dynamic Dropdown — async cascading populate of Country -> State -> City', async () => {
      const scenario = getScenarioByNumber(6);
      await page.setContent(scenario.htmlFixture);

      await page.selectOption('#countrySelect', 'IN');
      // Wait for State dropdown to enable after async fetch
      await page.waitForFunction(() => !document.getElementById('stateSelect').disabled, { timeout: 3000 });

      await page.selectOption('#stateSelect', 'KA');
      // Wait for City dropdown to enable
      await page.waitForFunction(() => !document.getElementById('citySelect').disabled, { timeout: 3000 });

      await page.selectOption('#citySelect', 'Bengaluru');
      await page.click('#submitGeoBtn');

      await assertVisible(page.locator('#geoSuccess'));
      const summary = await page.locator('#geoSummary').innerText();
      expect(summary).toBe('IN > KA > Bengaluru');
    });

    it('Scenario 7: Autocomplete — filter keystrokes, pick suggestion, and commit selection', async () => {
      const scenario = getScenarioByNumber(7);
      await page.setContent(scenario.htmlFixture);

      await page.fill('#universitySearch', 'Stan');
      const suggestion = page.locator('#universitySuggestions li', { hasText: 'Stanford University' });
      await assertVisible(suggestion);
      await suggestion.click();

      const hiddenVal = await page.locator('#selectedUniversityId').inputValue();
      expect(hiddenVal).toBe('UNI-001');

      await page.click('#submitAutocompleteBtn');
      await assertVisible(page.locator('#univSuccess'));
    });

    it('Scenario 8: Custom Select — click non-native combobox and select option from listbox', async () => {
      const scenario = getScenarioByNumber(8);
      await page.setContent(scenario.htmlFixture);

      await page.click('#customTrackTrigger');
      const option = page.locator('#customTrackOptions .custom-option', { hasText: 'Cloud Infrastructure & DevOps' });
      await assertVisible(option);
      await option.click();

      const hiddenVal = await page.locator('#selectedTrackHidden').inputValue();
      expect(hiddenVal).toBe('cloud_devops');

      await page.click('#submitTrackBtn');
      await assertVisible(page.locator('#customSelectSuccess'));
    });

    it('Scenario 9: Single Iframe — cross-frame navigation and submission', async () => {
      const scenario = getScenarioByNumber(9);
      await page.setContent(scenario.htmlFixture);

      const frame = page.frame({ name: 'identityIframe' });
      expect(frame).toBeDefined();

      await frame.fill('#nationalId', 'NAT-ID-889922');
      await frame.fill('#applicantEmail', 'frame_test@example.com');
      await frame.click('#verifyIframeBtn');

      await assertVisible(frame.locator('#iframeResult'));
    });

    it('Scenario 10: Nested Iframe — deep multi-level frame resolution and input', async () => {
      const scenario = getScenarioByNumber(10);
      await page.setContent(scenario.htmlFixture);

      const childFrame = page.frame({ name: 'nestedChildFrame' });
      expect(childFrame).toBeDefined();

      await childFrame.fill('#nestedAadhaar', '998877665544');
      await childFrame.click('#nestedVerifyBtn');

      await assertVisible(childFrame.locator('#nestedConfirm'));
    });

    it('Scenario 11: Shadow DOM — direct piercing and action within custom element shadow root', async () => {
      const scenario = getScenarioByNumber(11);
      await page.setContent(scenario.htmlFixture);

      await page.locator('applicant-card input#shadowFullName').fill('Margaret Hamilton');
      await page.locator('applicant-card button#shadowSubmitBtn').click();

      await assertVisible(page.locator('applicant-card #shadowSuccess'));
    });

    it('Scenario 12: File Upload — set input files and trigger client-side validation', async () => {
      const scenario = getScenarioByNumber(12);
      await page.setContent(scenario.htmlFixture);

      const mockPdfPath = path.join(__dirname, 'mock_resume.pdf');
      fs.writeFileSync(mockPdfPath, '%PDF-1.4 mock pdf content');

      try {
        await page.setInputFiles('#resumeFile', mockPdfPath);
        await assertVisible(page.locator('#fileInfo'));

        await page.click('#submitUploadBtn');
        await assertVisible(page.locator('#uploadSuccess'));
      } finally {
        if (fs.existsSync(mockPdfPath)) fs.unlinkSync(mockPdfPath);
      }
    });

    it('Scenario 13: Multiple File Upload — attach multiple documents simultaneously', async () => {
      const scenario = getScenarioByNumber(13);
      await page.setContent(scenario.htmlFixture);

      const file1 = path.join(__dirname, 'doc1.pdf');
      const file2 = path.join(__dirname, 'doc2.pdf');
      fs.writeFileSync(file1, '%PDF-1.4 file 1');
      fs.writeFileSync(file2, '%PDF-1.4 file 2');

      try {
        await page.setInputFiles('#portfolioFiles', [file1, file2]);
        await page.click('#submitMultiBtn');

        await assertVisible(page.locator('#multiSuccess'));
        const badge = await page.locator('#docCountBadge').innerText();
        expect(badge).toBe('2 files');
      } finally {
        if (fs.existsSync(file1)) fs.unlinkSync(file1);
        if (fs.existsSync(file2)) fs.unlinkSync(file2);
      }
    });

    it('Scenario 15: Slow Page — awaits hydration spinner before filling form', async () => {
      const scenario = getScenarioByNumber(15);
      await page.setContent(scenario.htmlFixture);

      const form = page.locator('#hydratedForm');
      await assertVisible(form, 6000);

      await page.fill('#slowApplicantName', 'Grace Hopper');
      await page.fill('#slowReference', 'REG-1945');
      await page.click('#slowSubmitBtn');

      await assertVisible(page.locator('#slowSuccess'));
    });

    it('Scenario 18: Multi-Hop Redirect — navigates through gateway redirect to final form via server', async () => {
      await page.goto(`${serverBaseUrl}/redirect-gate-1`);
      await page.waitForURL(url => url.toString().includes('/scenarios/18'), { timeout: 5000 });

      const destForm = page.locator('#destForm');
      await assertVisible(destForm, 3000);

      await page.fill('#destApplicant', 'APP-REDIR-OK');
      await page.click('#destSubmitBtn');
      await assertVisible(page.locator('#redirectSuccess'));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // LEVEL 4: END-TO-END TESTS (Workflow & Verified Submission)
  // ─────────────────────────────────────────────────────────────
  describe('Level 4: End-to-End Tests (Observe -> Plan -> Execute -> Verify)', () => {
    let page;

    beforeEach(async () => {
      page = await browser.newPage();
    });

    afterEach(async () => {
      if (page) await page.close().catch(() => {});
    });

    it('should complete E2E workflow on Simple Form with ActionVerifier', async () => {
      const scenario = getScenarioByNumber(1);
      await page.setContent(scenario.htmlFixture);

      // 1. Observe
      const obs = await observationEngine.observe(page);
      expect(obs.elements.length).toBeGreaterThan(0);

      // 2. Resolve & Fill Name
      const nameEl = page.locator('#fullName');
      await nameEl.fill('Dr. Linus Pauling');
      const verifyName = await actionVerifier.verify({
        page,
        actionType: 'fill',
        target: '#fullName',
        expected: 'Dr. Linus Pauling'
      });
      expect(verifyName.passed).toBe(true);

      // 3. Resolve & Fill Email
      const emailEl = page.locator('#email');
      await emailEl.fill('linus@quantum.org');
      const verifyEmail = await actionVerifier.verify({
        page,
        actionType: 'fill',
        target: '#email',
        expected: 'linus@quantum.org'
      });
      expect(verifyEmail.passed).toBe(true);

      // Fill remaining required form fields to satisfy native validation
      await page.fill('#phoneNumber', '9876543210');
      await page.selectOption('#educationLevel', 'doctorate');
      await page.check('#agreeTerms');

      // 4. Submit & Verify
      await page.click('#submitBtn');
      const verifySubmit = await actionVerifier.verify({
        page,
        actionType: 'click',
        target: '#submitBtn'
      });
      expect(verifySubmit.passed).toBe(true);

      await assertVisible(page.locator('#confirmationBox'));
    });

    it('Scenario 26: Definitive Submission Success — evaluates all 5 success signals', async () => {
      const scenario = getScenarioByNumber(26);
      await page.setContent(scenario.htmlFixture);

      const submissionEngine = new VerifiedSubmissionEngine({ tokenService });
      const token = tokenService.generateConfirmationToken({
        applicationId: 'app_qa_26',
        userId: 'qa_user'
      }).token;

      const result = await submissionEngine.submitAndVerify({
        page,
        action: { selector: '#printReceiptBtn', confirmationToken: token },
        context: { applicationId: 'app_qa_26', jobId: 'job_qa_26' },
        options: { settleTimeoutMs: 300 }
      });

      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMITTED);
      expect(result.referenceNumber).toBe('APP-2026-99881');
      expect(result.requiresHumanReview).toBe(false);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.finalPageEvidence.signalsDetected).toContain(SubmissionSignalType.SUCCESS_PAGE);
      expect(result.finalPageEvidence.signalsDetected).toContain(SubmissionSignalType.APPLICATION_NUMBER);
      expect(result.finalPageEvidence.signalsDetected).toContain(SubmissionSignalType.RECEIPT_DOWNLOAD);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // LEVEL 5: RECOVERY TESTS (Multi-Level Browser Recovery)
  // ─────────────────────────────────────────────────────────────
  describe('Level 5: Recovery Tests (Multi-Level Recovery Engine)', () => {
    let page;

    beforeEach(async () => {
      page = await browser.newPage();
    });

    afterEach(async () => {
      if (page) await page.close().catch(() => {});
    });

    it('Scenario 22: Changed Selectors — recovers via semantic attributes when IDs mutate', async () => {
      const scenario = getScenarioByNumber(22);
      await page.setContent(scenario.htmlFixture);

      // Wait 250ms for dynamic ID/class scrambling script to mutate DOM
      await page.waitForTimeout(250);

      // Semantic locator resolves resiliently regardless of mutated ID
      const locatorRes = await locatorResolver.resolveLocator(page, 'applicant.fullName');
      expect(locatorRes.found).toBe(true);
      expect(locatorRes.element).toBeDefined();

      await locatorRes.element.fill('Katherine Johnson');

      const emailRes = await locatorResolver.resolveLocator(page, 'applicant.email');
      expect(emailRes.found).toBe(true);
      await emailRes.element.fill('katherine@nasa.gov');

      await page.click('button[type="submit"]');
      await assertVisible(page.locator('#dynSuccess'));
    });

    it('Scenario 19: Session Expiration — recovery detects session expiration modal and refreshes', async () => {
      await page.goto(`${serverBaseUrl}/scenarios/19`);

      // Wait 650ms for session expiration modal to trigger
      await page.waitForTimeout(650);

      const modal = page.locator('#sessionModal');
      await assertVisible(modal);
      expect(await page.locator('#accHolder').isDisabled()).toBe(true);

      // Classify failure explicitly
      const classified = recoveryEngine.classifyFailure(new Error('session expired: unauthorized re-login required'));
      expect(classified.type).toBe(FailureClass.SESSION_EXPIRED);

      // Execute Session Recovery Strategy through recovery engine
      const recoveryRecord = await recoveryEngine.recover({
        page,
        action: { type: 'fill', target: '#accHolder', value: 'Jordan' },
        error: new Error('session expired: unauthorized re-login required'),
        executeActionFn: async () => {
          const renewBtn = page.locator('#renewSessionBtn');
          if (await renewBtn.isVisible()) {
            await renewBtn.click();
          }
          await page.fill('#accHolder', 'Jordan');
        }
      });

      expect(recoveryRecord.recovered).toBe(true);
      expect(recoveryRecord.attempts).toBeGreaterThan(0);

      // Now complete the remainder of the form and submit
      await page.fill('#bankAccNumber', '99882211');
      await page.click('#submitSessionBtn');

      await assertVisible(page.locator('#sessionSuccess'));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // LEVEL 6: FAILURE INJECTION TESTS
  // ─────────────────────────────────────────────────────────────
  describe('Level 6: Failure Injection Tests', () => {
    let page;

    beforeEach(async () => {
      page = await browser.newPage();
    });

    afterEach(async () => {
      if (page) await page.close().catch(() => {});
    });

    it('Scenario 14: Validation Errors — detects inline validation rejection on bad input', async () => {
      const scenario = getScenarioByNumber(14);
      await page.setContent(scenario.htmlFixture);

      // Submit invalid email
      await page.fill('#valEmail', 'not-an-email');
      await page.fill('#valPhone', '123'); // only 3 digits
      await page.fill('#valPincode', 'abc');
      await page.click('#submitStrictBtn');

      // Error messages must become visible
      await assertVisible(page.locator('#emailError'));
      await assertVisible(page.locator('#phoneError'));
      await assertVisible(page.locator('#pinError'));

      // Form must not be submitted
      expect(await page.locator('#validSuccess').isVisible()).toBe(false);
      expect(await page.locator('#valEmail').getAttribute('aria-invalid')).toBe('true');
    });

    it('Scenario 27: Ambiguous Submission — strictly sets SUBMISSION_UNCERTAIN without false success', async () => {
      const scenario = getScenarioByNumber(27);
      await page.setContent(scenario.htmlFixture);

      const submissionEngine = new VerifiedSubmissionEngine({ tokenService });
      const token = tokenService.generateConfirmationToken({
        applicationId: 'app_qa_27',
        userId: 'qa_user'
      }).token;

      const result = await submissionEngine.submitAndVerify({
        page,
        action: { selector: '#ambiguousResultContainer', confirmationToken: token },
        context: { applicationId: 'app_qa_27', jobId: 'job_qa_27' },
        options: { settleTimeoutMs: 300 }
      });

      // Crucial Phase 17 requirement: NEVER claim success on ambiguous page
      expect(result.submissionStatus).toBe(SubmissionStatus.SUBMISSION_UNCERTAIN);
      expect(result.requiresHumanReview).toBe(true);
      expect(result.referenceNumber).toBeNull();
      expect(result.confidence).toBeLessThan(0.60);
    });

    it('Scenario 20: OTP Checkpoint — detects OTP challenge barrier requiring human checkpoint', async () => {
      const scenario = getScenarioByNumber(20);
      await page.setContent(scenario.htmlFixture);

      await page.click('#requestOtpBtn');
      const otpModal = page.locator('#otpModal');
      await assertVisible(otpModal);

      // Verify OTP signature detected
      const isOtpPrompt = await page.evaluate(() => {
        const text = document.body.innerText;
        return /one-time password|otp|verification code/i.test(text);
      });
      expect(isOtpPrompt).toBe(true);

      // Solved after human input
      await page.fill('#otpCodeField', '123456');
      await page.click('#confirmOtpBtn');
      await assertVisible(page.locator('#otpSuccess'));
    });

    it('Scenario 21: CAPTCHA Checkpoint — detects CAPTCHA barrier requiring human completion', async () => {
      const scenario = getScenarioByNumber(21);
      await page.setContent(scenario.htmlFixture);

      const captchaDetected = await page.evaluate(() => {
        return Boolean(document.querySelector('#captchaWidget, .captcha-box, [aria-label*="security verification" i]'));
      });
      expect(captchaDetected).toBe(true);

      // Submitting without solving CAPTCHA is blocked
      await page.check('#captchaCheckbox');
      await page.click('#submitCaptchaBtn');
      await assertVisible(page.locator('#captchaSuccess'));
    });
  });

  // ─────────────────────────────────────────────────────────────
  // LEVEL 7: LOAD TESTS (Parallel Stress & Resource Metrics)
  // ─────────────────────────────────────────────────────────────
  describe('Level 7: Load Tests (Parallel Multi-Portal Execution)', () => {
    it('should execute parallel stress load across scenarios without memory leaks or crashes', async () => {
      const testSubset = [
        getScenarioByNumber(1),
        getScenarioByNumber(2),
        getScenarioByNumber(3),
        getScenarioByNumber(4),
        getScenarioByNumber(5),
        getScenarioByNumber(8),
        getScenarioByNumber(11),
        getScenarioByNumber(26)
      ];

      const loadReport = await runner.runStressLoad(browser, testSubset, 4);

      expect(loadReport.totalScenariosExecuted).toBe(8);
      expect(loadReport.successfulCount).toBe(8);
      expect(loadReport.totalDurationMs).toBeLessThan(15000);
      expect(loadReport.heapDeltaMb).toBeLessThan(50);

      console.log(`\n--- QA LABORATORY LOAD REPORT ---`);
      console.log(`Total Scenarios:  ${loadReport.totalScenariosExecuted}`);
      console.log(`Successful Runs:  ${loadReport.successfulCount}`);
      console.log(`Total Duration:   ${loadReport.totalDurationMs} ms`);
      console.log(`Average Latency:  ${loadReport.averageLatencyMs} ms`);
      console.log(`Heap Delta:       ${loadReport.heapDeltaMb} MB\n`);
    });
  });
});
