/**
 * Semantic Field Mapping Test Suite — Jest / Node.js
 * Applier 2.0 — Phase 8: Semantic Field Mapping Engine
 *
 * Verifies:
 * 1. Exact match (label + autocomplete -> applicant.fullName -> Rahul Kumar)
 * 2. Synonym (cand_name -> applicant.fullName -> Rahul Kumar)
 * 3. Different wording (Parent's / Guardian's Full Name -> family.fatherName -> Suresh Kumar)
 * 4. Missing data (bank account -> financial.bankAccountNumber -> MISSING, candidateValue: null)
 * 5. Conflicting data (DOB conflict -> CONFLICT, isFillable: false)
 * 6. Wrong semantic type (File input with email label -> REQUIRES_USER, isFillable: false)
 * 7. Low confidence (Vague label -> REQUIRES_USER, isFillable: false)
 * 8. Ambiguous signals (competing matches -> AMBIGUOUS, isFillable: false)
 * 9. Security fields (CAPTCHA / OTP -> REQUIRES_USER, isFillable: false)
 * 10. Page batch mapping & Canonical Contract validation
 * 11. Golden Rule: Never auto-fill AMBIGUOUS, CONFLICT, or LOW_CONFIDENCE
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SemanticFieldMappingEngine, defaultSemanticFieldMappingEngine } from '../src/mapping/semantic-field-mapping.engine.js';
import { MappingStatus } from '../../shared/enums/index.js';
import { validateSemanticFieldMapping } from '../../shared/validators/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesPath = path.resolve(__dirname, '../../shared/fixtures/valid/field-mapping-scenarios.fixture.json');

describe('Applier 2.0 — Phase 8: Semantic Field Mapping Engine', () => {
  let fixturesData;
  let knowledgeGraph;
  let engine;

  beforeAll(() => {
    fixturesData = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
    knowledgeGraph = fixturesData.knowledgeGraph;
    engine = new SemanticFieldMappingEngine({ confidenceThreshold: 0.80 });
  });

  describe('1. Exact Match', () => {
    it('should map exact match website field to applicant.fullName with high confidence and isFillable true', () => {
      const scenario = fixturesData.scenarios.exactMatch;
      const mapping = engine.mapField(scenario.websiteField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.MATCHED);
      expect(mapping.applicantField).toBe('applicant.fullName');
      expect(mapping.candidateValue).toBe('Rahul Kumar');
      expect(mapping.confidence).toBeGreaterThanOrEqual(0.85);
      expect(mapping.isFillable).toBe(true);
      expect(mapping.evidence).toBe('Aadhaar.pdf');
      expect(mapping.signalsUsed).toContain('label');
      expect(mapping.signalsUsed).toContain('autocomplete');
    });
  });

  describe('2. Synonym Match', () => {
    it('should map portal convention synonym (cand_name) to applicant.fullName without depending on exact field names', () => {
      const scenario = fixturesData.scenarios.synonym;
      const mapping = engine.mapField(scenario.websiteField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.MATCHED);
      expect(mapping.applicantField).toBe('applicant.fullName');
      expect(mapping.candidateValue).toBe('Rahul Kumar');
      expect(mapping.isFillable).toBe(true);
      expect(mapping.signalsUsed).toContain('name');
      expect(mapping.signalsUsed).toContain('known_portal_knowledge');
    });
  });

  describe('3. Different Wording with Semantic Context', () => {
    it('should map differently worded label using nearby text and semantic context to family.fatherName', () => {
      const scenario = fixturesData.scenarios.differentWording;
      const mapping = engine.mapField(scenario.websiteField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.MATCHED);
      expect(mapping.applicantField).toBe('family.fatherName');
      expect(mapping.candidateValue).toBe('Suresh Kumar');
      expect(mapping.isFillable).toBe(true);
      expect(mapping.evidence).toBe('Marksheet.pdf');
      expect(mapping.signalsUsed).toContain('semantic_context');
    });
  });

  describe('4. Missing Data', () => {
    it('should identify field semantically but set status MISSING when not present in knowledge graph', () => {
      const scenario = fixturesData.scenarios.missingData;
      const mapping = engine.mapField(scenario.websiteField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.MISSING);
      expect(mapping.applicantField).toBe('financial.bankAccountNumber');
      expect(mapping.candidateValue).toBeNull();
      expect(mapping.isFillable).toBe(false);
      expect(mapping.confidence).toBeGreaterThanOrEqual(0.80);
    });
  });

  describe('5. Conflicting Data', () => {
    it('should detect unresolved FIELD_CONFLICT in knowledge graph and set status CONFLICT with isFillable false', () => {
      const scenario = fixturesData.scenarios.conflictingData;
      const mapping = engine.mapField(scenario.websiteField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.CONFLICT);
      expect(mapping.applicantField).toBe('applicant.dateOfBirth');
      expect(mapping.isFillable).toBe(false);
      expect(mapping.conflictDetails).toBeDefined();
      expect(mapping.conflictDetails.reason).toBe('FIELD_CONFLICT');
      expect(mapping.conflictDetails.existingValue).toBe('14-08-2006');
      expect(mapping.conflictDetails.conflictingValue).toBe('15-08-2006');
    });
  });

  describe('6. Wrong Semantic Type', () => {
    it('should reject and flag wrong semantic type (file input for email label) with isFillable false', () => {
      const scenario = fixturesData.scenarios.wrongSemanticType;
      const mapping = engine.mapField(scenario.websiteField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.REQUIRES_USER);
      expect(mapping.isFillable).toBe(false);
      expect(mapping.candidateValue).toBeNull();
    });
  });

  describe('7. Low Confidence', () => {
    it('should flag vague fields without strong signals as REQUIRES_USER with isFillable false', () => {
      const scenario = fixturesData.scenarios.lowConfidence;
      const mapping = engine.mapField(scenario.websiteField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.REQUIRES_USER);
      expect(mapping.confidence).toBeLessThan(0.80);
      expect(mapping.isFillable).toBe(false);
      expect(mapping.candidateValue).toBeNull();
    });
  });

  describe('8. Ambiguous Signals', () => {
    it('should flag ambiguous fields with competing candidates as AMBIGUOUS with isFillable false', () => {
      const ambiguousField = {
        fieldId: 'f_ambig_contact',
        name: 'guardian_parent_name',
        label: 'Parent or Guardian Name',
        type: 'text',
        selector: '#guardian_parent_name'
      };

      const mapping = engine.mapField(ambiguousField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.AMBIGUOUS);
      expect(mapping.isFillable).toBe(false);
      expect(mapping.alternativeMatches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('9. Security Fields (CAPTCHA & OTP)', () => {
    it('should strictly require user entry for CAPTCHA', () => {
      const captchaField = {
        fieldId: 'captcha_code',
        name: 'captcha',
        label: 'Enter Captcha Code',
        type: 'text',
        selector: '#captcha'
      };

      const mapping = engine.mapField(captchaField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.REQUIRES_USER);
      expect(mapping.applicantField).toBe('security.captcha');
      expect(mapping.isFillable).toBe(false);
    });

    it('should strictly require user entry for OTP', () => {
      const otpField = {
        fieldId: 'otp_input',
        name: 'otp',
        label: 'One Time Password (OTP)',
        type: 'text',
        selector: '#otp'
      };

      const mapping = engine.mapField(otpField, knowledgeGraph);

      expect(mapping.status).toBe(MappingStatus.REQUIRES_USER);
      expect(mapping.applicantField).toBe('security.otp');
      expect(mapping.isFillable).toBe(false);
    });
  });

  describe('10. Page Batch Mapping & Canonical Contract Validation', () => {
    it('should map full page fields and generate canonically valid SemanticFieldMapping payload', () => {
      const fields = [
        fixturesData.scenarios.exactMatch.websiteField,
        fixturesData.scenarios.synonym.websiteField,
        fixturesData.scenarios.differentWording.websiteField,
        fixturesData.scenarios.missingData.websiteField,
        fixturesData.scenarios.conflictingData.websiteField,
        fixturesData.scenarios.wrongSemanticType.websiteField,
        fixturesData.scenarios.lowConfidence.websiteField
      ];

      const pageResult = engine.mapPageFields({
        websiteFields: fields,
        knowledgeGraph,
        pageUrl: 'https://scholarships.gov.in/app',
        pageType: 'APPLICATION_FORM'
      });

      expect(pageResult.schemaVersion).toBe('2.0.0');
      expect(pageResult.mappings).toHaveLength(7);
      expect(pageResult.stats.totalFields).toBe(7);
      expect(pageResult.stats.matched).toBe(3);
      expect(pageResult.stats.missing).toBe(1);
      expect(pageResult.stats.conflict).toBe(1);
      expect(pageResult.stats.requiresUser).toBe(2);
      expect(pageResult.stats.fillableCount).toBe(3);

      const validation = validateSemanticFieldMapping(pageResult);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('11. The Golden Rule Verification', () => {
    it('should NEVER allow isFillable for AMBIGUOUS, CONFLICT, MISSING, or LOW_CONFIDENCE fields', () => {
      expect(engine.isFillable({ status: MappingStatus.AMBIGUOUS, confidence: 0.95 })).toBe(false);
      expect(engine.isFillable({ status: MappingStatus.CONFLICT, confidence: 0.99 })).toBe(false);
      expect(engine.isFillable({ status: MappingStatus.MISSING, confidence: 0.99 })).toBe(false);
      expect(engine.isFillable({ status: MappingStatus.REQUIRES_USER, confidence: 0.99 })).toBe(false);
      expect(engine.isFillable({ status: MappingStatus.MATCHED, confidence: 0.75 })).toBe(false);
      expect(engine.isFillable({ status: MappingStatus.MATCHED, confidence: 0.85 })).toBe(true);
    });
  });
});
