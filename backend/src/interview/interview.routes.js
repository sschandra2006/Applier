import { Router } from 'express';
import { requireJwtAuth } from '../auth/jwt.middleware.js';
import { startInterviewController, processMessageController, resumeInterviewController } from './interview.controller.js';

const router = Router();

router.use(requireJwtAuth);
router.post('/start', startInterviewController);
router.post('/message', processMessageController);
router.post('/resume', resumeInterviewController);

export default router;
