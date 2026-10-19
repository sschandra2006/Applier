/**
 * Runtime Semantic Locator Resolution Test Suite — Jest / Playwright
 * Applier 2.0 — Phase 9
 *
 * Verifies that:
 * 1. Semantic targets replace brittle CSS selectors as primary form field identity.
 * 2. 9-strategy resolution priority order:
 *    1. accessible role/name
 *    2. label
 *    3. semantic relationship
 *    4. placeholder
 *    5. name
 *    6. stable test ID
 *    7. stable DOM attributes
 *    8. CSS
 *    9. XPath only as last resort
 * 3. All 8 required test scenarios are comprehensively verified:
 *    - normal label
 *    - different label
 *    - custom input
 *    - custom dropdown
 *    - React form
 *    - dynamic IDs
 *    - nested elements
 *    - iframe
 * 4. Failure mode returns LOCATOR_NOT_FOUND without guessing silently.
 * 5. Output conforms strictly to canonical runtime-locator contract.
 */

import { chromium } from 'playwright';
import {
  RuntimeLocatorResolver,
  defaultRuntimeLocatorResolver
} from '../../browser-worker/locator/runtime-locator.resolver.js';
import {
  normalLabelHtml,
  differentLabelHtml,
  customInputHtml,
  customDropdownHtml,
  reactFormHtml,
  dynamicIdsHtml,
  nestedElementsHtml,
  iframeHtml
} from '../../browser-worker/locator/fixtures.js';
import { LocatorStrategy } from '../../shared/enums/index.js';
import { validateRuntimeLocator } from '../../shared/validators/index.js';

