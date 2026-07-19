import { Document } from './document.model.js';
import { admin } from '../auth/firebase.js';

import { config } from '../config/env.js';

const bucket = admin.storage().bucket();
const PYTHON_API_URL = config.pythonApiUrl;

export const processDocumentUpload = async (userId, file, expectedType) => {
  // 1. Upload to Firebase
  const fileName = `documents/${userId}/${Date.now()}_${file.originalname}`;
  const fileRef = bucket.file(fileName);
  
  await fileRef.save(file.buffer, {
    metadata: { contentType: file.mimetype }
  });
  
  await fileRef.makePublic();
  const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  
  // 2. Call Python AI for Extraction
  const aiResponse = await fetch(`${PYTHON_API_URL}/documents/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileUrl, expectedType, mimeType: file.mimetype })
  });
  
  if (!aiResponse.ok) throw new Error('AI document processing failed');
  const aiResult = await aiResponse.json();
  const { extractedData, processedBy } = aiResult.data;
  
  // 3. Deterministic Validation
  let validationStatus = 'VALID';
  const validationErrors = [];
  
  for (const [key, fieldInfo] of Object.entries(extractedData)) {
    if (fieldInfo.confidence < 0.85) {
      validationStatus = 'INVALID';
      validationErrors.push(`Low confidence for field: ${key}`);
    }
  }
  
  // 4. Save to MongoDB
  const doc = await Document.create({
    userId,
    type: expectedType,
    fileName: file.originalname,
    fileUrl,
    mimeType: file.mimetype,
    extractedData,
    validationStatus,
    validationErrors,
    processedBy
  });
  
  return doc;
};
