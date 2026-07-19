import { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth/auth.middleware.js';
import { getSystemStats, getAutomationQueue } from './admin.controller.js';

const router = Router();

// Strict admin protection
router.use(requireAuth);
router.use(requireAdmin);

router.get('/stats', getSystemStats);
router.get('/queue', getAutomationQueue);

export default router;
