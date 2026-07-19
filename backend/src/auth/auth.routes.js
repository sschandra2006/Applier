import { Router } from 'express';
import { syncLogin } from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';

const router = Router();

router.post('/sync', requireAuth, syncLogin);

export default router;
