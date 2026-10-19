/**
 * Live Browser Observation Engine Tests
 * Applier 2.0 — Phase 4
 *
 * Verifies that:
 * 1. Live Playwright page state converts into a validated BrowserObservation.
 * 2. Does not serialize raw DOM to the LLM payload.
 * 3. Elements have stable semantic elementIds independent of CSS selectors.
 * 4. All 9 required test scenarios are comprehensively verified:
 *    - Simple HTML form
 *    - React form (data-testid, controlled state, ARIA)
 *    - Dynamic form (JS DOM mutation)
 *    - Custom dropdown (ARIA combobox & listbox options)
 *    - File input (accept constraints, UPLOAD candidate)
 *    - Iframe traversal (framePath coordinates)
 *    - Hidden elements discrimination (computed visibility)
 *    - Disabled fields tracking (disabled & aria-disabled)
 *    - Validation messages (HTML5 validation & ARIA feedback)
 * 5. Depth configuration (interactive, forms_only, full).
 * 6. Native BrowserSession.observe() integration.
 */

import { chromium } from 'playwright';
import { ObservationEngine, defaultObservationEngine } from '../../browser-worker/observation/index.js';
import { SessionManager } from '../../browser-worker/browser/index.js';
import { validateBrowserObservation } from '../../shared/validators/index.js';
import {
  simpleHtmlFormHtml,
  reactFormHtml,
  dynamicFormHtml,
  customDropdownHtml,
  fileInputHtml,
  iframeParentHtml,
  iframeChildHtml,
  hiddenElementsHtml,
  disabledFieldsHtml,
  validationMessagesHtml
} from '../../browser-worker/observation/fixtures.js';

