import express from 'express';
import { getDashboardStats, getRecentActivity, getApplications } from './tracking.controller.js';
import { requireJwtAuth } from '../auth/jwt.middleware.js';

const router = express.Router();

router.use(requireJwtAuth);

router.get('/stats', getDashboardStats);
router.get('/activity', getRecentActivity);
router.get('/applications', getApplications);

export default router;
