/**
 * Resume Ingestion & Vault Service
 * Handles secure file validation, AES-256-GCM encryption at rest,
 * idempotency hashing, AI extraction delegation, and profile merging.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { MasterResume } from './master-resume.model.js';
import { ProfessionalProfile } from '../users/professional-profile.model.js';
import { internalApi } from '../config/axios.js';
import { config } from '../config/env.js';
import {
  defaultFileSecurityService,
  defaultDocumentEncryptionService,
  defaultSecurityAuditService,
  FileSecurityError
} from '../security/index.js';
import { MasterResumeStatus, ProfileVerificationStatus } from '../../../shared/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESUME_VAULT_DIR = path.join(__dirname, '../../../uploads/resumes');

// Ensure isolated vault directory exists
if (!fs.existsSync(RESUME_VAULT_DIR)) {
  fs.mkdirSync(RESUME_VAULT_DIR, { recursive: true });
}

export class ResumeIngestionService {
  constructor(options = {}) {
    this.fileSecurity = options.fileSecurity || defaultFileSecurityService;
    this.encryption = options.encryption || defaultDocumentEncryptionService;
    this.audit = options.audit || defaultSecurityAuditService;
    this.pythonApiUrl = options.pythonApiUrl || config.pythonApiUrl;
  }

  /**
   * Ingests, encrypts, and processes an uploaded master resume file.
   */
  async ingestResume({ userId, fileBuffer, originalName, mimeType, forceReprocess = false }) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new FileSecurityError('Uploaded resume file is empty (0 bytes).', { code: 'EMPTY_FILE' });
    }

    const cleanName = this.fileSecurity.sanitizeFilename(originalName || 'resume.pdf');
    const ext = path.extname(cleanName).toLowerCase();

    // 1. Strict Extension Whitelist for Resumes
    if (!['.pdf', '.docx', '.doc', '.txt'].includes(ext)) {
      throw new FileSecurityError(
        `Unsupported resume file format "${ext}". Only PDF and DOCX files are accepted.`,
        { code: 'UNSUPPORTED_RESUME_FORMAT' }
      );
    }

    // 2. Deep File Security Validation (magic bytes, size, malware check)
    await this.fileSecurity.validateFile({
      filename: cleanName,
      buffer: fileBuffer,
      size: fileBuffer.length
    });

    // 3. Compute SHA-256 for Idempotency
    const fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // 4. Check for Existing Duplicate Upload by same user
    const existingResume = await MasterResume.findOne({
      userId,
      fileSha256,
      isArchived: false
    });

    if (existingResume && !forceReprocess && existingResume.status === MasterResumeStatus.PARSED) {
      this.audit.logEvent({
        eventType: 'IDEMPOTENT_RESUME_UPLOAD_HIT',
        userId,
        details: { resumeId: existingResume._id, fileSha256 }
      });

      const profile = await ProfessionalProfile.findOne({ userId });
      return {
        isDuplicate: true,
        masterResume: existingResume,
        profile,
        message: 'This resume has already been uploaded and processed. Verified profile information was preserved.'
      };
    }

    // 5. Encrypt at rest and save to vault storage
    const encryptedResult = this.encryption.encryptBuffer(fileBuffer);
    const storageFileName = `res_${userId}_${Date.now()}_${cleanName}.enc`;
    const storagePath = path.join(RESUME_VAULT_DIR, storageFileName);
    fs.writeFileSync(storagePath, encryptedResult.packaged);

    // 6. Create MasterResume tracking record in MongoDB
    const masterResume = new MasterResume({
      userId,
      fileName: storageFileName,
      originalName: cleanName,
      mimeType: mimeType || (ext === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      fileSizeBytes: fileBuffer.length,
      storagePath: storagePath,
      fileSha256,
      status: MasterResumeStatus.PARSING
    });
    await masterResume.save();

    // 7. Dispatch to Python AI Microservice for text & structured extraction
    let aiResponse;
    try {
      const fileBase64 = fileBuffer.toString('base64');
      const response = await internalApi.post(this.pythonApiUrl, {
        intent: 'extract_resume',
        raw_data: {
          fileBase64,
          fileName: cleanName,
          mimeType: masterResume.mimeType
        }
      });

      aiResponse = response.data;
      if (!aiResponse.success || !aiResponse.data) {
        throw new Error(aiResponse.error || 'AI Service returned unsuccessful extraction result');
      }
    } catch (aiErr) {
      masterResume.status = MasterResumeStatus.FAILED;
      masterResume.error = aiErr.message;
      await masterResume.save();

      this.audit.logEvent({
        eventType: 'RESUME_EXTRACTION_FAILED',
        userId,
        details: { resumeId: masterResume._id, error: aiErr.message }
      });
      throw new Error(`Resume intelligence extraction failed: ${aiErr.message}`);
    }

    const extractedProfileData = aiResponse.data.data;
    const extractionMeta = extractedProfileData.metadata || {};

    // 8. Update MasterResume status
    masterResume.status = MasterResumeStatus.PARSED;
    masterResume.rawExtractedText = extractedProfileData.rawTextSnippet || '';
    masterResume.extractionMetadata = {
      pages: extractionMeta.pages || 1,
      wordCount: extractionMeta.wordCount || 0,
      ocrUsed: extractionMeta.ocrUsed || false,
      method: extractionMeta.ocrUsed ? 'OCR_TESSERACT' : 'NATIVE_PYMUPDF'
    };
    await masterResume.save();

    // 9. Load or Create ProfessionalProfile & Merge
    let profile = await ProfessionalProfile.findOne({ userId });
    if (!profile) {
      profile = new ProfessionalProfile({
        userId,
        version: 1,
        isVerified: false
      });
    }

    // Merge extracted data while strictly preserving verified fields
    profile.mergeExtractedResume(extractedProfileData, masterResume._id);
    await profile.save();

    this.audit.logEvent({
      eventType: 'RESUME_INGESTION_COMPLETED',
      userId,
      details: {
        resumeId: masterResume._id,
        profileVersion: profile.version,
        skillsExtracted: (profile.skills || []).length,
        experienceCount: (profile.experience || []).length
      }
    });

    return {
      isDuplicate: false,
      masterResume,
      profile,
      message: 'Resume uploaded and career profile extracted successfully. Please review and verify your details.'
    };
  }

  /**
   * Retrieves and decrypts original master resume for authorized owner only.
   */
  async getDecryptedResume(userId, resumeId) {
    const resume = await MasterResume.findById(resumeId);
    if (!resume) {
      throw new Error('Resume not found in Vault.');
    }

    // Strict Authorization Check: Document Ownership
    if (resume.userId.toString() !== userId.toString()) {
      this.audit.logEvent({
        eventType: 'UNAUTHORIZED_RESUME_ACCESS_BLOCKED',
        userId,
        details: { resumeId, ownerId: resume.userId }
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

    return {
      buffer: decryptedBuffer,
      originalName: resume.originalName,
      mimeType: resume.mimeType
    };
  }
}

export const defaultResumeIngestionService = new ResumeIngestionService();
export default defaultResumeIngestionService;
