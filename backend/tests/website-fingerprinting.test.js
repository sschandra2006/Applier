/**
 * Website Fingerprinting and Learning Test Suite
 * Applier 2.0 — Phase 19
 *
 * Verifies that the system learns successful portal behavior without learning
 * unsafe actions blindly, versions website knowledge, invalidates stale assumptions,
 * and handles first visit, repeat visit, website change, stale locator,
 * successful learning, and failed learning.
 */

import { jest } from '@jest/globals';
import { WebsiteFingerprintService } from '../src/fingerprint/website-fingerprint.service.js';
import { validateWebsiteFingerprint } from '../../shared/validators/index.js';
import { KnowledgeTier, WebsiteFingerprintStatus } from '../../shared/enums/index.js';
import { RuntimeLocatorResolver } from '../../browser-worker/locator/runtime-locator.resolver.js';

describe('Applier 2.0 — Phase 19: Website Fingerprinting and Learning', () => {
  let service;

  beforeEach(() => {
    service = new WebsiteFingerprintService({ useMemoryFallback: true });
    service.clear();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. FIRST VISIT
  // ─────────────────────────────────────────────────────────────
  describe('1. First Visit', () => {
    it('should initialize candidate knowledge for unknown portal on first visit', async () => {
      const domain = 'careers.techcorp.com';

      // 1. Initially no fingerprint exists
      const initialFp = await service.getFingerprint(domain);
      expect(initialFp).toBeNull();

      // 2. Record first visit outcome
      const portalInfo = {
        name: 'TechCorp Careers',
        portalType: 'GREENHOUSE',
        framework: 'React',
        structuralHash: 'struct_hash_tc_v1'
      };

      const executionData = {
        fields: [
          { semanticTarget: 'applicant.fullName', strategy: 'LABEL', selector: '#applicant_name' },
          { semanticTarget: 'applicant.email', strategy: 'NAME', selector: 'input[name="email"]' }
        ],
        pages: [
          { pageId: 'pg_apply', semanticPageType: 'APPLICATION_FORM', domSignature: 'struct_hash_tc_v1' }
        ],
        transitions: [
          { fromPage: 'APPLICATION_FORM', toPage: 'SUCCESS_PAGE', triggerAction: 'click(#submit_btn)' }
        ],
        uploadConstraints: [
          { semanticField: 'documents.resume', acceptedExtensions: ['.pdf', '.docx'], maxSizeBytes: 5242880 }
        ],
        checkpoints: [
          { pageType: 'APPLICATION_FORM', checkpointType: 'CAPTCHA', observedStep: 3, detectionSignals: ['#recaptcha'] }
        ],
        recoveryStrategies: [
          { failureType: 'UNEXPECTED_MODAL', successfulRecoveryAction: 'DISMISS_MODAL' }
        ]
      };

      const fp = await service.recordFirstVisit(domain, portalInfo, executionData);

      // 3. Verify created fingerprint structure
      expect(fp).toBeDefined();
      expect(fp.domain).toBe(domain);
      expect(fp.knowledgeVersion).toBe(1);
      expect(fp.status).toBe(WebsiteFingerprintStatus.ACTIVE);

      // Verify all required stores exist
      expect(fp.portalIdentity.name).toBe('TechCorp Careers');
      expect(fp.portalIdentity.portalType).toBe('GREENHOUSE');
      expect(fp.portalIdentity.structuralHash).toBe('struct_hash_tc_v1');
      expect(fp.pageFingerprints).toHaveLength(1);
      expect(fp.semanticFields).toHaveLength(2);
      expect(fp.successfulLocatorStrategies).toHaveLength(2);
      expect(fp.workflowTransitions).toHaveLength(1);
      expect(fp.uploadConstraints).toHaveLength(1);
      expect(fp.checkpointBehavior).toHaveLength(1);
      expect(fp.recoveryStrategies).toHaveLength(1);

      // Verify knowledge starts as CANDIDATE tier
      const fullNameField = fp.semanticFields.find(f => f.semanticTarget === 'applicant.fullName');
      expect(fullNameField.tier).toBe(KnowledgeTier.CANDIDATE);
      expect(fullNameField.learnedStrategies[0].tier).toBe(KnowledgeTier.CANDIDATE);
      expect(fullNameField.learnedStrategies[0].successCount).toBe(1);
      expect(fullNameField.learnedStrategies[0].failureCount).toBe(0);

      // Verify canonical contract validation passes
      const validation = validateWebsiteFingerprint(fp);
      expect(validation.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. REPEAT VISIT
  // ─────────────────────────────────────────────────────────────
  describe('2. Repeat Visit', () => {
    it('should recognize portal, reuse knowledge, and promote candidate to trusted upon repeat success', async () => {
      const domain = 'jobs.megacorp.com';
      const structuralHash = 'struct_hash_mega_v1';

      // 1. Establish initial first visit (CANDIDATE)
      await service.recordFirstVisit(domain, {
        name: 'MegaCorp Jobs',
        portalType: 'WORKDAY',
        structuralHash
      }, {
        fields: [{ semanticTarget: 'applicant.fullName', strategy: 'LABEL', selector: '#legal_name' }]
      });

      const firstFp = await service.getFingerprint(domain);
      expect(firstFp.semanticFields[0].tier).toBe(KnowledgeTier.CANDIDATE);
      expect(firstFp.statistics.totalExecutions).toBe(1);

      // 2. Repeat visit with successful execution using the same locator
      const updatedFp = await service.recordRepeatVisit(domain, {
        isSuccess: true,
        verifiedFields: [
          { semanticTarget: 'applicant.fullName', strategy: 'LABEL', selector: '#legal_name' }
        ]
      }, structuralHash);

      // 3. Verify statistics incremented
      expect(updatedFp.statistics.totalExecutions).toBe(2);
      expect(updatedFp.statistics.successfulExecutions).toBe(2);

      // 4. Verify candidate promoted to TRUSTED (>= 2 successes, confidence >= 0.80)
      const field = updatedFp.semanticFields.find(f => f.semanticTarget === 'applicant.fullName');
      const strategy = field.learnedStrategies.find(s => s.selector === '#legal_name');
      expect(strategy.successCount).toBe(2);
      expect(strategy.confidence).toBeGreaterThanOrEqual(0.80);
      expect(strategy.tier).toBe(KnowledgeTier.TRUSTED);
      expect(field.tier).toBe(KnowledgeTier.TRUSTED);

      // 5. Verify successfulLocatorStrategies contains TRUSTED entry
      const successLocator = updatedFp.successfulLocatorStrategies.find(s => s.semanticTarget === 'applicant.fullName');
      expect(successLocator.tier).toBe(KnowledgeTier.TRUSTED);
      expect(successLocator.confidence).toBe(strategy.confidence);

      // 6. Verify recommended locator returns trusted locator
      const recommended = await service.getRecommendedLocator(domain, 'applicant.fullName');
      expect(recommended).toBeDefined();
      expect(recommended.selector).toBe('#legal_name');
      expect(recommended.isTrusted).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. WEBSITE CHANGE
  // ─────────────────────────────────────────────────────────────
  describe('3. Website Change', () => {
    it('should detect website structural changes and invalidate stale assumptions', async () => {
      const domain = 'apply.startup.io';
      const initialHash = 'struct_hash_startup_v1';
      const updatedHash = 'struct_hash_startup_v2_redesign';

      // 1. Initial baseline
      await service.recordFirstVisit(domain, {
        name: 'Startup Portal',
        portalType: 'CUSTOM',
        structuralHash: initialHash
      }, {
        fields: [{ semanticTarget: 'applicant.email', strategy: 'CSS', selector: '#old_email_input' }]
      });

      const initialFp = await service.getFingerprint(domain);
      expect(initialFp.knowledgeVersion).toBe(1);
      expect(initialFp.portalIdentity.structuralHash).toBe(initialHash);

      // 2. Verify change detection
      const isChanged = service.detectWebsiteChange(initialFp, updatedHash);
      expect(isChanged).toBe(true);

      // 3. Handle website change
      const newFp = await service.handleWebsiteChange(domain, updatedHash);

      // 4. Verify versioning and invalidation
      expect(newFp.knowledgeVersion).toBe(2);
      expect(newFp.status).toBe(WebsiteFingerprintStatus.ACTIVE);
      expect(newFp.portalIdentity.structuralHash).toBe(updatedHash);

      // Stale locators must be demoted back to CANDIDATE with lower confidence
      const emailField = newFp.semanticFields.find(f => f.semanticTarget === 'applicant.email');
      expect(emailField.tier).toBe(KnowledgeTier.CANDIDATE);
      expect(emailField.learnedStrategies[0].tier).toBe(KnowledgeTier.CANDIDATE);
      expect(emailField.learnedStrategies[0].confidence).toBeLessThan(initialFp.semanticFields[0].learnedStrategies[0].confidence);

      // Old fingerprint status superseded
      expect(initialFp.status).toBe(WebsiteFingerprintStatus.SUPERSEDED);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. STALE LOCATOR
  // ─────────────────────────────────────────────────────────────
  describe('4. Stale Locator', () => {
    it('should detect failing locator, decrease confidence, demote to deprecated and fall back gracefully', async () => {
      const domain = 'careers.bankingcorp.com';
      const hash = 'struct_bank_v1';

      // 1. Set up learned locator
      await service.recordFirstVisit(domain, {
        name: 'Banking Corp',
        portalType: 'TCS_ION',
        structuralHash: hash
      }, {
        fields: [{ semanticTarget: 'applicant.phone', strategy: 'NAME', selector: 'input[name="phone_legacy"]' }]
      });

      // 2. Simulate repeated locator failures on live site
      await service.recordActionOutcome(domain, {
        semanticTarget: 'applicant.phone',
        selector: 'input[name="phone_legacy"]',
        isSuccess: false,
        errorType: 'SELECTOR_FAILURE'
      });

      let fp = await service.getFingerprint(domain);
      let phoneField = fp.semanticFields.find(f => f.semanticTarget === 'applicant.phone');
      let strat = phoneField.learnedStrategies.find(s => s.selector === 'input[name="phone_legacy"]');
      expect(strat.failureCount).toBe(1);
      expect(strat.confidence).toBeLessThan(0.65);

      // 3. Second failure brings confidence below 0.40 threshold -> demoted to DEPRECATED
      await service.recordActionOutcome(domain, {
        semanticTarget: 'applicant.phone',
        selector: 'input[name="phone_legacy"]',
        isSuccess: false,
        errorType: 'SELECTOR_FAILURE'
      });

      fp = await service.getFingerprint(domain);
      phoneField = fp.semanticFields.find(f => f.semanticTarget === 'applicant.phone');
      strat = phoneField.learnedStrategies.find(s => s.selector === 'input[name="phone_legacy"]');
      expect(strat.tier).toBe(KnowledgeTier.DEPRECATED);
      expect(phoneField.tier).toBe(KnowledgeTier.DEPRECATED);

      // 4. Recommended locator must NOT return deprecated stale locator
      const recommended = await service.getRecommendedLocator(domain, 'applicant.phone');
      expect(recommended).toBeNull();

      // 5. Integration: RuntimeLocatorResolver ignores deprecated locator and falls back to semantic resolution
      const resolver = new RuntimeLocatorResolver();
      const mockPage = {
        locator: jest.fn(() => ({
          count: async () => 0,
          first: () => ({})
        })),
        getByRole: jest.fn(() => ({ count: async () => 0 })),
        getByLabel: jest.fn(() => ({ count: async () => 0 })),
        getByPlaceholder: jest.fn(() => ({ count: async () => 0 })),
        frames: () => []
      };

      const result = await resolver.resolveLocator(mockPage, 'applicant.phone', {
        learnedLocator: strat // Pass deprecated strategy
      });

      // Resolver cleanly reports LOCATOR_NOT_FOUND without guessing or blindly using stale locator
      expect(result.found).toBe(false);
      expect(result.error).toBe('LOCATOR_NOT_FOUND');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. SUCCESSFUL LEARNING
  // ─────────────────────────────────────────────────────────────
  describe('5. Successful Learning', () => {
    it('should record verified executions, grow confidence, and update workflow behaviors', async () => {
      const domain = 'jobs.globalfirm.org';
      const hash = 'struct_global_v1';

      // First Visit
      await service.recordFirstVisit(domain, {
        name: 'Global Firm Recruitment',
        portalType: 'GREENHOUSE',
        structuralHash: hash
      }, {
        fields: [
          { semanticTarget: 'applicant.firstName', strategy: 'LABEL', selector: '#txtFirstName' },
          { semanticTarget: 'applicant.lastName', strategy: 'LABEL', selector: '#txtLastName' }
        ],
        transitions: [
          { fromPage: 'STEP_1', toPage: 'STEP_2', triggerAction: 'click(#next_button)' }
        ],
        uploadConstraints: [
          { semanticField: 'documents.resume', acceptedExtensions: ['.pdf'], maxSizeBytes: 2097152 }
        ],
        recoveryStrategies: [
          { failureType: 'TIMEOUT', successfulRecoveryAction: 'RE_OBSERVE' }
        ]
      });

      // Repeat visit 1
      await service.recordRepeatVisit(domain, {
        isSuccess: true,
        verifiedFields: [
          { semanticTarget: 'applicant.firstName', strategy: 'LABEL', selector: '#txtFirstName' },
          { semanticTarget: 'applicant.lastName', strategy: 'LABEL', selector: '#txtLastName' }
        ]
      }, hash);

      // Repeat visit 2
      const fp = await service.recordRepeatVisit(domain, {
        isSuccess: true,
        verifiedFields: [
          { semanticTarget: 'applicant.firstName', strategy: 'LABEL', selector: '#txtFirstName' },
          { semanticTarget: 'applicant.lastName', strategy: 'LABEL', selector: '#txtLastName' }
        ]
      }, hash);

      expect(fp.statistics.totalExecutions).toBe(3);
      expect(fp.statistics.successfulExecutions).toBe(3);

      const fName = fp.successfulLocatorStrategies.find(s => s.semanticTarget === 'applicant.firstName');
      const lName = fp.successfulLocatorStrategies.find(s => s.semanticTarget === 'applicant.lastName');

      expect(fName.tier).toBe(KnowledgeTier.TRUSTED);
      expect(lName.tier).toBe(KnowledgeTier.TRUSTED);
      expect(fName.confidence).toBeGreaterThanOrEqual(0.90);
      expect(lName.confidence).toBeGreaterThanOrEqual(0.90);

      // Recommended locators reflect high-confidence trusted knowledge
      const recFirst = await service.getRecommendedLocator(domain, 'applicant.firstName');
      expect(recFirst.isTrusted).toBe(true);
      expect(recFirst.selector).toBe('#txtFirstName');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. FAILED LEARNING & SENSITIVE DATA PRIVACY
  // ─────────────────────────────────────────────────────────────
  describe('6. Failed Learning & Sensitive Data Privacy', () => {
    it('should decrease confidence on failures and strictly refuse storing raw passwords, OTPs, or CAPTCHAs', async () => {
      const domain = 'portal.securelogin.gov';
      const hash = 'struct_gov_v1';

      // 1. Attempt to pass raw sensitive credentials into learning payload
      const sensitivePayload = {
        fields: [
          { semanticTarget: 'applicant.password', strategy: 'CSS', selector: '#pwd_field', password: 'SuperSecret123!' },
          { semanticTarget: 'applicant.otp', strategy: 'NAME', selector: 'input[name="otp"]', otp: '984512' },
          { semanticTarget: 'applicant.captcha', strategy: 'CSS', selector: '#captcha_input', captchaAnswer: 'X7K9P' }
        ]
      };

      const fp = await service.recordFirstVisit(domain, {
        name: 'Government Portal',
        portalType: 'CUSTOM',
        structuralHash: hash
      }, sensitivePayload);

      // 2. Verify NO raw sensitive values leaked into stored fingerprint
      const serialized = JSON.stringify(fp);
      expect(serialized).not.toContain('SuperSecret123!');
      expect(serialized).not.toContain('984512');
      expect(serialized).not.toContain('X7K9P');

      // 3. Simulate failure in execution
      const failedFp = await service.recordRepeatVisit(domain, {
        isSuccess: false,
        failedLocators: [
          { semanticTarget: 'applicant.captcha', selector: '#captcha_input', errorType: 'VALIDATION_FAILURE' }
        ]
      }, hash);

      expect(failedFp.statistics.failedExecutions).toBe(1);
      const captchaField = failedFp.semanticFields.find(f => f.semanticTarget === 'applicant.captcha');
      expect(captchaField.learnedStrategies[0].failureCount).toBe(1);
      expect(captchaField.confidence).toBeLessThan(0.60);
    });
  });

});
