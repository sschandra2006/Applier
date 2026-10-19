/**
 * Document Vault Routes
 * Handles master resume management as well as versioned job-tailored resume generation.
 */

import express from 'express';
import {
  uploadResumeMiddleware,
  uploadMasterResume,
  listMasterResumes,
  downloadMasterResume,
  archiveMasterResume,
  generateTailoredResume,
  listTailoredResumes,
  getTailoredResumeMetadata,
  downloadTailoredResume,
  previewTailoredResume,
  archiveTailoredResume
} from './vault.controller.js';
import { requireJwtAuth } from '../auth/jwt.middleware.js';

const router = express.Router();

router.use(requireJwtAuth);

// Master Resumes (Original Uploads)
router.post('/resumes/upload', uploadResumeMiddleware, uploadMasterResume);
router.get('/resumes', listMasterResumes);
router.get('/resumes/:id/download', downloadMasterResume);
router.delete('/resumes/:id', archiveMasterResume);

// Tailored Resumes (Generated & Versioned per Job)
router.post('/resumes/tailor', generateTailoredResume);
router.get('/resumes/tailored', listTailoredResumes);
router.get('/resumes/tailored/:id', getTailoredResumeMetadata);
router.get('/resumes/tailored/:id/download', downloadTailoredResume);
router.get('/resumes/tailored/:id/preview', previewTailoredResume);
router.delete('/resumes/tailored/:id', archiveTailoredResume);

export default router;