describe('Applier 2.0 — Phase 9: Runtime Semantic Locator Resolution', () => {
  let browser;
  let context;
  let page;
  let resolver;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    resolver = new RuntimeLocatorResolver({ timeout: 2000 });
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
    if (context) {
      await context.close().catch(() => {});
    }
  });

  describe('1. Normal Label Resolution', () => {
    it('should resolve standard full name and email inputs via ACCESSIBLE_ROLE_NAME or LABEL', async () => {
      await page.setContent(normalLabelHtml);

      const nameRes = await resolver.resolveLocator(page, 'applicant.fullName');
      expect(nameRes.found).toBe(true);
      expect([LocatorStrategy.ACCESSIBLE_ROLE_NAME, LocatorStrategy.LABEL]).toContain(nameRes.strategy);
      expect(nameRes.confidence).toBeGreaterThanOrEqual(0.95);
      expect(nameRes.element).toBeDefined();

      // Test fill interaction
      await nameRes.element.fill('Rahul Kumar');
      expect(await page.locator('#applicant_full_name').inputValue()).toBe('Rahul Kumar');

      const emailRes = await resolver.resolveLocator(page, 'applicant.email');
      expect(emailRes.found).toBe(true);
      expect([LocatorStrategy.ACCESSIBLE_ROLE_NAME, LocatorStrategy.LABEL]).toContain(emailRes.strategy);
      expect(emailRes.confidence).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('2. Different Label (Synonyms & Alternative Wording)', () => {
    it('should resolve differently worded candidate legal name and mobile contact labels', async () => {
      await page.setContent(differentLabelHtml);

      const nameRes = await resolver.resolveLocator(page, 'applicant.fullName');
      expect(nameRes.found).toBe(true);
      expect([LocatorStrategy.ACCESSIBLE_ROLE_NAME, LocatorStrategy.LABEL]).toContain(nameRes.strategy);
      expect(nameRes.evidence).toMatch(/legal/i);

      const phoneRes = await resolver.resolveLocator(page, 'applicant.phone');
      expect(phoneRes.found).toBe(true);
      expect(phoneRes.confidence).toBeGreaterThanOrEqual(0.80);

      await resolver.resolveAndFill(page, 'applicant.fullName', 'Rahul Kumar');
      expect(await page.locator('#legal_cand_name').inputValue()).toBe('Rahul Kumar');
    });
  });

  describe('3. Custom Input (ARIA Role & Contenteditable)', () => {
    it('should resolve custom contenteditable div with role="textbox" and aria-labelledby', async () => {
      await page.setContent(customInputHtml);

      const emailRes = await resolver.resolveLocator(page, 'applicant.email');
      expect(emailRes.found).toBe(true);
      expect(emailRes.strategy).toBe(LocatorStrategy.ACCESSIBLE_ROLE_NAME);
      expect(emailRes.metadata.role).toBe('textbox');
      expect(emailRes.metadata.isEditable).toBe(true);

      // Verify custom fill action
      await resolver.resolveAndFill(page, 'applicant.email', 'rahul@example.com');
      const text = await page.locator('#custom_email_input').textContent();
      expect(text).toBe('rahul@example.com');

      const incomeRes = await resolver.resolveLocator(page, 'financial.annualIncome');
      expect(incomeRes.found).toBe(true);
      expect(incomeRes.strategy).toBe(LocatorStrategy.ACCESSIBLE_ROLE_NAME);
    });
  });

  describe('4. Custom Dropdown (ARIA Combobox)', () => {
    it('should resolve custom dropdown div with role="combobox" and aria-labelledby', async () => {
      await page.setContent(customDropdownHtml);

      const genderRes = await resolver.resolveLocator(page, 'applicant.gender');
      expect(genderRes.found).toBe(true);
      expect(genderRes.strategy).toBe(LocatorStrategy.ACCESSIBLE_ROLE_NAME);
      expect(genderRes.metadata.role).toBe('combobox');
      expect(genderRes.confidence).toBe(0.99);
    });
  });

  describe('5. React Controlled Form', () => {
    it('should resolve React form inputs using data-testid, label, and autocomplete', async () => {
      await page.setContent(reactFormHtml);

      const phoneRes = await resolver.resolveLocator(page, 'applicant.phone');
      expect(phoneRes.found).toBe(true);
      expect(phoneRes.confidence).toBeGreaterThanOrEqual(0.90);

      const collegeRes = await resolver.resolveLocator(page, 'education.college');
      expect(collegeRes.found).toBe(true);
      expect(collegeRes.confidence).toBeGreaterThanOrEqual(0.90);

      await collegeRes.element.fill('NIT Trichy');
      expect(await page.locator('#react-college').inputValue()).toBe('NIT Trichy');
    });
  });

  describe('6. Dynamic IDs (Resilience Against Generated Random IDs)', () => {
    it('should locate fields without relying on dynamic/hashed random IDs like :r1:', async () => {
      await page.setContent(dynamicIdsHtml);

      const dobRes = await resolver.resolveLocator(page, 'applicant.dateOfBirth');
      expect(dobRes.found).toBe(true);
      // Resolves via label, accessible name, or autocomplete, avoiding brittle id selector
      expect([LocatorStrategy.ACCESSIBLE_ROLE_NAME, LocatorStrategy.LABEL, LocatorStrategy.STABLE_DOM_ATTRIBUTES]).toContain(dobRes.strategy);
      expect(dobRes.confidence).toBeGreaterThanOrEqual(0.85);

      const aadhaarRes = await resolver.resolveLocator(page, 'identity.aadhaarNumber');
      expect(aadhaarRes.found).toBe(true);
      expect([LocatorStrategy.ACCESSIBLE_ROLE_NAME, LocatorStrategy.LABEL, LocatorStrategy.PLACEHOLDER]).toContain(aadhaarRes.strategy);
    });
  });

  describe('7. Nested Elements (Deep Fieldsets, Tables & Cards)', () => {
    it('should locate deeply nested father and mother inputs inside fieldsets and tables', async () => {
      await page.setContent(nestedElementsHtml);

      const fatherRes = await resolver.resolveLocator(page, 'family.fatherName');
      expect(fatherRes.found).toBe(true);
      expect([LocatorStrategy.ACCESSIBLE_ROLE_NAME, LocatorStrategy.LABEL, LocatorStrategy.SEMANTIC_RELATIONSHIP]).toContain(fatherRes.strategy);
      expect(fatherRes.confidence).toBeGreaterThanOrEqual(0.90);

      const motherRes = await resolver.resolveLocator(page, 'family.motherName');
      expect(motherRes.found).toBe(true);
      expect([LocatorStrategy.ACCESSIBLE_ROLE_NAME, LocatorStrategy.LABEL, LocatorStrategy.SEMANTIC_RELATIONSHIP]).toContain(motherRes.strategy);

      await fatherRes.element.fill('Suresh Kumar');
      expect(await page.locator('#nested_father_name').inputValue()).toBe('Suresh Kumar');
    });
  });

  describe('8. Iframe Resolution (Cross-Frame Traversal)', () => {
    it('should locate input elements across iframe boundaries and record framePath', async () => {
      await page.setContent(iframeHtml);

      // Wait for iframe document to be ready
      await page.waitForSelector('iframe');

      const dobRes = await resolver.resolveLocator(page, 'applicant.dateOfBirth');
      expect(dobRes.found).toBe(true);
      expect(dobRes.framePath).toBeDefined();
      expect(dobRes.confidence).toBeGreaterThanOrEqual(0.85);

      const pinRes = await resolver.resolveLocator(page, 'address.pincode');
      expect(pinRes.found).toBe(true);
      expect(pinRes.framePath).toBeDefined();
    });
  });

  describe('9. Failure Mode (LOCATOR_NOT_FOUND without Silent Guessing)', () => {
    it('should return LOCATOR_NOT_FOUND when semantic target is absent from the page', async () => {
      await page.setContent(normalLabelHtml); // Only has full name and email

      // Look for College/University which does not exist on this page
      const missingRes = await resolver.resolveLocator(page, 'education.college');

      expect(missingRes.found).toBe(false);
      expect(missingRes.strategy).toBe(LocatorStrategy.LOCATOR_NOT_FOUND);
      expect(missingRes.confidence).toBe(0.0);
      expect(missingRes.element).toBeNull();
      expect(missingRes.error).toBe('LOCATOR_NOT_FOUND');
      expect(missingRes.evidence).toContain('No reliable locator found');
    });

    it('should reject unverified targets with LOCATOR_NOT_FOUND without guessing an arbitrary input', async () => {
      await page.setContent(normalLabelHtml);

      const unverifiedRes = await resolver.resolveLocator(page, 'financial.annualIncome');
      expect(unverifiedRes.found).toBe(false);
      expect(unverifiedRes.strategy).toBe(LocatorStrategy.LOCATOR_NOT_FOUND);
      expect(unverifiedRes.element).toBeNull();
    });
  });

  describe('10. Resolution Order Priority Verification', () => {
    it('should prioritize ACCESSIBLE_ROLE_NAME / LABEL over CSS and XPath', async () => {
      // HTML has accessible label, name, and css
      await page.setContent(normalLabelHtml);

      const res = await resolver.resolveLocator(page, 'applicant.fullName');
      expect(res.strategy).not.toBe(LocatorStrategy.CSS);
      expect(res.strategy).not.toBe(LocatorStrategy.XPATH);
      expect([LocatorStrategy.ACCESSIBLE_ROLE_NAME, LocatorStrategy.LABEL]).toContain(res.strategy);
    });
  });

  describe('11. Canonical Schema Validation', () => {
    it('should produce resolution results strictly conforming to runtime-locator canonical schema', async () => {
      await page.setContent(normalLabelHtml);

      const res = await resolver.resolveLocator(page, 'applicant.fullName');
      expect(res.canonicalPayload).toBeDefined();

      const validation = validateRuntimeLocator(res.canonicalPayload);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});
