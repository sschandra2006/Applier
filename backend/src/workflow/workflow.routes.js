import { Router } from 'express';
import { generateWorkflow, getWorkflows, getMarketplaceWorkflows } from './workflow.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();

router.use(requireAuth);

router.get('/marketplace', getMarketplaceWorkflows);
router.post('/generate', generateWorkflow);
router.get('/', getWorkflows);

export default router;
