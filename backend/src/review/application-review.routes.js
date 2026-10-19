import { Router } from 'express';
import { requireJwtAuth } from '../auth/jwt.middleware.js';
import {
  getReviewController,
  resolveConflictController,
  updateFieldController,
  confirmReviewController
} from './application-review.controller.js';

const router = Router();

router.use(requireJwtAuth);

router.get('/:interviewStateId', getReviewController);
router.post('/:interviewStateId/resolve-conflict', resolveConflictController);
router.put('/:interviewStateId/field', updateFieldController);
router.post('/:interviewStateId/confirm', confirmReviewController);

export default router;
