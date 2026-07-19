import express from 'express';
import { getProfile, updateProfile } from './users.controller.js';
import { requireJwtAuth } from '../auth/jwt.middleware.js';

const router = express.Router();

router.use(requireJwtAuth);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

export default router;
