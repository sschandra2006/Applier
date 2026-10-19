/**
 * Applicant Knowledge Graph Tests
 * Applier 2.0 — Phase 6
 *
 * Verifies all required Phase 6 capabilities:
 * 1. Profile import (safe migration preserving existing fields)
 * 2. Document-derived value ingestion
 * 3. User correction (overrides prior values, records history, resolves conflict)
 * 4. Conflicting values (NEVER silently overwrites, generates FIELD_CONFLICT)
 * 5. Confidence scoring and verification status calculation
 * 6. Interview skipping known fields (verified fields bypassed, uncertain fields confirmed, conflicts displayed)
 * 7. Canonical schema validation adherence
 */

import { ApplicantKnowledgeGraphService, defaultKnowledgeGraphService } from '../src/knowledge/index.js';
import { KnowledgeSourceType, KnowledgeVerificationStatus } from '../../shared/enums/index.js';
import { validateApplicantKnowledgeGraph } from '../../shared/validators/index.js';

describe('Phase 6: Applicant Knowledge Graph', () => {
  let service;
  let graph;

  beforeEach(() => {
    service = new ApplicantKnowledgeGraphService();
    graph = service.createEmptyGraph({
      userId: 'user_123',
      applicantId: 'app_123'
    });
  });

  test('Test 1: Profile import and safe migration without field loss', () => {
    const existingProfile = {
      firstName: 'Aarav',
      lastName: 'Sharma',
      phone: '+919876543210',
      email: 'aarav.sharma@example.com',
      dateOfBirth: new Date('2006-08-14T00:00:00.000Z'),
      address: {
        street: 'Flat 402, Lotus Towers',
        city: 'Bengaluru',
        state: 'Karnataka',
        zipCode: '560001',
        country: 'India'
      }
    };

    service.importProfile(graph, existingProfile);

    // Full name synthesized
    expect(graph.identity.fullName).toBeDefined();
    expect(graph.identity.fullName.value).toBe('Aarav Sharma');
    expect(graph.identity.fullName.source).toBe(KnowledgeSourceType.PROFILE);
    expect(graph.identity.fullName.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);

    // First and last names preserved
    expect(graph.identity.firstName.value).toBe('Aarav');
    expect(graph.identity.lastName.value).toBe('Sharma');

    // DOB preserved
    expect(graph.identity.dateOfBirth.value).toBe('2006-08-14');

    // Contact info preserved
    expect(graph.contact.email.value).toBe('aarav.sharma@example.com');
    expect(graph.contact.phone.value).toBe('+919876543210');

    // Address preserved
    expect(graph.address.street.value).toBe('Flat 402, Lotus Towers');
    expect(graph.address.city.value).toBe('Bengaluru');
    expect(graph.address.pincode.value).toBe('560001');

    // Canonical schema validation
    const validation = validateApplicantKnowledgeGraph(graph);
    expect(validation.valid).toBe(true);
  });

  test('Test 2: Document-derived value ingestion', () => {
    const docResult = service.ingestValue(graph, {
      path: 'education.college',
      value: 'Indian Institute of Science',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.96,
      evidence: 'Extracted from enrollment letter doc_101'
    });

    expect(docResult.status).toBe('INGESTED');
    expect(graph.education.college.value).toBe('Indian Institute of Science');
    expect(graph.education.college.source).toBe(KnowledgeSourceType.DOCUMENT);
    expect(graph.education.college.confidence).toBe(0.96);
    expect(graph.education.college.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);
    expect(graph.education.college.evidence).toBe('Extracted from enrollment letter doc_101');

    // Ingesting identical value reinforces confidence
    const reinforceResult = service.ingestValue(graph, {
      path: 'education.college',
      value: 'Indian Institute of Science',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.99,
      evidence: 'Verified from marksheet doc_102'
    });

    expect(reinforceResult.status).toBe('REINFORCED');
    expect(graph.education.college.confidence).toBe(0.99);
    expect(graph.education.college.evidence).toContain('doc_102');
  });

  test('Test 3: Conflicting values never silently overwrite (DOB Aadhaar vs Marksheet)', () => {
    // 1. Ingest DOB from Aadhaar: 14-08-2006
    service.ingestValue(graph, {
      path: 'identity.dateOfBirth',
      value: '14-08-2006',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.98,
      evidence: 'Aadhaar Card QR Code extraction'
    });

    expect(graph.identity.dateOfBirth.value).toBe('14-08-2006');
    expect(graph.identity.dateOfBirth.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);
    expect(graph.conflicts).toHaveLength(0);

    // 2. Ingest conflicting DOB from 10th Marksheet: 15-08-2006
    const conflictResult = service.ingestValue(graph, {
      path: 'identity.dateOfBirth',
      value: '15-08-2006',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.95,
      evidence: 'Class 10 CBSE Marksheet'
    });

    // STRICT: Must NOT overwrite value silently!
    expect(conflictResult.status).toBe('CONFLICT_DETECTED');
    expect(graph.identity.dateOfBirth.value).toBe('14-08-2006'); // Old value preserved
    expect(graph.identity.dateOfBirth.verificationStatus).toBe(KnowledgeVerificationStatus.CONFLICT);

    // Conflict record must be registered
    expect(graph.conflicts).toHaveLength(1);
    const conflict = graph.conflicts[0];
    expect(conflict.reason).toBe('FIELD_CONFLICT');
    expect(conflict.status).toBe('UNRESOLVED');
    expect(conflict.path).toBe('identity.dateOfBirth');
    expect(conflict.existingValue.value).toBe('14-08-2006');
    expect(conflict.conflictingValue.value).toBe('15-08-2006');
  });

  test('Test 4: User correction overrides prior values and resolves open conflict', () => {
    // Setup conflicting state
    service.ingestValue(graph, {
      path: 'identity.dateOfBirth',
      value: '14-08-2006',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.95
    });
    service.ingestValue(graph, {
      path: 'identity.dateOfBirth',
      value: '15-08-2006',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.95
    });
    expect(graph.conflicts[0].status).toBe('UNRESOLVED');

    // User provides authoritative correction
    const correctResult = service.ingestValue(graph, {
      path: 'identity.dateOfBirth',
      value: '14-08-2006',
      source: KnowledgeSourceType.USER_INPUT,
      evidence: 'User confirmed official birth date during interview'
    });

    expect(correctResult.status).toBe('USER_CORRECTION');
    expect(graph.identity.dateOfBirth.value).toBe('14-08-2006');
    expect(graph.identity.dateOfBirth.source).toBe(KnowledgeSourceType.USER_INPUT);
    expect(graph.identity.dateOfBirth.confidence).toBe(1.0);
    expect(graph.identity.dateOfBirth.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);

    // Audit history recorded
    expect(graph.identity.dateOfBirth.history.length).toBeGreaterThanOrEqual(1);

    // Conflict resolved
    expect(graph.conflicts[0].status).toBe('RESOLVED');
    expect(graph.conflicts[0].resolution.selectedSource).toBe(KnowledgeSourceType.USER_INPUT);
  });

  test('Test 5: Confidence and Verification Status discrimination', () => {
    // Uncertain system-derived guess (confidence 0.60)
    service.ingestValue(graph, {
      path: 'family.fatherName',
      value: 'Rajesh Sharma',
      source: KnowledgeSourceType.SYSTEM_DERIVED,
      confidence: 0.60
    });

    const status1 = service.getFieldStatus(graph, 'family.fatherName');
    expect(status1.status).toBe(KnowledgeVerificationStatus.CONFIRMATION_REQUIRED);

    // High confidence document value (confidence 0.95)
    service.ingestValue(graph, {
      path: 'financial.annualIncome',
      value: '450000',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.95
    });

    const status2 = service.getFieldStatus(graph, 'financial.annualIncome');
    expect(status2.status).toBe(KnowledgeVerificationStatus.VERIFIED);
  });

  test('Test 6: Interview engine skipping known verified fields and posing confirmation/conflict', () => {
    // 1. Populate graph with:
    // - Full Name (VERIFIED)
    // - Email (VERIFIED)
    // - Father Name (CONFIRMATION_REQUIRED)
    // - DOB (CONFLICT)
    service.ingestValue(graph, {
      path: 'identity.fullName',
      value: 'Aarav Sharma',
      source: KnowledgeSourceType.PROFILE,
      confidence: 0.95
    });
    service.ingestValue(graph, {
      path: 'contact.email',
      value: 'aarav@example.com',
      source: KnowledgeSourceType.PROFILE,
      confidence: 1.0
    });
    service.ingestValue(graph, {
      path: 'family.fatherName',
      value: 'Rajesh Sharma',
      source: KnowledgeSourceType.SYSTEM_DERIVED,
      confidence: 0.65
    });
    service.ingestValue(graph, {
      path: 'identity.dateOfBirth',
      value: '14-08-2006',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.95
    });
    service.ingestValue(graph, {
      path: 'identity.dateOfBirth',
      value: '15-08-2006',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.95
    });

    const formFields = [
      'applicantFullName', // mapped to identity.fullName (VERIFIED)
      'email',             // mapped to contact.email (VERIFIED)
      'fatherName',        // mapped to family.fatherName (CONFIRMATION_REQUIRED)
      'dob',               // mapped to identity.dateOfBirth (CONFLICT)
      'annualIncome'       // unpopulated in graph (UNKNOWN)
    ];

    const partition = service.partitionInterviewFields(graph, formFields);

    // Verified fields are completely SKIPPED from questions
    expect(partition.skippedFields.applicantFullName).toBeDefined();
    expect(partition.skippedFields.applicantFullName.value).toBe('Aarav Sharma');
    expect(partition.skippedFields.email).toBeDefined();
    expect(partition.skippedFields.email.value).toBe('aarav@example.com');

    // Uncertain field is marked for confirmation
    expect(partition.confirmationFields.fatherName).toBeDefined();
    expect(partition.confirmationFields.fatherName.value).toBe('Rajesh Sharma');

    // Conflicting field is marked with conflict details
    expect(partition.conflictFields.dob).toBeDefined();
    expect(partition.conflictFields.dob.existingValue).toBe('14-08-2006');
    expect(partition.conflictFields.dob.conflictingValue).toBe('15-08-2006');

    // Remaining fields requiring interaction
    expect(partition.remainingPendingFields).toContain('fatherName');
    expect(partition.remainingPendingFields).toContain('dob');
    expect(partition.remainingPendingFields).toContain('annualIncome');
    expect(partition.remainingPendingFields).not.toContain('applicantFullName');
    expect(partition.remainingPendingFields).not.toContain('email');
  });

  test('Test 7: Canonical schema validation on complete graph', () => {
    service.importProfile(graph, {
      firstName: 'Pooja',
      lastName: 'Patel',
      phone: '+919123456789',
      email: 'pooja@example.com'
    });
    service.ingestValue(graph, {
      path: 'education.degree',
      value: 'B.Tech Computer Science',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.92
    });

    const validation = validateApplicantKnowledgeGraph(graph);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(graph.metadata.totalFields).toBeGreaterThan(0);
  });
});
