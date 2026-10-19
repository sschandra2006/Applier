/**
 * Tailored Resume Generation & Vault Service
 * Coordinates tailoring requests, delegates to AI microservice,
 * validates ground truth, encrypts compiled PDFs at rest using AES-256-GCM,
 * and maintains versioned traceability in MongoDB.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { GeneratedResume } from './generated-resume.model.js';
import { ProfessionalProfile } from '../users/professional-profile.model.js';
import { internalApi } from '../config/axios.js';
import { config } from '../config/env.js';
import {
  defaultDocumentEncryptionService,
  defaultSecurityAuditService,
  defaultFileSecurityService
} from '../security/index.js';
import {
  GeneratedResumeStatus,
  ResumeTemplateId,
  SecurityAuditEventType
} from '../../../shared/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TAILORED_VAULT_DIR = path.join(__dirname, '../../../uploads/tailored_resumes');

if (!fs.existsSync(TAILORED_VAULT_DIR)) {
  fs.mkdirSync(TAILORED_VAULT_DIR, { recursive: true });
}

export class ResumeGenerationService {
  constructor(options = {}) {
    this.encryption = options.encryption || defaultDocumentEncryptionService;
    this.audit = options.audit || defaultSecurityAuditService;
    this.fileSecurity = options.fileSecurity || defaultFileSecurityService;
    this.pythonApiUrl = options.pythonApiUrl || config.pythonApiUrl;
  }

  /**
   * Generates a tailored resume, compiles to PDF, encrypts at rest, and saves to Vault.
   */
  async generateAndSaveTailoredResume({
    userId,
    applicationSessionId = null,
    jobTitle,
    company,
    jobDescription,
    templateId = ResumeTemplateId.ATS_SINGLE_COLUMN,
    userConfirmedGaps = {},
    jobMatchReport = null
  }) {
    if (!jobTitle) {
      throw new Error('jobTitle is required for tailored resume generation.');
    }
    if (!jobDescription) {
      throw new Error('jobDescription is required for tailored resume generation.');
    }

    // 1. Fetch user's authoritative ProfessionalProfile
    const profileDoc = await ProfessionalProfile.findOne({ userId });
    if (!profileDoc) {
      throw new Error('No professional profile found for user. Please upload a master resume first.');
    }

    const profile = profileDoc.toObject();
    const sourceProfileVersion = profile.version || 1;

    // 2. Delegate to Python AI microservice
    let aiResponse;
    try {
      const response = await internalApi.post(this.pythonApiUrl, {
        intent: 'generate_tailored_resume',
        raw_data: {
          profile,
          jobTitle,
          company: company || 'Target Employer',
          jobDescription,
          jobMatchReport,
          templateId,
          userConfirmedGaps
        }
      });

      aiResponse = response.data;
    } catch (err) {
      throw new Error(`AI resume tailoring service error: ${err.message}`);
    }

    if (!aiResponse || !aiResponse.success || !aiResponse.data) {
      throw new Error(aiResponse?.error || 'AI microservice failed to generate tailored resume.');
    }

    const agentResult = aiResponse.data.data || aiResponse.data;
    const {
      pdfBase64,
      latexSource,
      validationReport,
      matchedKeywords,
      tailoredSummary,
      resumeContent,
      provenanceMap,
      pageCount = 1
    } = agentResult;

    if (!pdfBase64) {
      throw new Error('AI microservice did not return compiled PDF data.');
    }

    // 3. Decode PDF buffer and compute SHA-256
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const fileSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // 4. Encrypt PDF at rest using AES-256-GCM
    const encryptedResult = this.encryption.encryptBuffer(pdfBuffer);
    const sanitizedJob = (jobTitle || 'Resume').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const storageFileName = `tailored_${userId}_${Date.now()}_${sanitizedJob}.enc`;
    const storagePath = path.join(TAILORED_VAULT_DIR, storageFileName);

    fs.writeFileSync(storagePath, encryptedResult.packaged);

    // 5. Create versioned GeneratedResume record in MongoDB Vault
    const generatedResume = new GeneratedResume({
      userId,
      applicationSessionId,
      sourceProfileVersion,
      company: company || 'Target Employer',
      jobTitle,
      templateId,
      storagePath,
      fileSha256,
      fileSizeBytes: pdfBuffer.length,
      pageCount,
      latexSource: latexSource || '',
      tailoredSummary: tailoredSummary || '',
      matchedKeywords: matchedKeywords || [],
      status: validationReport?.isValid ? GeneratedResumeStatus.VALIDATED : GeneratedResumeStatus.FAILED,
      validationReport: validationReport || {},
      resumeContent: resumeContent || null,
      provenanceMap: provenanceMap || {}
    });

    await generatedResume.save();

    return {
      generatedResume,
      validationReport,
      pdfBuffer
    };
  }

  /**
   * Retrieves and decrypts a tailored resume for its owner.
   */
  async getDecryptedTailoredResume(userId, resumeId) {
    const resume = await GeneratedResume.findById(resumeId);
    if (!resume) {
      throw new Error('Tailored resume not found in Vault.');
    }

    if (resume.userId.toString() !== userId.toString()) {
      this.audit.logEvent({
        eventType: SecurityAuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
        userId,
        details: { resumeId, ownerId: resume.userId, resource: 'TAILORED_RESUME' }
      });
      const err = new Error('Unauthorized access: You do not have permission to view or download this document.');
      err.status = 403;
      err.code = 'ACCESS_DENIED';
      throw err;
    }

    if (!fs.existsSync(resume.storagePath)) {
      throw new Error('Encrypted resume file is missing from Vault storage.');
    }

    const encryptedPackage = fs.readFileSync(resume.storagePath);
    const decryptedBuffer = this.encryption.decryptBuffer(encryptedPackage);

    const safeName = `${resume.company}_${resume.jobTitle}_Resume.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');

    return {
      buffer: decryptedBuffer,
      originalName: safeName,
      mimeType: 'application/pdf',
      resume
    };
  }

  /**
   * Lists all active tailored resumes for a user.
   */
  async listTailoredResumes(userId) {
    return GeneratedResume.find({
      userId,
      isArchived: false
    }).sort({ createdAt: -1 });
  }

  /**
   * Gets single tailored resume metadata for user.
   */
  async getTailoredResumeById(userId, resumeId) {
    const resume = await GeneratedResume.findById(resumeId);
    if (!resume) {
      return null;
    }
    if (resume.userId.toString() !== userId.toString()) {
      const err = new Error('Unauthorized access to tailored resume.');
      err.status = 403;
      err.code = 'ACCESS_DENIED';
      throw err;
    }
    return resume;
  }

  /**
   * Soft-deletes / archives a tailored resume.
   */
  async archiveTailoredResume(userId, resumeId) {
    const resume = await GeneratedResume.findById(resumeId);
    if (!resume) {
      return null;
    }
    if (resume.userId.toString() !== userId.toString()) {
      const err = new Error('Unauthorized access: You do not own this document.');
      err.status = 403;
      err.code = 'ACCESS_DENIED';
      throw err;
    }
    resume.isArchived = true;
    resume.status = GeneratedResumeStatus.ARCHIVED;
    await resume.save();
    return resume;
  }
}

export const defaultResumeGenerationService = new ResumeGenerationService();
export default defaultResumeGenerationService;
