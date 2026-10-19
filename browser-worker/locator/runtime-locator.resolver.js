/**
 * Runtime Semantic Locator Resolution Engine
 * Applier 2.0 — Phase 9
 *
 * Resolves live browser form elements using Semantic Targets rather than
 * brittle CSS selectors.
 *
 * Strict Resolution Order (Strongest to Weakest):
 * 1. ACCESSIBLE_ROLE_NAME (getByRole + accessible name)
 * 2. LABEL (getByLabel / label association)
 * 3. SEMANTIC_RELATIONSHIP (fieldset/legend, section container, nearby text)
 * 4. PLACEHOLDER (getByPlaceholder)
 * 5. NAME (name attribute / portal conventions)
 * 6. STABLE_TEST_ID (data-testid, data-test, data-cy)
 * 7. STABLE_DOM_ATTRIBUTES (autocomplete, data-* semantic attributes)
 * 8. CSS (Synthesized resilient structural CSS)
 * 9. XPATH (Contextual relative XPath as last resort)
 *
 * Failure Mode:
 * If no reliable locator exists -> returns LOCATOR_NOT_FOUND. Never guess silently.
 */

import crypto from 'crypto';
import { LocatorStrategy } from '../../shared/enums/index.js';
import { validateRuntimeLocator } from '../../shared/validators/index.js';

/**
 * Semantic Target Specifications with Multi-Strategy Patterns
 */
