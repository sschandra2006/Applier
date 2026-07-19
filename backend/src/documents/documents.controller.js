import { processDocumentUpload } from './documents.service.js';

export const uploadDocumentController = async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');
    const { expectedType } = req.body;
    const userId = req.user._id;
    
    const doc = await processDocumentUpload(userId, req.file, expectedType);
    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
