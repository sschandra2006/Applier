import { Router } from 'express';
import { requireJwtAuth } from '../auth/jwt.middleware.js';
import { executeAutomationController, resumeAutomationController, statusWebhookController, getStatusController, webhookReceivePlanController } from './automation.controller.js';

const router = Router();

router.post('/webhook', statusWebhookController); // Python webhook (no auth for now)
router.post('/webhook/plan', webhookReceivePlanController); // Python execution plan callback

router.use(requireJwtAuth);
router.get('/status/:jobId', getStatusController);
router.post('/execute', executeAutomationController);
router.post('/resume', resumeAutomationController);

export default router;
