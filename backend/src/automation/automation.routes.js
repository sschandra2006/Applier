import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { startAutomationController, statusWebhookController } from './automation.controller.js';

const router = Router();

router.post('/webhook', statusWebhookController); // Python webhook
router.use(requireAuth);
router.post('/start', startAutomationController);

export default router;
