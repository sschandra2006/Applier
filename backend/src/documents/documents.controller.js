import { Document } from './document.model.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  defaultFileSecurityService,
  defaultDocumentEncryptionService,
  defaultJobAuthorizationService,
  defaultSecurityAuditService
} from '../security/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const allowedMimeTypes = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only JPG, PNG, PDF, DOC, and TXT are allowed.`), false);
  }
};

export const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter
});

export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { expectedType } = req.body;
    if (!expectedType) {
      return res.status(400).json({ success: false, error: 'expectedType is required' });
    }

    const uploadedPath = req.file.path || path.join(uploadDir, req.file.filename);
    const fileBuffer = fs.readFileSync(uploadedPath);

    // 1. File Security Verification (Extension, Magic Bytes, Size, Malware Scan)
    try {
      await defaultFileSecurityService.validateFile({
        filename: req.file.originalname,
        buffer: fileBuffer,
        size: req.file.size
      });
    } catch (secErr) {
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      defaultSecurityAuditService.logEvent({
        eventType: secErr.code === 'MALWARE_DETECTED' ? 'MALICIOUS_UPLOAD_BLOCKED' : 'OVERSIZED_UPLOAD_BLOCKED',
        userId: req.user?._id,
        details: { filename: req.file.originalname, error: secErr.message, code: secErr.code }
      });
      return res.status(400).json({ success: false, error: secErr.message, code: secErr.code });
    }

    // 2. Encrypt sensitive document at rest
    const encrypted = defaultDocumentEncryptionService.encryptBuffer(fileBuffer);
    fs.writeFileSync(uploadedPath, encrypted.packaged);

    // Check if user already has this type of document, if so, remove old file
    const existingDoc = await Document.findOne({ userId: req.user._id, type: expectedType });
    if (existingDoc) {
      const oldFilePath = path.join(uploadDir, path.basename(existingDoc.fileUrl));
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
      await Document.deleteOne({ _id: existingDoc._id });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    const newDocument = new Document({
      userId: req.user._id,
      type: expectedType,
      fileName: defaultFileSecurityService.sanitizeFilename(req.file.originalname),
      fileUrl: fileUrl,
      mimeType: req.file.mimetype,
      validationStatus: 'VALID'
    });

    await newDocument.save();

    res.status(201).json({ success: true, data: newDocument });
  } catch (error) {
    next(error);
  }
};

export const getDocuments = async (req, res, next) => {
  try {
    const documents = await Document.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
};

export const getDocumentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    defaultJobAuthorizationService.authorizeDocumentAccess(req.user, document);

    res.status(200).json({ success: true, data: document });
  } catch (error) {
    if (error.name === 'UnauthorizedAccessError') {
      defaultSecurityAuditService.logUnauthorizedAccess({
        resourceType: 'DOCUMENT',
        resourceId: req.params.id,
        userId: req.user?._id,
        reason: error.message
      });
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    next(error);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    defaultJobAuthorizationService.authorizeDocumentAccess(req.user, document);

    const filePath = path.join(uploadDir, path.basename(document.fileUrl));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Document.deleteOne({ _id: id });

    res.status(200).json({ success: true, data: { _id: id } });
  } catch (error) {
    if (error.name === 'UnauthorizedAccessError') {
      defaultSecurityAuditService.logUnauthorizedAccess({
        resourceType: 'DOCUMENT',
        resourceId: req.params.id,
        userId: req.user?._id,
        reason: error.message
      });
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    next(error);
  }
};

export const uploadInlineDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { expectedType, maxSizeKb, allowedFormats } = req.body;
    let filePath = path.join(uploadDir, req.file.filename);
    let mimeType = req.file.mimetype;
    let fileUrl = `/uploads/${req.file.filename}`;
    
    // AI-Driven Compression Pipeline
    if (mimeType.startsWith('image/')) {
       let processed = sharp(filePath);
       let metadata = await processed.metadata();
       
       const maxBytes = maxSizeKb ? parseInt(maxSizeKb) * 1024 : 10 * 1024 * 1024;
       let quality = 90;
       let format = metadata.format;
       
       if (allowedFormats && allowedFormats !== 'any') {
          if (allowedFormats.includes('jpeg') || allowedFormats.includes('jpg')) format = 'jpeg';
          else if (allowedFormats.includes('png')) format = 'png';
       }
       
       const newFilename = 'optimized-' + req.file.filename + '.' + format;
       const newPath = path.join(uploadDir, newFilename);
       
       await processed.toFormat(format, { quality }).toFile(newPath);
       let stat = fs.statSync(newPath);
       
       // Iterative compression if too big
       while (stat.size > maxBytes && quality > 10) {
          quality -= 15;
          await sharp(filePath).toFormat(format, { quality }).toFile(newPath);
          stat = fs.statSync(newPath);
       }
       
       if (stat.size > maxBytes) {
          return res.status(400).json({ 
             success: false, 
             error: `The uploaded image is ${Math.round(req.file.size/1024)} KB. The website only allows ${maxSizeKb} KB. I attempted compression but the quality would become unreadable. Please upload a lower-resolution scan.` 
          });
       }
       
       fileUrl = `/uploads/${newFilename}`;
       mimeType = `image/${format}`;
    } else if (mimeType === 'application/pdf') {
       const maxBytes = maxSizeKb ? parseInt(maxSizeKb) * 1024 : 10 * 1024 * 1024;
       if (req.file.size > maxBytes) {
           return res.status(400).json({ 
             success: false, 
             error: `The uploaded PDF is ${Math.round(req.file.size/1024)} KB. The website only allows ${maxSizeKb} KB. Please upload a smaller PDF.` 
          });
       }
    }

    const newDocument = new Document({
      userId: req.user._id,
      type: expectedType || 'unknown',
      fileName: req.file.originalname,
      fileUrl: fileUrl,
      mimeType: mimeType,
      validationStatus: 'VALID'
    });

    await newDocument.save();

    res.status(201).json({ success: true, data: newDocument });
  } catch (error) {
    next(error);
  }
};
