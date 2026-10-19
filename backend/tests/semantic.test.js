/**
 * Semantic Page Understanding Tests
 * Applier 2.0 — Phase 5
 *
 * Verifies that:
 * 1. BrowserObservation converts into a validated SemanticPageModel contract.
 * 2. High-confidence fields map accurately with isResolved: true.
 * 3. Ambiguous fields remain unresolved (isResolved: false, confidence < 0.70).
 * 4. Unknown fields and action buttons map to UNKNOWN_FIELD with isResolved: false.
 * 5. Large forms (35+ fields) scale efficiently without failure.
 * 6. Redundant identical page states are served from deterministic hash cache.
 * 7. ZERO execution selectors: SemanticPageModel contains pure semantic definitions, never CSS/XPath selectors.
 * 8. End-to-end integration via BrowserSession.understandPage().
 */

import { SemanticPageAnalyzer, PAGE_TYPES } from '../../browser-worker/semantic/index.js';
import { BrowserSession } from '../../browser-worker/browser/index.js';
import { validateSemanticPageModel } from '../../shared/validators/index.js';

describe('Phase 5: Semantic Page Understanding', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new SemanticPageAnalyzer();
  });

  const sampleObservation = {
    schemaVersion: '2.0.0',
    observationId: 'obs_sample_01',
    url: 'https://scholarship.gov.in/apply/fresh',
    title: 'Fresh Application - Personal Details',
    elements: [
      {
        elementId: 'elem_1',
        tag: 'input',
        type: 'text',
        role: 'textbox',
        label: 'Full Name',
        name: 'applicantFullName',
        placeholder: 'Enter full official name',
        visible: true
      },
      {
        elementId: 'elem_2',
        tag: 'input',
        type: 'text',
        role: 'textbox',
        label: "Father's Name",
        name: 'fatherName',
        placeholder: 'Father/Guardian Name',
        visible: true
      },
      {
        elementId: 'elem_3',
        tag: 'input',
        type: 'email',
        role: 'textbox',
        label: 'Email ID',
        name: 'email',
        placeholder: 'name@example.com',
        visible: true
      },
      {
        elementId: 'elem_4',
        tag: 'input',
        type: 'tel',
        role: 'textbox',
        label: 'Mobile Number',
        name: 'mobilePhone',
        placeholder: '9876543210',
        visible: true
      },
      {
        elementId: 'elem_5',
        tag: 'input',
        type: 'text',
        role: 'textbox',
        label: 'Date of Birth',
        name: 'dob',
        placeholder: 'DD/MM/YYYY',
        visible: true
      },
      {
        elementId: 'elem_6',
        tag: 'input',
        type: 'text',
        role: 'textbox',
        label: 'College / Institute Name',
        name: 'collegeName',
        placeholder: 'Institute Name',
        visible: true
      },
      {
        elementId: 'elem_7',
        tag: 'input',
        type: 'number',
        role: 'textbox',
        label: 'Aggregate CGPA',
        name: 'cgpaScore',
        placeholder: '0.0 - 10.0',
        visible: true
      },
      {
        elementId: 'elem_8',
        tag: 'input',
        type: 'number',
        role: 'textbox',
        label: 'Annual Family Income',
        name: 'familyIncome',
        placeholder: 'In INR',
        visible: true
      }
    ]
  };

  test('Scenario 1: High-confidence semantic mapping', async () => {
    const result = await analyzer.analyze(sampleObservation);

    expect(result.schemaVersion).toBe('2.0.0');
    expect(result.pageType).toBe(PAGE_TYPES.APPLICATION_FORM);
    expect(result.pageTypeConfidence).toBeGreaterThanOrEqual(0.85);
    expect(result.fields).toHaveLength(8);

    const fieldMap = Object.fromEntries(result.fields.map(f => [f.elementId, f]));

    // Applicant Name
    expect(fieldMap.elem_1.semanticType).toBe('applicant.fullName');
    expect(fieldMap.elem_1.confidence).toBeGreaterThanOrEqual(0.90);
    expect(fieldMap.elem_1.isResolved).toBe(true);

    // Father Name
    expect(fieldMap.elem_2.semanticType).toBe('applicant.fatherName');
    expect(fieldMap.elem_2.confidence).toBeGreaterThanOrEqual(0.90);
    expect(fieldMap.elem_2.isResolved).toBe(true);

    // Email & Phone
    expect(fieldMap.elem_3.semanticType).toBe('applicant.email');
    expect(fieldMap.elem_3.isResolved).toBe(true);
    expect(fieldMap.elem_4.semanticType).toBe('applicant.phone');
    expect(fieldMap.elem_4.isResolved).toBe(true);

    // Date of Birth
    expect(fieldMap.elem_5.semanticType).toBe('applicant.dateOfBirth');
    expect(fieldMap.elem_5.isResolved).toBe(true);

    // Education & Financial
    expect(fieldMap.elem_6.semanticType).toBe('education.college');
    expect(fieldMap.elem_6.isResolved).toBe(true);
    expect(fieldMap.elem_7.semanticType).toBe('education.cgpa');
    expect(fieldMap.elem_7.isResolved).toBe(true);
    expect(fieldMap.elem_8.semanticType).toBe('financial.income');
    expect(fieldMap.elem_8.isResolved).toBe(true);
  });

  test('Scenario 2: Ambiguous field remains unresolved with low confidence', async () => {
    const ambiguousObservation = {
      schemaVersion: '2.0.0',
      observationId: 'obs_ambiguous',
      url: 'https://scholarship.gov.in/form',
      elements: [
        {
          elementId: 'elem_amb_1',
          tag: 'input',
          type: 'text',
          label: 'Code',
          name: 'ref',
          placeholder: 'Code',
          visible: true
        },
        {
          elementId: 'elem_amb_2',
          tag: 'input',
          type: 'text',
          label: 'Temp Value',
          name: 'temp',
          placeholder: '',
          visible: true
        }
      ]
    };

    const result = await analyzer.analyze(ambiguousObservation);
    const fieldMap = Object.fromEntries(result.fields.map(f => [f.elementId, f]));

    for (const elId of ['elem_amb_1', 'elem_amb_2']) {
      const field = fieldMap[elId];
      expect(field.isResolved).toBe(false);
      expect(field.confidence).toBeLessThan(0.70);
    }
  });

  test('Scenario 3: Unknown fields and action controls map to UNKNOWN_FIELD', async () => {
    const unknownObservation = {
      schemaVersion: '2.0.0',
      observationId: 'obs_unknown',
      url: 'https://scholarship.gov.in/form',
      elements: [
        {
          elementId: 'elem_btn',
          tag: 'button',
          type: 'submit',
          role: 'button',
          label: 'Save Progress',
          text: 'Save Progress',
          visible: true
        },
        {
          elementId: 'elem_random',
          tag: 'input',
          type: 'text',
          label: 'Tracking Key',
          name: 'xyz987',
          visible: true
        }
      ]
    };

    const result = await analyzer.analyze(unknownObservation);
    const fieldMap = Object.fromEntries(result.fields.map(f => [f.elementId, f]));

    expect(fieldMap.elem_btn.semanticType).toBe('UNKNOWN_FIELD');
    expect(fieldMap.elem_btn.isResolved).toBe(false);

    expect(fieldMap.elem_random.semanticType).toBe('UNKNOWN_FIELD');
    expect(fieldMap.elem_random.isResolved).toBe(false);
  });

  test('Scenario 4: Large form scalability (35+ fields)', async () => {
    const elements = [];
    for (let i = 1; i <= 35; i++) {
      elements.push({
        elementId: `elem_${i}`,
        tag: 'input',
        type: 'text',
        label: `Student Field ${i}`,
        name: `field_${i}`,
        visible: true
      });
    }

    const largeObs = {
      schemaVersion: '2.0.0',
      observationId: 'obs_large',
      url: 'https://portal.gov.in/complex-form',
      title: 'Comprehensive 35-field Form',
      elements
    };

    const result = await analyzer.analyze(largeObs);
    expect(result.fields).toHaveLength(35);
    expect(result.metadata.fieldCount).toBe(35);
  });

  test('Scenario 5: Schema validation and ZERO execution selectors guarantee', async () => {
    const result = await analyzer.analyze(sampleObservation);

    // Canonical contract validation
    const validation = validateSemanticPageModel(result);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // STRICT: Must NOT contain CSS selectors, xpaths, or browser action steps
    for (const field of result.fields) {
      expect(field).not.toHaveProperty('selector');
      expect(field).not.toHaveProperty('xpath');
      expect(field).not.toHaveProperty('action');
      expect(typeof field.elementId).toBe('string');
      expect(typeof field.semanticType).toBe('string');
      expect(typeof field.confidence).toBe('number');
      expect(typeof field.reason).toBe('string');
      expect(typeof field.isResolved).toBe('boolean');
    }
  });

  test('Scenario 6: Deterministic state hash caching', async () => {
    const res1 = await analyzer.analyze(sampleObservation);
    expect(res1.metadata.cached).toBe(false);

    const res2 = await analyzer.analyze(sampleObservation);
    expect(res2.metadata.cached).toBe(true);
    expect(res2.pageType).toBe(res1.pageType);
    expect(res2.fields).toHaveLength(res1.fields.length);
  });

  test('Scenario 7: BrowserSession.understandPage integration', async () => {
    const mockSession = new BrowserSession({
      sessionId: 'sess_semantic_test',
      activePageId: 'page_1',
      managers: {
        semanticAnalyzer: analyzer
      }
    });

    // Invoke understandPage with pre-computed observation
    const model = await mockSession.understandPage({
      observation: sampleObservation
    });

    expect(model.schemaVersion).toBe('2.0.0');
    expect(model.pageType).toBe(PAGE_TYPES.APPLICATION_FORM);
    expect(model.fields).toHaveLength(8);
  });
});
