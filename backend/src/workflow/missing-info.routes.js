/**
 * Missing-Information Engine Routes
 */

import express from 'express';
import { defaultMissingInfoController } from './missing-info.controller.js';
import { requireJwtAuth } from '../auth/jwt.middleware.js';

const router = express.Router();

router.use(requireJwtAuth);

router.post('/session/init', defaultMissingInfoController.initSession);
router.get('/session/:sessionId', defaultMissingInfoController.getSession);
router.get('/session/:sessionId/current-question', defaultMissingInfoController.getCurrentQuestion);
router.post('/session/:sessionId/answer', defaultMissingInfoController.submitAnswer);
router.post('/session/:sessionId/skip', defaultMissingInfoController.skipQuestion);
router.post('/session/:sessionId/cancel', defaultMissingInfoController.cancelSession);
router.post('/session/:sessionId/tailor-resume', defaultMissingInfoController.tailorResume);
router.get('/session/:sessionId/review', defaultMissingInfoController.getReviewManifest);
router.post('/session/:sessionId/interpret-field', defaultMissingInfoController.interpretField);
router.post('/session/:sessionId/fill-status', defaultMissingInfoController.recordFormFillAndAttachment);
router.post('/session/:sessionId/confirm-submission', defaultMissingInfoController.confirmSubmission);
router.post('/session/:sessionId/record-submission', defaultMissingInfoController.recordSubmissionOutcome);
router.get('/session/:sessionId/recover', defaultMissingInfoController.recoverWorkflowSession);

export default router;
