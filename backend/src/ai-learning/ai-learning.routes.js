import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth/auth.middleware.js';
import { getInsightsController, applyInsightController } from './ai-learning.controller.js';

const router = Router();

// Only Admins can view and apply AI insights
router.use(requireAuth);
router.use(requireAdmin);

router.get('/', getInsightsController);
router.patch('/:id/apply', applyInsightController);

export default router;
