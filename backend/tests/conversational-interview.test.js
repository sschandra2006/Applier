/**
 * Conversational Interview Test Suite
 * Applier 2.0 — Phase 14: Evidence-Aware Conversational Interview
 *
 * Verifies:
 * 1. Verified field skipped (source document/user/profile verified -> pre-filled into answers, never asked).
 * 2. Missing field asked (unknown/unpopulated field -> prompted directly).
 * 3. Conflict asked (competing document/graph values -> prompts user to resolve, resolves conflict upon choice).
 * 4. Uncertain field confirmed (low confidence < 0.85 -> prompts confirmation, user affirmation promotes to verified).
 * 5. 50+ field workflow scalability (55 fields -> 50 skipped, 5 asked, strictly ONE question at a time, rapid completion).
 * 6. Resume interview (paused interview resumed at exact next pending step without re-asking completed/verified fields).
 */

import { jest } from '@jest/globals';
import { ApplicantKnowledgeGraphService } from '../src/knowledge/knowledge-graph.service.js';
import { KnowledgeSourceType, KnowledgeVerificationStatus } from '../../shared/enums/index.js';
import { resumeInterview } from '../src/interview/interview.service.js';
import { InterviewState } from '../src/interview/interview-state.model.js';
import { Conversation } from '../src/chat/conversation.model.js';
import { Message } from '../src/chat/message.model.js';
import { ApplicantKnowledgeGraph } from '../src/knowledge/knowledge-graph.model.js';