export const SEMANTIC_LOCATOR_SPECS = {
  'applicant.fullName': {
    accessibleRoles: ['textbox', 'searchbox'],
    accessibleNames: [
      /full\s*name/i,
      /applicant\s*name/i,
      /candidate\s*name/i,
      /legal\s*name/i,
      /your\s*name/i,
      /name\s*of\s*applicant/i,
      /name\s*of\s*candidate/i,
      /\bname\b/i
    ],
    labels: [
      /full\s*name/i,
      /applicant\s*name/i,
      /candidate'?s?\s*legal\s*name/i,
      /candidate\s*name/i,
      /legal\s*name/i,
      /official\s*name/i,
      /name\s*of\s*applicant/i,
      /\bname\b/i
    ],
    relationshipContainers: [/personal\s*details/i, /basic\s*details/i, /applicant\s*particulars/i],
    placeholders: [/enter.*full.*name/i, /official.*name/i, /your.*name/i, /\bname\b/i],
    names: [
      'fullname',
      'full_name',
      'cand_name',
      'appl_name',
      'txt_name',
      'txt_cand_name',
      'applicant_name',
      'name'
    ],
    testIds: ['input-applicant-fullname', 'input-applicant-name', 'applicant-fullname', 'full-name'],
    autocompletes: ['name', 'given-name'],
    fallbackCss: [
      'input[name*="fullname" i]',
      'input[name*="cand" i]',
      'input[name*="appl" i]',
      'input[id*="fullname" i]'
    ],
    xpathHints: [
      "//label[contains(translate(text(), 'FN', 'fn'), 'full name')]/following::input[1]",
      "//label[contains(translate(text(), 'NAME', 'name'), 'name')]/following::input[1]"
    ]
  },
  'applicant.firstName': {
    accessibleRoles: ['textbox'],
    accessibleNames: [/first\s*name/i, /given\s*name/i, /\bfname\b/i],
    labels: [/first\s*name/i, /given\s*name/i],
    relationshipContainers: [/personal/i, /applicant/i],
    placeholders: [/first\s*name/i],
    names: ['fname', 'firstname', 'first_name', 'txt_fname'],
    testIds: ['input-first-name', 'first-name'],
    autocompletes: ['given-name'],
    fallbackCss: ['input[name*="fname" i]', 'input[name*="firstname" i]'],
    xpathHints: ["//label[contains(translate(text(), 'FN', 'fn'), 'first name')]/following::input[1]"]
  },
  'applicant.lastName': {
    accessibleRoles: ['textbox'],
    accessibleNames: [/last\s*name/i, /surname/i, /family\s*name/i],
    labels: [/last\s*name/i, /surname/i, /family\s*name/i],
    relationshipContainers: [/personal/i, /applicant/i],
    placeholders: [/last\s*name/i, /surname/i],
    names: ['lname', 'lastname', 'last_name', 'surname', 'txt_lname'],
    testIds: ['input-last-name', 'last-name', 'surname'],
    autocompletes: ['family-name'],
    fallbackCss: ['input[name*="lname" i]', 'input[name*="lastname" i]'],
    xpathHints: ["//label[contains(translate(text(), 'LN', 'ln'), 'last name')]/following::input[1]"]
  },
  'applicant.email': {
    accessibleRoles: ['textbox'],
    accessibleNames: [/email/i, /e-mail/i, /mail\s*address/i, /email\s*address/i],
    labels: [/email\s*address/i, /email/i, /e-mail/i, /mail\s*id/i],
    relationshipContainers: [/contact/i, /communication/i],
    placeholders: [/email/i, /name@example\.com/i, /@/],
    names: ['email', 'email_id', 'emailaddress', 'user_email', 'txt_email', 'mail_id', 'mail'],
    testIds: ['input-applicant-email', 'applicant-email', 'email', 'user-email'],
    autocompletes: ['email'],
    fallbackCss: ['input[type="email"]', 'input[name*="email" i]', '[data-field-type="email"]'],
    xpathHints: ["//label[contains(translate(text(), 'EMAIL', 'email'), 'email')]/following::input[1]"]
  },
  'applicant.phone': {
    accessibleRoles: ['textbox'],
    accessibleNames: [/mobile/i, /phone/i, /contact\s*no/i, /mobile\s*phone/i, /cell/i],
    labels: [/mobile\s*phone/i, /mobile\s*contact/i, /mobile\s*number/i, /phone\s*number/i, /mobile/i, /phone/i],
    relationshipContainers: [/contact/i, /communication/i],
    placeholders: [/10.*digit/i, /mobile/i, /phone/i, /9876543210/],
    names: ['mobile', 'phone', 'contact', 'mob_no', 'mobile_no', 'txt_mob', 'phone_number', 'cell_no'],
    testIds: ['input-applicant-phone', 'applicant-phone', 'mobile-phone', 'phone'],
    autocompletes: ['tel', 'tel-national'],
    fallbackCss: ['input[type="tel"]', 'input[name*="mob" i]', 'input[name*="phone" i]'],
    xpathHints: ["//label[contains(translate(text(), 'MOB', 'mob'), 'mob')]/following::input[1]"]
  },
  'applicant.dateOfBirth': {
    accessibleRoles: ['textbox', 'spinbutton', 'combobox'],
    accessibleNames: [/date\s*of\s*birth/i, /dob/i, /birth\s*date/i, /born\s*on/i],
    labels: [/date\s*of\s*birth/i, /dob/i, /birth\s*date/i],
    relationshipContainers: [/personal/i, /identity/i],
    placeholders: [/dd\/mm\/yyyy/i, /yyyy-mm-dd/i, /dob/i, /birth/i],
    names: ['dob', 'dateofbirth', 'date_of_birth', 'birth_date', 'txt_dob', 'birth_dt', 'dob_d'],
    testIds: ['input-applicant-dob', 'applicant-dob', 'date-of-birth', 'dob'],
    autocompletes: ['bday', 'bday-day', 'bday-month', 'bday-year'],
    fallbackCss: ['input[type="date"]', 'input[name*="dob" i]', 'input[id*="dob" i]'],
    xpathHints: ["//label[contains(translate(text(), 'DOB', 'dob'), 'dob')]/following::input[1]"]
  },
  'applicant.gender': {
    accessibleRoles: ['combobox', 'radiogroup', 'radio', 'listbox', 'button'],
    accessibleNames: [/gender/i, /sex/i, /select\s*gender/i],
    labels: [/gender/i, /sex/i],
    relationshipContainers: [/personal/i, /identity/i],
    placeholders: [/select\s*gender/i, /gender/i],
    names: ['gender', 'sex', 'cbo_gender', 'ddl_gender', 'gen'],
    testIds: ['input-applicant-gender', 'gender-select', 'gender'],
    autocompletes: ['sex'],
    fallbackCss: ['select[name*="gender" i]', 'div[role="combobox"][id*="gender" i]', '#custom-gender-select'],
    xpathHints: ["//span[contains(translate(text(), 'GENDER', 'gender'), 'gender')]/following::div[@role='combobox'][1]"]
  },
  'family.fatherName': {
    accessibleRoles: ['textbox'],
    accessibleNames: [/father/i, /father'?s?\s*full\s*name/i, /father'?s?\s*name/i, /parent'?s?\s*name/i, /guardian/i],
    labels: [/father'?s?\s*full\s*name/i, /father'?s?\s*name/i, /parent'?s?\s*name/i, /guardian'?s?\s*name/i, /\bfather\b/i],
    relationshipContainers: [/parent/i, /family/i, /guardian/i],
    placeholders: [/father/i, /guardian/i, /parent/i],
    names: ['father_name', 'fname', 'fat_name', 'fath_name', 'parent_name', 'guardian_name', 'txt_father'],
    testIds: ['input-father-name', 'father-name', 'guardian-name'],
    autocompletes: [],
    fallbackCss: ['input[name*="father" i]', 'input[id*="father" i]'],
    xpathHints: ["//label[contains(translate(text(), 'FATHER', 'father'), 'father')]/following::input[1]"]
  },
  'family.motherName': {
    accessibleRoles: ['textbox'],
    accessibleNames: [/mother/i, /mother'?s?\s*full\s*name/i, /mother'?s?\s*name/i],
    labels: [/mother'?s?\s*full\s*name/i, /mother'?s?\s*name/i, /\bmother\b/i],
    relationshipContainers: [/parent/i, /family/i],
    placeholders: [/mother/i],
    names: ['mother_name', 'mot_name', 'moth_name', 'txt_mother'],
    testIds: ['input-mother-name', 'mother-name'],
    autocompletes: [],
    fallbackCss: ['input[name*="mother" i]', 'input[id*="mother" i]'],
    xpathHints: ["//label[contains(translate(text(), 'MOTHER', 'mother'), 'mother')]/following::input[1]"]
  },
  'education.college': {
    accessibleRoles: ['textbox', 'combobox'],
    accessibleNames: [/college/i, /university/i, /institute/i, /institution/i, /school/i],
    labels: [/college\s*\/.*university/i, /college/i, /university/i, /institute/i, /school/i],
    relationshipContainers: [/education/i, /academic/i, /qualification/i],
    placeholders: [/institute/i, /college/i, /university/i],
    names: ['college', 'institute', 'university', 'school', 'inst_name', 'coll_name'],
    testIds: ['input-education-college', 'college-name', 'institute-name'],
    autocompletes: [],
    fallbackCss: ['input[name*="college" i]', 'input[name*="inst" i]'],
    xpathHints: ["//label[contains(translate(text(), 'COLLEGE', 'college'), 'college')]/following::input[1]"]
  },
  'financial.annualIncome': {
    accessibleRoles: ['textbox', 'spinbutton', 'combobox'],
    accessibleNames: [/annual\s*family\s*income/i, /annual\s*income/i, /family\s*income/i, /income/i],
    labels: [/annual\s*income/i, /family\s*income/i, /income/i],
    relationshipContainers: [/financial/i, /income/i],
    placeholders: [/income/i, /annual/i],
    names: ['annual_income', 'family_income', 'income', 'ann_inc', 'fam_inc'],
    testIds: ['input-family-income', 'annual-income', 'income'],
    autocompletes: [],
    fallbackCss: ['input[name*="income" i]', '[aria-label*="income" i]'],
    xpathHints: ["//label[contains(translate(text(), 'INCOME', 'income'), 'income')]/following::input[1]"]
  },
  'identity.aadhaarNumber': {
    accessibleRoles: ['textbox'],
    accessibleNames: [/aadhaar/i, /aadhar/i, /uid/i, /unique\s*identity/i],
    labels: [/aadhaar\s*number/i, /aadhaar/i, /aadhar/i, /uid/i],
    relationshipContainers: [/identity/i, /id_proof/i],
    placeholders: [/12.*digit.*aadhaar/i, /aadhaar/i, /aadhar/i],
    names: ['aadhaar', 'aadhar', 'uid', 'aadhaar_no', 'gen_uid_4429'],
    testIds: ['input-aadhaar', 'aadhaar-number'],
    autocompletes: [],
    fallbackCss: ['input[name*="aadhaar" i]', 'input[name*="aadhar" i]'],
    xpathHints: ["//label[contains(translate(text(), 'AADHAAR', 'aadhaar'), 'aadhaar')]/following::input[1]"]
  },
  'address.pincode': {
    accessibleRoles: ['textbox'],
    accessibleNames: [/pincode/i, /pin\s*code/i, /zip\s*code/i, /postal\s*code/i],
    labels: [/pincode\s*\/.*postal/i, /pincode/i, /pin\s*code/i, /zip/i, /postal\s*code/i],
    relationshipContainers: [/address/i, /location/i],
    placeholders: [/pincode/i, /zip/i, /postal/i],
    names: ['pincode', 'pin_code', 'txt_pin', 'zip', 'postal_code'],
    testIds: ['input-pincode', 'pincode', 'postal-code'],
    autocompletes: ['postal-code'],
    fallbackCss: ['input[name*="pin" i]', 'input[autocomplete="postal-code"]'],
    xpathHints: ["//label[contains(translate(text(), 'PIN', 'pin'), 'pin')]/following::input[1]"]
  }
};

export class RuntimeLocatorResolver {
  constructor(options = {}) {
    this.timeout = options.timeout ?? 2000;
  }

  /**
   * Primary entry point: Resolves a semantic target to a live element
   * across the page and its frames using the strict 9-strategy priority order.
   *
   * @param {import('playwright').Page|import('playwright').Frame} rootContext
   * @param {string} semanticTarget e.g. "applicant.fullName"
   * @param {object} options
   */
  async resolveLocator(rootContext, semanticTarget, options = {}) {
    if (!rootContext) {
      throw new Error('RuntimeLocatorResolver: rootContext (Page or Frame) is required.');
    }

    let targetKey = semanticTarget;
    if (!SEMANTIC_LOCATOR_SPECS[targetKey]) {
      if (targetKey.startsWith('contact.')) {
        const alt = `applicant.${targetKey.split('.')[1]}`;
        if (SEMANTIC_LOCATOR_SPECS[alt]) targetKey = alt;
      } else if (targetKey.startsWith('identity.')) {
        const alt = `applicant.${targetKey.split('.')[1]}`;
        if (SEMANTIC_LOCATOR_SPECS[alt]) targetKey = alt;
      }
    }

    const spec = SEMANTIC_LOCATOR_SPECS[targetKey];
    if (!spec) {
      return this._buildFailureResult(
        semanticTarget,
        `Semantic target "${semanticTarget}" is not registered in semantic locator specifications.`
      );
    }

    // 1. First attempt resolution on the rootContext directly
    const rootResult = await this._resolveWithinContext(rootContext, semanticTarget, spec, null, options);
    if (rootResult && rootResult.found) {
      return rootResult;
    }

    // 2. If not found and rootContext is a Page with child frames, search frames
    if (typeof rootContext.frames === 'function') {
      const allFrames = rootContext.frames();
      for (const frame of allFrames) {
        if (frame === rootContext.mainFrame()) continue; // already searched main frame

        const frameName = frame.name() || frame.url() || 'child-frame';
        const frameResult = await this._resolveWithinContext(frame, semanticTarget, spec, frameName, options);
        if (frameResult && frameResult.found) {
          return frameResult;
        }
      }
    }

    // 3. Fallback: If no reliable locator exists, return LOCATOR_NOT_FOUND without guessing
    return this._buildFailureResult(
      semanticTarget,
      `No reliable locator found matching semantic target "${semanticTarget}" across all 9 resolution strategies.`
    );
  }

  /**
   * Executes the 9-strategy resolution order within a specific Page or Frame context.
   */
  async _resolveWithinContext(context, semanticTarget, spec, framePath, options = {}) {
    // ─────────────────────────────────────────────────────────
    // OPTIMIZATION: LEARNED STRATEGY (Website Fingerprint)
    // ─────────────────────────────────────────────────────────
    if (options.learnedLocator && options.learnedLocator.selector && options.learnedLocator.tier !== 'DEPRECATED') {
      try {
        const learned = options.learnedLocator;
        const candidate = context.locator(learned.selector);
        if ((await candidate.count()) > 0) {
          const first = candidate.first();
          if (await this._isInteractive(first)) {
            return await this._buildSuccessResult({
              element: first,
              semanticTarget,
              strategy: learned.strategy || LocatorStrategy.CSS,
              confidence: learned.confidence ?? 0.95,
              evidence: `Matched learned strategy from website fingerprint [Tier: ${learned.tier || 'TRUSTED'}].`,
              selector: learned.selector,
              framePath
            });
          }
        }
      } catch (_) {
        // Stale locator: fall through cleanly to strict 9-strategy resolution
      }
    }

    // ─────────────────────────────────────────────────────────
    // STRATEGY 1: ACCESSIBLE ROLE / NAME (Highest Reliability)
    // ─────────────────────────────────────────────────────────
    for (const role of spec.accessibleRoles || []) {
      for (const namePattern of spec.accessibleNames || []) {
        try {
          const locator = context.getByRole(role, { name: namePattern });
          if ((await locator.count()) > 0) {
            const first = locator.first();
            if (await this._isInteractive(first)) {
              return await this._buildSuccessResult({
                element: first,
                semanticTarget,
                strategy: LocatorStrategy.ACCESSIBLE_ROLE_NAME,
                confidence: 0.99,
                evidence: `Matched accessible role "${role}" with accessible name matching "${namePattern.source}".`,
                selector: `role=${role}[name=${namePattern}]`,
                framePath
              });
            }
          }
        } catch (_) {}
      }
    }

    // ─────────────────────────────────────────────────────────
    // STRATEGY 2: LABEL (getByLabel / <label for="..."> / wrapped label)
    // ─────────────────────────────────────────────────────────
    for (const labelPattern of spec.labels || []) {
      try {
        const locator = context.getByLabel(labelPattern);
        if ((await locator.count()) > 0) {
          const first = locator.first();
          if (await this._isInteractive(first)) {
            return await this._buildSuccessResult({
              element: first,
              semanticTarget,
              strategy: LocatorStrategy.LABEL,
              confidence: 0.95,
              evidence: `Matched form label matching pattern "${labelPattern.source}".`,
              selector: `label=${labelPattern.source}`,
              framePath
            });
          }
        }
      } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────
    // STRATEGY 3: SEMANTIC RELATIONSHIP (fieldset/legend, nearby text)
    // ─────────────────────────────────────────────────────────
    for (const containerPattern of spec.relationshipContainers || []) {
      try {
        const fieldsets = context.locator('fieldset').filter({ hasText: containerPattern });
        if ((await fieldsets.count()) > 0) {
          const targetInputs = fieldsets.first().locator('input, select, textarea, [role="textbox"], [role="combobox"]');
          const count = await targetInputs.count();
          for (let i = 0; i < count; i++) {
            const el = targetInputs.nth(i);
            const textContext = await el.evaluate(node => {
              const label = node.labels?.[0]?.textContent || '';
              const placeholder = node.placeholder || '';
              const name = node.name || '';
              return `${label} ${placeholder} ${name}`.toLowerCase();
            }).catch(() => '');

            const matchesSelf = spec.labels.some(p => p.test(textContext));
            if (matchesSelf && (await this._isInteractive(el))) {
              return await this._buildSuccessResult({
                element: el,
                semanticTarget,
                strategy: LocatorStrategy.SEMANTIC_RELATIONSHIP,
                confidence: 0.90,
                evidence: `Matched within semantic fieldset container "${containerPattern.source}" alongside label context.`,
                selector: `fieldset:has-text("${containerPattern.source}") >> input`,
                framePath
              });
            }
          }
        }
      } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────
    // STRATEGY 4: PLACEHOLDER (getByPlaceholder)
    // ─────────────────────────────────────────────────────────
    for (const placeholderPattern of spec.placeholders || []) {
      try {
        const locator = context.getByPlaceholder(placeholderPattern);
        if ((await locator.count()) > 0) {
          const first = locator.first();
          if (await this._isInteractive(first)) {
            return await this._buildSuccessResult({
              element: first,
              semanticTarget,
              strategy: LocatorStrategy.PLACEHOLDER,
              confidence: 0.85,
              evidence: `Matched placeholder text matching pattern "${placeholderPattern.source}".`,
              selector: `placeholder=${placeholderPattern.source}`,
              framePath
            });
          }
        }
      } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────
    // STRATEGY 5: NAME (name attribute / portal conventions)
    // ─────────────────────────────────────────────────────────
    for (const nameAttr of spec.names || []) {
      try {
        const locator = context.locator(`input[name="${nameAttr}" i], select[name="${nameAttr}" i], textarea[name="${nameAttr}" i]`);
        if ((await locator.count()) > 0) {
          const first = locator.first();
          if (await this._isInteractive(first)) {
            return await this._buildSuccessResult({
              element: first,
              semanticTarget,
              strategy: LocatorStrategy.NAME,
              confidence: 0.80,
              evidence: `Matched standard HTML name attribute "${nameAttr}".`,
              selector: `[name="${nameAttr}"]`,
              framePath
            });
          }
        }
      } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────
    // STRATEGY 6: STABLE TEST ID (data-testid, data-test, data-cy)
    // ─────────────────────────────────────────────────────────
    for (const testId of spec.testIds || []) {
      try {
        const locator = context.locator(
          `[data-testid="${testId}"], [data-test="${testId}"], [data-cy="${testId}"], [data-qa="${testId}"]`
        );
        if ((await locator.count()) > 0) {
          const first = locator.first();
          if (await this._isInteractive(first)) {
            return await this._buildSuccessResult({
              element: first,
              semanticTarget,
              strategy: LocatorStrategy.STABLE_TEST_ID,
              confidence: 0.95,
              evidence: `Matched developer test ID attribute "${testId}".`,
              selector: `[data-testid="${testId}"]`,
              framePath
            });
          }
        }
      } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────
    // STRATEGY 7: STABLE DOM ATTRIBUTES (autocomplete, semantic data-*)
    // ─────────────────────────────────────────────────────────
    for (const auto of spec.autocompletes || []) {
      try {
        const locator = context.locator(`input[autocomplete="${auto}" i], select[autocomplete="${auto}" i]`);
        if ((await locator.count()) > 0) {
          const first = locator.first();
          if (await this._isInteractive(first)) {
            return await this._buildSuccessResult({
              element: first,
              semanticTarget,
              strategy: LocatorStrategy.STABLE_DOM_ATTRIBUTES,
              confidence: 0.85,
              evidence: `Matched standardized HTML5 autocomplete token "${auto}".`,
              selector: `[autocomplete="${auto}"]`,
              framePath
            });
          }
        }
      } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────
    // STRATEGY 8: CSS (Resilient structural selector, non-dynamic)
    // ─────────────────────────────────────────────────────────
    for (const cssSel of spec.fallbackCss || []) {
      try {
        const locator = context.locator(cssSel);
        if ((await locator.count()) > 0) {
          const first = locator.first();
          if (await this._isInteractive(first)) {
            return await this._buildSuccessResult({
              element: first,
              semanticTarget,
              strategy: LocatorStrategy.CSS,
              confidence: 0.70,
              evidence: `Matched resilient structural CSS selector "${cssSel}".`,
              selector: cssSel,
              framePath
            });
          }
        }
      } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────
    // STRATEGY 9: XPATH (Last resort, relative semantic path)
    // ─────────────────────────────────────────────────────────
    for (const xpath of spec.xpathHints || []) {
      try {
        const locator = context.locator(`xpath=${xpath}`);
        if ((await locator.count()) > 0) {
          const first = locator.first();
          if (await this._isInteractive(first)) {
            return await this._buildSuccessResult({
              element: first,
              semanticTarget,
              strategy: LocatorStrategy.XPATH,
              confidence: 0.60,
              evidence: `Matched contextual relative XPath "${xpath}".`,
              selector: `xpath=${xpath}`,
              framePath
            });
          }
        }
      } catch (_) {}
    }

    return null;
  }

  /**
   * Verifies that the locator points to an actual interactive/visible element.
   */
  async _isInteractive(locator) {
    try {
      const isVisible = await locator.isVisible({ timeout: 500 }).catch(() => true);
      const isEnabled = await locator.isEnabled({ timeout: 500 }).catch(() => true);
      return isVisible && isEnabled;
    } catch (_) {
      return true;
    }
  }

  /**
   * Constructs a validated success result payload.
   */
  async _buildSuccessResult({ element, semanticTarget, strategy, confidence, evidence, selector, framePath }) {
    let metadata = null;
    try {
      metadata = await element.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return {
          tagName: node.tagName,
          role: node.getAttribute('role') || null,
          inputType: node.getAttribute('type') || null,
          isEditable: node.isContentEditable || node.tagName === 'INPUT' || node.tagName === 'TEXTAREA',
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };
      }).catch(() => null);
    } catch (_) {}

    const payload = {
      schemaVersion: '2.0.0',
      resolutionId: `res_${crypto.randomUUID()}`,
      semanticTarget,
      found: true,
      strategy,
      confidence,
      evidence,
      selector: selector || null,
      framePath: framePath || null,
      metadata,
      error: null,
      timestamp: new Date().toISOString()
    };

    const validation = validateRuntimeLocator(payload);
    if (!validation.valid) {
      console.warn('[RuntimeLocatorResolver] Schema validation warning:', validation.errors);
    }

    return {
      element,
      strategy,
      confidence,
      evidence,
      selector: payload.selector,
      framePath: payload.framePath,
      metadata: payload.metadata,
      found: true,
      error: null,
      canonicalPayload: payload
    };
  }

  /**
   * Constructs a validated failure result payload.
   * "If no reliable locator exists: return LOCATOR_NOT_FOUND. Do not guess silently."
   */
  _buildFailureResult(semanticTarget, message) {
    const payload = {
      schemaVersion: '2.0.0',
      resolutionId: `res_${crypto.randomUUID()}`,
      semanticTarget,
      found: false,
      strategy: LocatorStrategy.LOCATOR_NOT_FOUND,
      confidence: 0.0,
      evidence: message,
      selector: null,
      framePath: null,
      metadata: null,
      error: 'LOCATOR_NOT_FOUND',
      timestamp: new Date().toISOString()
    };

    const validation = validateRuntimeLocator(payload);
    if (!validation.valid) {
      console.warn('[RuntimeLocatorResolver] Schema validation warning:', validation.errors);
    }

    return {
      element: null,
      strategy: LocatorStrategy.LOCATOR_NOT_FOUND,
      confidence: 0.0,
      evidence: message,
      selector: null,
      framePath: null,
      metadata: null,
      found: false,
      error: 'LOCATOR_NOT_FOUND',
      canonicalPayload: payload
    };
  }

  /**
   * High-level utility: Resolves locator and executes fill action with robust fallback.
   */
  async resolveAndFill(pageOrFrame, semanticTarget, value, options = {}) {
    const resolution = await this.resolveLocator(pageOrFrame, semanticTarget, options);
    if (!resolution.found || !resolution.element) {
      throw new Error(`RuntimeLocatorResolver: Cannot fill "${semanticTarget}" - LOCATOR_NOT_FOUND`);
    }

    const el = resolution.element;
    const isContentEditable = await el.evaluate(n => n.isContentEditable).catch(() => false);

    if (isContentEditable) {
      await el.click();
      await el.evaluate((n, val) => {
        n.textContent = val;
        n.dispatchEvent(new Event('input', { bubbles: true }));
        n.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
    } else {
      await el.fill(String(value));
    }

    return resolution;
  }
}

export const defaultRuntimeLocatorResolver = new RuntimeLocatorResolver();
