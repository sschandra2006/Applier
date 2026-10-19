import express from 'express';
import { upload, uploadDocument, getDocuments, getDocumentById, deleteDocument, uploadInlineDocument } from './documents.controller.js';
import { requireJwtAuth } from '../auth/jwt.middleware.js';

const router = express.Router();

// Apply auth middleware to all document routes
router.use(requireJwtAuth);

router.get('/', getDocuments);
router.get('/:id', getDocumentById);
router.post('/upload', upload.single('document'), uploadDocument);
router.post('/inline-upload', upload.single('document'), uploadInlineDocument);
router.delete('/:id', deleteDocument);

export default router;
