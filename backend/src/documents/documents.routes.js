import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth/auth.middleware.js';
import { uploadDocumentController } from './documents.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);
router.post('/upload', upload.single('document'), uploadDocumentController);

export default router;
