/**
 * Canonical Professional Profile Routes
 */

import express from 'express';
import {
  getProfessionalProfile,
  updateProfessionalProfile,
  verifyProfessionalProfile,
  deleteProfileItem
} from './profile.controller.js';
import { requireJwtAuth } from '../auth/jwt.middleware.js';

const router = express.Router();

router.use(requireJwtAuth);

router.get('/', getProfessionalProfile);
router.put('/', updateProfessionalProfile);
router.post('/verify', verifyProfessionalProfile);
router.delete('/:section/:itemId', deleteProfileItem);

export default router;
