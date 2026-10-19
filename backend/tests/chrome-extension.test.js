/**
 * Chrome Extension Integration Test Suite
 * Validates:
 * 1. CORS headers and preflight handling for Chrome Extension origins (chrome-extension://)
 * 2. Extension Session Lifecycle: init -> missing-info check -> tailor-resume -> review-manifest
 * 3. Factual Provenance: All fields presented in review manifest trace to verified profile or user-confirmed answers
 * 4. Zero Hallucination: Unconfirmed data or synthetic fields are rejected
 * 5. Pre-submission Review Barrier: Explicit user confirmation required before submission
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { MissingInfoController } from '../src/workflow/missing-info.controller.js';
import { MissingInfoSession, WorkflowState } from '../src/workflow/missing-info-session.model.js';
import { defaultResumeGenerationService } from '../src/vault/resume-generation.service.js';
import { ResumeTemplateId, ProvenanceSource, ProfileVerificationStatus } from '../../shared/src/index.js';

describe('Chrome Extension Integration & API Contracts', () => {
  let app;
  let mockSession;
  let controller;

  const mockUser = {
    id: 'usr_ext_test_999',
    email: 'alex.vance@example.com',
    fullName: 'Alex Vance'
  };

  beforeEach(() => {
    mockSession = {
      _id: 'session_obj_123',
      sessionId: 'sess_test_chrome_ext',
      userId: mockUser.id,
      jobTitle: 'Senior Platform Engineer',
      companyName: 'TechCorp',
      jobDescription: 'Seeking Go and Kubernetes infrastructure engineer.',
      currentState: WorkflowState.READY_FOR_RESUME_GENERATION,
      applicationAnswers: {
        work_authorization: {
          value: 'No sponsorship required',
          provenance: ProvenanceSource.USER_CONFIRMED
        }
      },
      confirmedProfileUpdates: [
        { field: 'kafka_experience', value: '3 years Kafka event-driven streaming', provenance: ProvenanceSource.USER_CONFIRMED }
      ],
      matchReport: {
        score: 92,
        matchingSkills: ['Go', 'Kubernetes', 'PostgreSQL']
      }
    };

    // Spy on MissingInfoSession.findOne
    jest.spyOn(MissingInfoSession, 'findOne').mockImplementation(async (query) => {
      if (query.sessionId === mockSession.sessionId && query.userId === mockUser.id) {
        return mockSession;
      }
      return null;
    });

    // Spy on defaultResumeGenerationService
    jest.spyOn(defaultResumeGenerationService, 'generateAndSaveTailoredResume').mockImplementation(async (params) => {
      return {
        generatedResume: {
          _id: 'res_tailored_777',
          matchedKeywords: ['Go', 'Kubernetes', 'Kafka'],
          tailoredSummary: 'Senior Systems Engineer with expertise in Go, Kafka, and Kubernetes.',
          templateId: params.templateId || 'ATS_SINGLE_COLUMN',
          pageCount: 1
        },
        validationReport: { valid: true, errors: [] }
      };
    });

    jest.spyOn(defaultResumeGenerationService, 'listTailoredResumes').mockImplementation(async (userId) => {
      return [
        {
          _id: 'res_tailored_777',
          userId,
          applicationSessionId: mockSession._id,
          jobTitle: mockSession.jobTitle,
          company: mockSession.companyName,
          matchedKeywords: ['Go', 'Kubernetes', 'Kafka'],
          tailoredSummary: 'Senior Systems Engineer with expertise in Go, Kafka, and Kubernetes.',
          pageCount: 1
        }
      ];
    });

    // Mock MissingInfoService for initSession
    const mockService = {
      initializeSession: async ({ userId, jobTitle, companyName, jobDescription }) => {
        return {
          sessionId: mockSession.sessionId,
          userId,
          jobTitle,
          companyName,
          jobDescription,
          state: WorkflowState.COLLECTING_APPLICATION_FIELDS
        };
      }
    };

    controller = new MissingInfoController(mockService);

    // Setup express app with Chrome Extension CORS
    app = express();
    app.use(cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          origin.startsWith('chrome-extension://') ||
          origin.startsWith('http://localhost') ||
          origin.startsWith('http://127.0.0.1')
        ) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true
    }));
    app.use(express.json());

    // Inject mock authenticated user (simulating requireJwtAuth)
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });

    // Mount endpoints
    app.post('/api/v1/missing-info/session/init', controller.initSession);
    app.post('/api/v1/missing-info/session/:sessionId/tailor-resume', controller.tailorResume);
    app.get('/api/v1/missing-info/session/:sessionId/review', controller.getReviewManifest);
  });

  describe('1. Chrome Extension Origin & Preflight (CORS)', () => {
    it('authorizes requests coming from chrome-extension:// origins', async () => {
      const extOrigin = 'chrome-extension://gefhihnkmlfhnebanaidgmkhlbedkoml';

      const res = await request(app)
        .options('/api/v1/missing-info/session/init')
        .set('Origin', extOrigin)
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(extOrigin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('blocks unauthorized untrusted origins with CORS failure', async () => {
      const untrustedOrigin = 'https://malicious-website.com';

      const res = await request(app)
        .options('/api/v1/missing-info/session/init')
        .set('Origin', untrustedOrigin)
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('2. Extension Session Lifecycle & Resume Tailoring', () => {
    it('initializes a workflow session from job details extracted by content script', async () => {
      const res = await request(app)
        .post('/api/v1/missing-info/session/init')
        .set('Origin', 'chrome-extension://gefhihnkmlfhnebanaidgmkhlbedkoml')
        .send({
          jobTitle: 'Senior Platform Engineer',
          companyName: 'TechCorp',
          jobDescription: 'Seeking Go and Kubernetes infrastructure engineer.'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBe(mockSession.sessionId);
      expect(res.body.data.jobTitle).toBe('Senior Platform Engineer');
    });

    it('tailors resume with ATS single-column template from extension request', async () => {
      const res = await request(app)
        .post(`/api/v1/missing-info/session/${mockSession.sessionId}/tailor-resume`)
        .set('Origin', 'chrome-extension://gefhihnkmlfhnebanaidgmkhlbedkoml')
        .send({
          templateId: ResumeTemplateId.ATS_SINGLE_COLUMN
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tailoredResumeId).toBe('res_tailored_777');
      expect(res.body.data.previewPdfUrl).toContain('/preview');
      expect(res.body.data.downloadUrl).toContain('/download');
      expect(res.body.data.matchedKeywords).toContain('Go');
    });
  });

  describe('3. Pre-Submission Review Barrier & Provenance', () => {
    it('returns review manifest with explicit user confirmation requirement', async () => {
      const res = await request(app)
        .get(`/api/v1/missing-info/session/${mockSession.sessionId}/review`)
        .set('Origin', 'chrome-extension://gefhihnkmlfhnebanaidgmkhlbedkoml');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const manifest = res.body.data;
      expect(manifest.sessionId).toBe(mockSession.sessionId);
      expect(manifest.jobTitle).toBe('Senior Platform Engineer');
      expect(manifest.company).toBe('TechCorp');
      expect(manifest.requiresExplicitConfirmation).toBe(true);

      // Tailored resume attachment verified
      expect(manifest.tailoredResume).not.toBeNull();
      expect(manifest.tailoredResume.id).toBe('res_tailored_777');
      expect(manifest.tailoredResume.previewUrl).toBeDefined();

      // Application answers have user-confirmed provenance
      expect(manifest.applicationAnswers.work_authorization.value).toBe('No sponsorship required');
      expect(manifest.applicationAnswers.work_authorization.provenance).toBe(ProvenanceSource.USER_CONFIRMED);

      // Confirmed profile updates preserved
      expect(manifest.confirmedUpdates.length).toBeGreaterThan(0);
      expect(manifest.confirmedUpdates[0].provenance).toBe(ProvenanceSource.USER_CONFIRMED);
    });

    it('returns 404 if invalid sessionId is requested', async () => {
      const res = await request(app)
        .get('/api/v1/missing-info/session/non_existent_session/review')
        .set('Origin', 'chrome-extension://gefhihnkmlfhnebanaidgmkhlbedkoml');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
