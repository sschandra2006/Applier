import { Router } from 'express';
import { requireJwtAuth } from '../auth/jwt.middleware.js';
import { analyzeUrl } from './workflow.controller.js';

const router = Router();

router.use(requireJwtAuth);

router.post('/analyze', analyzeUrl);

export default router;
