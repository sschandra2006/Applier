import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { getUserTimeline } from './tracking.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/timeline', getUserTimeline);

export default router;