describe('Applier 2.0 — Phase 14: Evidence-Aware Conversational Interview', () => {
  let service;
  let graph;

  beforeEach(() => {
    service = new ApplicantKnowledgeGraphService();
    graph = service.createEmptyGraph({
      userId: 'user_phase14_test',
      applicantId: 'app_phase14_test'
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 1. VERIFIED FIELD SKIPPED
  // ─────────────────────────────────────────────────────────────
  describe('1. Verified field skipped', () => {
    it('should pre-populate verified fields into answers and NEVER ask questions for them', () => {
      // 1. Ingest verified profile value (confidence >= 0.85)
      service.ingestValue(graph, {
        path: 'identity.fullName',
        value: 'Rahul Kumar Sharma',
        source: KnowledgeSourceType.PROFILE,
        confidence: 0.95
      });

      // 2. Ingest document evidence via importDocumentEvidence
      const mockDocs = [
        {
          _id: 'doc_aadhaar_001',
          fileName: 'AadhaarCard.pdf',
          type: 'AADHAAR',
          extractedData: {
            email: { value: 'rahul.sharma@example.com', confidence: 0.98 },
            phone: { value: '+919876543210', confidence: 0.95 }
          }
        }
      ];
      service.importDocumentEvidence(graph, mockDocs);

      // Verify fields in graph
      expect(graph.identity.fullName.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);
      expect(graph.contact.email.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);
      expect(graph.contact.phone.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);

      // Required form fields on target portal
      const portalFormFields = ['applicantFullName', 'email', 'phone', 'annualIncome'];

      const partition = service.partitionInterviewFields(graph, portalFormFields);

      // Verified fields must be in skippedFields
      expect(partition.skippedFields.applicantFullName).toBeDefined();
      expect(partition.skippedFields.applicantFullName.value).toBe('Rahul Kumar Sharma');
      expect(partition.skippedFields.email).toBeDefined();
      expect(partition.skippedFields.email.value).toBe('rahul.sharma@example.com');
      expect(partition.skippedFields.phone).toBeDefined();
      expect(partition.skippedFields.phone.value).toBe('+919876543210');

      // Verified fields must NOT be in remainingPendingFields
      expect(partition.remainingPendingFields).not.toContain('applicantFullName');
      expect(partition.remainingPendingFields).not.toContain('email');
      expect(partition.remainingPendingFields).not.toContain('phone');

      // Only unverified/missing fields remain
      expect(partition.remainingPendingFields).toEqual(['annualIncome']);
    });

    it('should import previous application answers and treat them as verified', () => {
      const previousApps = [
        {
          _id: 'app_history_2025',
          answers: {
            college: 'Indian Institute of Technology Bombay',
            degree: 'B.Tech Computer Science'
          }
        }
      ];

      service.importPreviousApplications(graph, previousApps);

      expect(graph.education.college.value).toBe('Indian Institute of Technology Bombay');
      expect(graph.education.degree.value).toBe('B.Tech Computer Science');

      const partition = service.partitionInterviewFields(graph, ['college', 'degree', 'cgpa']);

      expect(partition.skippedFields.college).toBeDefined();
      expect(partition.skippedFields.degree).toBeDefined();
      expect(partition.remainingPendingFields).toEqual(['cgpa']);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. MISSING FIELD ASKED
  // ─────────────────────────────────────────────────────────────
  describe('2. Missing field asked', () => {
    it('should identify unpopulated fields as UNKNOWN and ask for them directly', () => {
      const evaluation = service.getFieldStatus(graph, 'financial.annualIncome');
      expect(evaluation.status).toBe('UNKNOWN');
      expect(evaluation.node).toBeNull();

      const partition = service.partitionInterviewFields(graph, ['annualIncome']);
      expect(partition.remainingPendingFields).toContain('annualIncome');
      expect(partition.skippedFields.annualIncome).toBeUndefined();
      expect(partition.confirmationFields.annualIncome).toBeUndefined();
      expect(partition.conflictFields.annualIncome).toBeUndefined();
    });

    it('should ingest user response for missing field as verified USER_INPUT with confidence 1.0', () => {
      const path = service.resolvePath('annualIncome');
      expect(path).toBe('financial.annualIncome');

      const result = service.ingestValue(graph, {
        path,
        value: '₹6,00,000',
        source: KnowledgeSourceType.USER_INPUT,
        confidence: 1.0,
        evidence: 'Provided by applicant during conversational interview'
      });

      expect(result.status).toBe('INGESTED');
      expect(graph.financial.annualIncome.value).toBe('₹6,00,000');
      expect(graph.financial.annualIncome.source).toBe(KnowledgeSourceType.USER_INPUT);
      expect(graph.financial.annualIncome.confidence).toBe(1.0);
      expect(graph.financial.annualIncome.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. CONFLICT ASKED
  // ─────────────────────────────────────────────────────────────
  describe('3. Conflict asked', () => {
    it('should detect conflicting evidence, ask user to resolve, and never silently overwrite', () => {
      // Document 1 provides DOB
      service.ingestValue(graph, {
        path: 'identity.dateOfBirth',
        value: '14-08-2006',
        source: KnowledgeSourceType.DOCUMENT,
        confidence: 0.95,
        evidence: 'AadhaarCard.pdf'
      });

      // Document 2 provides differing DOB -> conflict detected!
      const conflictResult = service.ingestValue(graph, {
        path: 'identity.dateOfBirth',
        value: '15-08-2006',
        source: KnowledgeSourceType.DOCUMENT,
        confidence: 0.95,
        evidence: '10th_Marksheet.pdf'
      });

      expect(conflictResult.status).toBe('CONFLICT_DETECTED');
      expect(graph.conflicts.length).toBe(1);

      // Check field status
      const status = service.getFieldStatus(graph, 'dob');
      expect(status.status).toBe(KnowledgeVerificationStatus.CONFLICT);
      expect(status.conflict).toBeDefined();
      expect(status.conflict.existingValue.value).toBe('14-08-2006');
      expect(status.conflict.conflictingValue.value).toBe('15-08-2006');

      // Partitioning puts it into conflictFields and remainingPendingFields
      const partition = service.partitionInterviewFields(graph, ['dob']);
      expect(partition.conflictFields.dob).toBeDefined();
      expect(partition.conflictFields.dob.existingValue).toBe('14-08-2006');
      expect(partition.conflictFields.dob.conflictingValue).toBe('15-08-2006');
      expect(partition.remainingPendingFields).toContain('dob');
    });

    it('should resolve conflict when user chooses one of the records', () => {
      service.ingestValue(graph, {
        path: 'identity.fullName',
        value: 'Rahul Kumar',
        source: KnowledgeSourceType.DOCUMENT,
        confidence: 0.90
      });
      service.ingestValue(graph, {
        path: 'identity.fullName',
        value: 'Rahul K',
        source: KnowledgeSourceType.DOCUMENT,
        confidence: 0.88
      });

      expect(service.hasActiveConflicts(graph)).toBe(true);

      // User resolves conflict choosing 'Rahul Kumar'
      const resolution = service.resolveFieldConflict(graph, {
        path: 'identity.fullName',
        resolvedValue: 'Rahul Kumar',
        resolvedSource: KnowledgeSourceType.USER_INPUT,
        resolvedBy: 'USER'
      });

      expect(resolution).toBeDefined();
      expect(graph.identity.fullName.value).toBe('Rahul Kumar');
      expect(graph.identity.fullName.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);
      expect(graph.identity.fullName.confidence).toBe(1.0);
      expect(service.hasActiveConflicts(graph)).toBe(false);

      // Re-evaluating now reports VERIFIED (ready to skip)
      const newStatus = service.getFieldStatus(graph, 'identity.fullName');
      expect(newStatus.status).toBe(KnowledgeVerificationStatus.VERIFIED);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. UNCERTAIN FIELD CONFIRMED
  // ─────────────────────────────────────────────────────────────
  describe('4. Uncertain field confirmed', () => {
    it('should flag fields with low confidence (< 0.85) for confirmation instead of asking from scratch', () => {
      // Ingest uncertain value (e.g. blurry OCR result with confidence 0.72)
      service.ingestValue(graph, {
        path: 'family.fatherName',
        value: 'Rajesh Sharma',
        source: KnowledgeSourceType.DOCUMENT,
        confidence: 0.72,
        evidence: 'Blurry Ration Card scan'
      });

      const evaluation = service.getFieldStatus(graph, 'fatherName');
      expect(evaluation.status).toBe(KnowledgeVerificationStatus.CONFIRMATION_REQUIRED);
      expect(evaluation.node.value).toBe('Rajesh Sharma');
      expect(evaluation.node.confidence).toBe(0.72);

      const partition = service.partitionInterviewFields(graph, ['fatherName']);
      expect(partition.confirmationFields.fatherName).toBeDefined();
      expect(partition.confirmationFields.fatherName.value).toBe('Rajesh Sharma');
      expect(partition.remainingPendingFields).toContain('fatherName');
      expect(partition.skippedFields.fatherName).toBeUndefined();
    });

    it('should promote uncertain value to VERIFIED with 1.0 confidence when user confirms', () => {
      service.ingestValue(graph, {
        path: 'family.fatherName',
        value: 'Rajesh Sharma',
        source: KnowledgeSourceType.DOCUMENT,
        confidence: 0.72
      });

      // User confirms the value
      service.ingestValue(graph, {
        path: 'family.fatherName',
        value: 'Rajesh Sharma',
        source: KnowledgeSourceType.USER_INPUT,
        confidence: 1.0,
        evidence: 'User confirmed via conversational interview'
      });

      expect(graph.family.fatherName.value).toBe('Rajesh Sharma');
      expect(graph.family.fatherName.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);
      expect(graph.family.fatherName.confidence).toBe(1.0);

      const evaluation = service.getFieldStatus(graph, 'fatherName');
      expect(evaluation.status).toBe(KnowledgeVerificationStatus.VERIFIED);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. 50+ FIELD WORKFLOW SCALABILITY
  // ─────────────────────────────────────────────────────────────
  describe('5. 50+ Field Workflow Scalability', () => {
    it('should scale to 55+ fields, skip 50 verified fields, and ask only 5 pending fields one at a time', () => {
      // Generate 55 comprehensive portal fields across all domains
      const all55Fields = [];

      // 10 Identity fields
      const identityKeys = ['fullName', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'aadhaarNumber', 'panNumber', 'passportNumber', 'category', 'nationality'];
      identityKeys.forEach(k => all55Fields.push(`identity.${k}`));

      // 6 Contact fields
      const contactKeys = ['email', 'phone', 'alternatePhone', 'emergencyContact', 'whatsappNumber', 'landline'];
      contactKeys.forEach(k => all55Fields.push(`contact.${k}`));

      // 8 Address fields
      const addressKeys = ['street', 'city', 'state', 'pincode', 'country', 'district', 'landmark', 'addressType'];
      addressKeys.forEach(k => all55Fields.push(`address.${k}`));

      // 10 Education fields
      const eduKeys = ['college', 'degree', 'cgpa', 'tenthMarks', 'twelfthMarks', 'passingYear', 'specialization', 'board', 'school', 'rollNumber'];
      eduKeys.forEach(k => all55Fields.push(`education.${k}`));

      // 8 Family fields
      const familyKeys = ['fatherName', 'motherName', 'guardianName', 'fatherOccupation', 'motherOccupation', 'familyAnnualIncome', 'siblingsCount', 'guardianPhone'];
      familyKeys.forEach(k => all55Fields.push(`family.${k}`));

      // 8 Financial fields
      const finKeys = ['annualIncome', 'bankAccountNumber', 'bankIfsc', 'bankName', 'accountHolderName', 'panCard', 'taxStatus', 'scholarshipStatus'];
      finKeys.forEach(k => all55Fields.push(`financial.${k}`));

      // 5 Document fields
      const docKeys = ['idProof', 'incomeProof', 'marksheet10', 'marksheet12', 'photo'];
      docKeys.forEach(k => all55Fields.push(`documents.${k}`));

      expect(all55Fields.length).toBe(55);

      // Pre-populate 50 of the 55 fields with high-confidence verified data in Knowledge Graph
      const fieldsToVerify = all55Fields.slice(0, 50);
      const fieldsToLeavePending = all55Fields.slice(50); // Exactly 5 fields remain

      const startTime = performance.now();

      for (const fieldPath of fieldsToVerify) {
        service.ingestValue(graph, {
          path: fieldPath,
          value: `Val_${fieldPath.replace('.', '_')}`,
          source: KnowledgeSourceType.DOCUMENT,
          confidence: 0.95
        });
      }

      // Run partition on all 55 fields
      const partition = service.partitionInterviewFields(graph, all55Fields);
      const duration = performance.now() - startTime;

      // Scalability assertion: partition completes well under 100ms
      expect(duration).toBeLessThan(100);

      // Verify exactly 50 fields are skipped
      expect(Object.keys(partition.skippedFields).length).toBe(50);
      for (const fieldPath of fieldsToVerify) {
        expect(partition.skippedFields[fieldPath]).toBeDefined();
        expect(partition.skippedFields[fieldPath].value).toBe(`Val_${fieldPath.replace('.', '_')}`);
      }

      // Verify exactly 5 fields remain pending
      expect(partition.remainingPendingFields.length).toBe(5);
      expect(partition.remainingPendingFields).toEqual(fieldsToLeavePending);

      // Simulate sequential ONE-AT-A-TIME question answering loop
      const pendingAnswers = new Map();
      // Pre-fill answers from skipped fields
      for (const [k, v] of Object.entries(partition.skippedFields)) {
        pendingAnswers.set(k, v.value);
      }

      let activePending = [...partition.remainingPendingFields];
      while (activePending.length > 0) {
        // Exactly ONE question active
        const currentField = activePending[0];
        expect(currentField).toBeDefined();

        // User supplies answer for current field
        const userAnswer = `Answer_for_${currentField}`;
        pendingAnswers.set(currentField, userAnswer);

        // Ingest into graph
        service.ingestValue(graph, {
          path: currentField,
          value: userAnswer,
          source: KnowledgeSourceType.USER_INPUT,
          confidence: 1.0
        });

        // Advance to next
        activePending = activePending.slice(1);
      }

      // Final state: all 55 fields answered
      expect(pendingAnswers.size).toBe(55);
      expect(activePending.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. RESUME INTERVIEW
  // ─────────────────────────────────────────────────────────────
  describe('6. Resume Interview', () => {
    it('should resume paused interview from exact next pending question without re-asking answered fields', async () => {
      // Mock InterviewState document
      const mockStateId = 'state_resume_test_123';
      const mockUserId = 'user_phase14_test';

      const existingAnswers = new Map([
        ['applicantFullName', 'Rahul Kumar'],
        ['email', 'rahul@example.com'],
        ['phone', '+919876543210']
      ]);

      const mockInterviewState = {
        _id: mockStateId,
        userId: mockUserId,
        status: 'IN_PROGRESS',
        answers: existingAnswers,
        completedFields: ['applicantFullName', 'email', 'phone'],
        pendingFields: ['education.college', 'education.cgpa'],
        currentField: 'education.college',
        workflowId: {
          schemaDefinition: {
            pages: [
              {
                steps: [
                  { id: 'applicantFullName', label: 'Full Name' },
                  { id: 'email', label: 'Email Address' },
                  { id: 'phone', label: 'Mobile Number' },
                  { id: 'education.college', label: 'College / Institute Name' },
                  { id: 'education.cgpa', label: 'Cumulative GPA' }
                ]
              }
            ]
          }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      const mockConversation = {
        _id: 'conv_resume_test_123',
        userId: mockUserId,
        metadata: { interviewStateId: mockStateId }
      };

      // Spy on Mongoose models
      jest.spyOn(InterviewState, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockInterviewState)
      });
      jest.spyOn(Conversation, 'findOne').mockResolvedValue(mockConversation);
      jest.spyOn(ApplicantKnowledgeGraph, 'findOne').mockResolvedValue(graph);
      jest.spyOn(Message, 'create').mockImplementation(async ({ content, metadata }) => ({
        content,
        metadata
      }));

      const resumeResult = await resumeInterview(mockUserId, mockStateId);

      expect(resumeResult.isCompleted).toBe(false);
      expect(resumeResult.state.currentField).toBe('education.college');
      expect(resumeResult.currentQuestion.content).toContain('College / Institute Name');

      // Crucial: completed fields preserved
      expect(resumeResult.state.completedFields).toContain('applicantFullName');
      expect(resumeResult.state.completedFields).toContain('email');
      expect(resumeResult.state.completedFields).toContain('phone');
      expect(resumeResult.state.pendingFields).not.toContain('applicantFullName');
      expect(resumeResult.state.pendingFields).not.toContain('email');

      // Cleanup spies
      jest.restoreAllMocks();
    });

    it('should complete interview on resume if all pending fields were satisfied in background', async () => {
      const mockStateId = 'state_resume_complete_123';
      const mockUserId = 'user_phase14_test';

      // Background knowledge has college verified
      service.ingestValue(graph, {
        path: 'education.college',
        value: 'IIT Madras',
        source: KnowledgeSourceType.DOCUMENT,
        confidence: 0.95
      });

      const mockInterviewState = {
        _id: mockStateId,
        userId: mockUserId,
        status: 'IN_PROGRESS',
        answers: new Map([['applicantFullName', 'Rahul Kumar']]),
        completedFields: ['applicantFullName'],
        pendingFields: ['education.college'], // was pending, but now verified in graph!
        currentField: 'education.college',
        workflowId: { schemaDefinition: { pages: [] } },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(InterviewState, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockInterviewState)
      });
      jest.spyOn(Conversation, 'findOne').mockResolvedValue({ _id: 'conv_123' });
      jest.spyOn(ApplicantKnowledgeGraph, 'findOne').mockResolvedValue(graph);

      const resumeResult = await resumeInterview(mockUserId, mockStateId);

      expect(resumeResult.isCompleted).toBe(true);
      expect(resumeResult.state.status).toBe('COMPLETED');
      expect(resumeResult.state.answers.get('education.college')).toBe('IIT Madras');

      jest.restoreAllMocks();
    });
  });
});
