/**
 * Document Vault Controller
 * Manages master resume uploads, downloads, listing, and archival.
 */

import multer from 'multer';
import { defaultResumeIngestionService } from './resume-ingestion.service.js';
import { defaultResumeGenerationService } from './resume-generation.service.js';
import { MasterResume } from './master-resume.model.js';

// Configure multer memory storage so file buffers can be inspected in-memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

export const uploadResumeMiddleware = upload.single('resume');

export const uploadMasterResume = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No resume file provided for upload.' });
    }

    const userId = req.user._id;
    const forceReprocess = req.body.forceReprocess === 'true' || req.body.forceReprocess === true;

    const result = await defaultResumeIngestionService.ingestResume({
      userId,
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      forceReprocess
    });

    res.status(201).json({
      success: true,
      data: {
        masterResume: result.masterResume,
        profile: result.profile,
        isDuplicate: result.isDuplicate,
        message: result.message
      }
    });
  } catch (error) {
    if (error.name === 'FileSecurityError') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code
      });
    }
    next(error);
  }
};

export const listMasterResumes = async (req, res, next) => {
  try {
    const resumes = await MasterResume.find({
      userId: req.user._id,
      isArchived: false
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: resumes
    });
  } catch (error) {
    next(error);
  }
};

export const downloadMasterResume = async (req, res, next) => {
  try {
    const { id } = req.params;
    const decrypted = await defaultResumeIngestionService.getDecryptedResume(req.user._id, id);

    res.setHeader('Content-Type', decrypted.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${decrypted.originalName}"`);
    res.setHeader('Content-Length', decrypted.buffer.length);
    res.send(decrypted.buffer);
  } catch (error) {
    if (error.status === 403 || error.code === 'ACCESS_DENIED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    next(error);
  }
};

export const archiveMasterResume = async (req, res, next) => {
  try {
    const { id } = req.params;
    const resume = await MasterResume.findById(id);

    if (!resume) {
      return res.status(404).json({ success: false, error: 'Resume not found.' });
    }

    if (resume.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied: You do not own this document.' });
    }

    resume.isArchived = true;
    await resume.save();

    res.status(200).json({
      success: true,
      data: { id, isArchived: true }
    });
  } catch (error) {
    next(error);
  }
};

export const generateTailoredResume = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      applicationSessionId,
      jobTitle,
      company,
      jobDescription,
      templateId,
      userConfirmedGaps,
      jobMatchReport
    } = req.body;

    const result = await defaultResumeGenerationService.generateAndSaveTailoredResume({
      userId,
      applicationSessionId,
      jobTitle,
      company,
      jobDescription,
      templateId,
      userConfirmedGaps,
      jobMatchReport
    });

    res.status(201).json({
      success: true,
      data: {
        tailoredResume: result.generatedResume,
        validationReport: result.validationReport
      }
    });
  } catch (error) {
    next(error);
  }
};

export const listTailoredResumes = async (req, res, next) => {
  try {
    const resumes = await defaultResumeGenerationService.listTailoredResumes(req.user._id);
    res.status(200).json({
      success: true,
      data: resumes
    });
  } catch (error) {
    next(error);
  }
};

export const getTailoredResumeMetadata = async (req, res, next) => {
  try {
    const { id } = req.params;
    const resume = await defaultResumeGenerationService.getTailoredResumeById(req.user._id, id);
    if (!resume) {
      return res.status(404).json({ success: false, error: 'Tailored resume not found.' });
    }
    res.status(200).json({
      success: true,
      data: resume
    });
  } catch (error) {
    if (error.status === 403 || error.code === 'ACCESS_DENIED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    next(error);
  }
};

export const downloadTailoredResume = async (req, res, next) => {
  try {
    const { id } = req.params;
    const decrypted = await defaultResumeGenerationService.getDecryptedTailoredResume(req.user._id, id);
    res.setHeader('Content-Type', decrypted.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${decrypted.originalName}"`);
    res.setHeader('Content-Length', decrypted.buffer.length);
    res.send(decrypted.buffer);
  } catch (error) {
    if (error.status === 403 || error.code === 'ACCESS_DENIED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    next(error);
  }
};

export const previewTailoredResume = async (req, res, next) => {
  try {
    const { id } = req.params;
    const decrypted = await defaultResumeGenerationService.getDecryptedTailoredResume(req.user._id, id);
    res.setHeader('Content-Type', decrypted.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${decrypted.originalName}"`);
    res.setHeader('Content-Length', decrypted.buffer.length);
    res.send(decrypted.buffer);
  } catch (error) {
    if (error.status === 403 || error.code === 'ACCESS_DENIED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    next(error);
  }
};

export const archiveTailoredResume = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await defaultResumeGenerationService.archiveTailoredResume(req.user._id, id);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Tailored resume not found.' });
    }
    res.status(200).json({
      success: true,
      data: { id, isArchived: true }
    });
  } catch (error) {
    if (error.status === 403 || error.code === 'ACCESS_DENIED') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    next(error);
  }
};