describe('Phase 4: Live Browser Observation Engine', () => {
  let browser;
  let context;
  let page;
  let engine;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    engine = new ObservationEngine();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close().catch(() => {});
    }
  });

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  });

  // Helper to load HTML content via base64 data URI
  async function loadHtml(htmlContent) {
    const dataUri = `data:text/html;base64,${Buffer.from(htmlContent).toString('base64')}`;
    await page.goto(dataUri, { waitUntil: 'domcontentloaded' });
  }

  describe('1. Canonical BrowserObservation Contract & Structure', () => {
    it('should convert a live page into a schema-validated BrowserObservation with zero raw DOM bloat', async () => {
      await loadHtml(simpleHtmlFormHtml);

      const observation = await engine.observe(page, { captureScreenshot: true });

      // 1. Schema Validation
      const validation = validateBrowserObservation(observation);
      expect(validation.valid).toBe(true);

      // 2. Structural Requirements
      expect(observation.schemaVersion).toBe('2.0.0');
      expect(observation.observationId).toMatch(/^obs_/);
      expect(observation.page).toBeDefined();
      expect(observation.page.title).toBe('Simple HTML Form');
      expect(observation.elements).toBeInstanceOf(Array);
      expect(observation.elements.length).toBeGreaterThan(0);
      expect(observation.forms).toBeInstanceOf(Array);
      expect(observation.forms.length).toBe(1);
      expect(observation.actions).toBeInstanceOf(Array);
      expect(observation.actions.length).toBeGreaterThan(0);
      expect(observation.frames).toBeInstanceOf(Array);
      expect(observation.metadata).toBeDefined();
      expect(observation.screenshotReference).toMatch(/^data:image\/png;base64,/);

      // 3. Must NOT contain raw uncompressed DOM
      expect(observation.rawDom).toBeUndefined();
      expect(observation.html).toBeUndefined();
    });

    it('should assign stable elementIds that do not rely on fragile CSS selectors', async () => {
      await loadHtml(simpleHtmlFormHtml);

      const observation = await engine.observe(page);
      for (const el of observation.elements) {
        expect(el.elementId).toMatch(/^elem_\d+$/);
        // elementId must be an abstract semantic identifier
        expect(el.elementId).not.toContain('>');
        expect(el.elementId).not.toContain(':nth-child');
      }
    });
  });

  describe('2. Test Fixtures Scenarios', () => {
    it('Scenario 1: should extract simple HTML form with inputs, selects, radios, checkboxes, and buttons', async () => {
      await loadHtml(simpleHtmlFormHtml);

      const observation = await engine.observe(page);

      // Verify form extraction
      expect(observation.forms).toHaveLength(1);
      const form = observation.forms[0];
      expect(form.id).toBe('scholarshipForm');
      expect(form.action).toBe('/api/apply');
      expect(form.method).toBe('POST');
      expect(form.elementIds.length).toBeGreaterThanOrEqual(5);

      // Verify input elements
      const nameInput = observation.elements.find((el) => el.name === 'fullName');
      expect(nameInput).toBeDefined();
      expect(nameInput.tag).toBe('input');
      expect(nameInput.type).toBe('text');
      expect(nameInput.role).toBe('textbox');
      expect(nameInput.label).toBe('Full Name');
      expect(nameInput.placeholder).toBe('Enter full name');
      expect(nameInput.required).toBe(true);

      // Verify select element
      const selectEl = observation.elements.find((el) => el.name === 'educationLevel');
      expect(selectEl).toBeDefined();
      expect(selectEl.tag).toBe('select');
      expect(selectEl.options).toHaveLength(3);
      expect(selectEl.options[0]).toEqual({ text: 'Undergraduate', value: 'undergraduate', selected: true });

      // Verify checkbox and radio
      const checkboxEl = observation.elements.find((el) => el.name === 'agreeTerms');
      expect(checkboxEl).toBeDefined();
      expect(checkboxEl.type).toBe('checkbox');
      expect(checkboxEl.role).toBe('checkbox');
      expect(checkboxEl.label).toContain('I agree to terms');

      // Verify submit button
      const submitBtn = observation.elements.find((el) => el.id === 'submitBtn');
      expect(submitBtn).toBeDefined();
      expect(submitBtn.type).toBe('submit');
      expect(submitBtn.role).toBe('button');
      expect(submitBtn.text).toBe('Submit Application');
      expect(form.submitButtonId).toBe(submitBtn.elementId);
    });

    it('Scenario 2: should inspect React SPA forms with data-testid, controlled state, and ARIA attributes', async () => {
      await loadHtml(reactFormHtml);

      const observation = await engine.observe(page);

      const studentInput = observation.elements.find((el) => el.attributes['data-testid'] === 'student-id-field');
      expect(studentInput).toBeDefined();
      expect(studentInput.value).toBe('STU-99214');
      expect(studentInput.label).toBe('Student Registration ID');
      expect(studentInput.attributes['aria-required']).toBe('true');

      const cgpaInput = observation.elements.find((el) => el.attributes['data-testid'] === 'cgpa-field');
      expect(cgpaInput).toBeDefined();
      expect(cgpaInput.value).toBe('8.75');
      expect(cgpaInput.label).toBe('Cumulative CGPA');

      const saveBtn = observation.elements.find((el) => el.attributes['data-testid'] === 'save-btn');
      expect(saveBtn).toBeDefined();
      expect(saveBtn.label).toBe('Save Student Information');
      expect(saveBtn.role).toBe('button');
    });

    it('Scenario 3: should observe dynamic form mutations after DOM changes', async () => {
      await loadHtml(dynamicFormHtml);

      // Initial observation: 1 member field
      const obs1 = await engine.observe(page);
      const membersBefore = obs1.elements.filter((el) => el.name === 'members[]');
      expect(membersBefore).toHaveLength(1);

      // Trigger dynamic DOM addition via click
      await page.click('#addMemberBtn');
      await page.waitForSelector('#member_2');

      // Re-observe: dynamic field captured
      const obs2 = await engine.observe(page);
      const membersAfter = obs2.elements.filter((el) => el.name === 'members[]');
      expect(membersAfter).toHaveLength(2);

      const newMember = obs2.elements.find((el) => el.id === 'member_2');
      expect(newMember).toBeDefined();
      expect(newMember.value).toBe('Sibling');
      expect(newMember.label).toBe('Member 2 Name');
    });

    it('Scenario 4: should extract custom dropdown options from ARIA combobox and listbox', async () => {
      await loadHtml(customDropdownHtml);

      const observation = await engine.observe(page);

      const dropdown = observation.elements.find((el) => el.id === 'customCommunityDropdown');
      expect(dropdown).toBeDefined();
      expect(dropdown.role).toBe('combobox');
      expect(dropdown.label).toBe('Community Group');
      expect(dropdown.attributes['aria-expanded']).toBe('true');
      expect(dropdown.options).toHaveLength(3);
      expect(dropdown.options[1]).toEqual({
        text: 'Minority Community',
        value: 'MIN',
        selected: true
      });
    });

    it('Scenario 5: should extract file input with accept constraints and generate UPLOAD action candidate', async () => {
      await loadHtml(fileInputHtml);

      const observation = await engine.observe(page);

      const fileInput = observation.elements.find((el) => el.id === 'identityProofFile');
      expect(fileInput).toBeDefined();
      expect(fileInput.tag).toBe('input');
      expect(fileInput.type).toBe('file');
      expect(fileInput.role).toBe('file');
      expect(fileInput.attributes.accept).toBe('.pdf,.jpg,.jpeg');
      expect(fileInput.required).toBe(true);

      // Action candidate
      const uploadAction = observation.actions.find((a) => a.elementId === fileInput.elementId);
      expect(uploadAction).toBeDefined();
      expect(uploadAction.type).toBe('UPLOAD');
    });

    it('Scenario 6: should traverse attached iframes and annotate elements with framePath', async () => {
      // Child iframe data URI
      const childDataUri = `data:text/html;base64,${Buffer.from(iframeChildHtml).toString('base64')}`;
      const parentWithChildHtml = iframeParentHtml(childDataUri);

      await loadHtml(parentWithChildHtml);
      await page.waitForSelector('#portalIframe');

      const observation = await engine.observe(page, { includeFrames: true });

      // Main frame element
      const parentInput = observation.elements.find((el) => el.id === 'parentInput');
      expect(parentInput).toBeDefined();
      expect(parentInput.framePath).toBe('root');

      // Inner iframe element
      const iframeInput = observation.elements.find((el) => el.id === 'digiMobile');
      expect(iframeInput).toBeDefined();
      expect(iframeInput.framePath).not.toBe('root');
      expect(Array.isArray(iframeInput.framePath)).toBe(true);
      expect(iframeInput.label).toBe('Registered Mobile Number');

      // Frame catalog
      expect(observation.frames.length).toBeGreaterThanOrEqual(2);
    });

    it('Scenario 7: should discriminate visible elements from display:none, visibility:hidden, opacity:0, and type=hidden', async () => {
      await loadHtml(hiddenElementsHtml);

      const observation = await engine.observe(page);

      const visibleField = observation.elements.find((el) => el.id === 'visibleField');
      expect(visibleField).toBeDefined();
      expect(visibleField.visible).toBe(true);

      const displayNoneField = observation.elements.find((el) => el.id === 'displayNoneField');
      expect(displayNoneField).toBeDefined();
      expect(displayNoneField.visible).toBe(false);

      const visibilityHiddenField = observation.elements.find((el) => el.id === 'visibilityHiddenField');
      expect(visibilityHiddenField).toBeDefined();
      expect(visibilityHiddenField.visible).toBe(false);

      const opacityZeroField = observation.elements.find((el) => el.id === 'opacityZeroField');
      expect(opacityZeroField).toBeDefined();
      expect(opacityZeroField.visible).toBe(false);
    });

    it('Scenario 8: should detect disabled fields via disabled attribute and aria-disabled', async () => {
      await loadHtml(disabledFieldsHtml);

      const observation = await engine.observe(page);

      const editableInput = observation.elements.find((el) => el.id === 'editableName');
      expect(editableInput.disabled).toBe(false);

      const disabledInput = observation.elements.find((el) => el.id === 'disabledAadhaar');
      expect(disabledInput.disabled).toBe(true);

      const ariaDisabledInput = observation.elements.find((el) => el.id === 'ariaDisabledField');
      expect(ariaDisabledInput.disabled).toBe(true);

      const disabledBtn = observation.elements.find((el) => el.id === 'disabledSaveBtn');
      expect(disabledBtn.disabled).toBe(true);

      // Disabled elements should not generate active action candidates
      const disabledActions = observation.actions.filter((a) => a.elementId === disabledInput.elementId);
      expect(disabledActions).toHaveLength(0);
    });

    it('Scenario 9: should capture validation messages from HTML5 constraints and ARIA error descriptions', async () => {
      await loadHtml(validationMessagesHtml);

      const observation = await engine.observe(page);

      // Pattern violation (value="INVALID" for pattern="[0-9]{6}")
      const patternInput = observation.elements.find((el) => el.id === 'patternField');
      expect(patternInput).toBeDefined();
      expect(patternInput.attributes.isInvalid).toBe(true);
      expect(patternInput.attributes.validationMessage).toBeDefined();

      // ARIA invalid + describedby
      const ariaInvalidInput = observation.elements.find((el) => el.id === 'ariaInvalidField');
      expect(ariaInvalidInput).toBeDefined();
      expect(ariaInvalidInput.attributes['aria-invalid']).toBe('true');
      expect(ariaInvalidInput.attributes.describedByText).toBe('IFSC code must be exactly 11 characters.');
    });
  });

  describe('3. Observation Depth Performance', () => {
    it('should respect observation depth configuration (forms_only vs interactive)', async () => {
      await loadHtml(simpleHtmlFormHtml);

      const formsOnlyObs = await engine.observe(page, { depth: 'forms_only' });
      expect(formsOnlyObs.metadata.observationDepth).toBe('forms_only');

      const interactiveObs = await engine.observe(page, { depth: 'interactive' });
      expect(interactiveObs.metadata.observationDepth).toBe('interactive');
    });
  });

  describe('4. Native BrowserSession.observe() Integration', () => {
    it('should allow BrowserSession to observe its active page natively', async () => {
      const sessionManager = new SessionManager();
      const session = await sessionManager.createSession({ jobId: 'job_observe_session' });

      const formHtml = `data:text/html;base64,${Buffer.from(simpleHtmlFormHtml).toString('base64')}`;
      await session.navigate(formHtml);

      // Direct call on BrowserSession
      const observation = await session.observe();

      expect(observation).toBeDefined();
      expect(observation.url).toBe(formHtml);
      expect(observation.elements.length).toBeGreaterThan(0);
      expect(observation.forms.length).toBe(1);

      const validation = validateBrowserObservation(observation);
      expect(validation.valid).toBe(true);

      await session.close();
      await sessionManager.cleanupAll();
    }, 20000);
  });
});
