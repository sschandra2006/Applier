import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { startInterviewController, processMessageController } from './interview.controller.js';

const router = Router();

router.use(requireAuth);
router.post('/start', startInterviewController);
router.post('/message', processMessageController);

export default router;
