import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export class DocumentProcessingEngine {
  /**
   * Processes a document buffer based on strict upload constraints.
   * @param {Buffer} fileBuffer - The raw document buffer.
   * @param {string} mimeType - The mime type of the original file.
   * @param {Object} constraints - The AI-extracted constraints.
   * @returns {Promise<{buffer: Buffer, mimeType: string, extension: string}>}
   */
  static async prepareDocument(fileBuffer, mimeType, constraints) {
    let processedBuffer = fileBuffer;
    let finalMimeType = mimeType;
    let extension = mimeType.split('/')[1] || 'bin';

    if (mimeType.startsWith('image/')) {
      const result = await this._processImage(processedBuffer, constraints);
      processedBuffer = result.buffer;
      finalMimeType = result.mimeType;
      extension = result.extension;
    } else if (mimeType === 'application/pdf') {
      const result = await this._processPdf(processedBuffer, constraints);
      processedBuffer = result.buffer;
      finalMimeType = 'application/pdf';
      extension = 'pdf';
    } else {
       // Other formats (e.g. DOCX) are currently passed through unmodified,
       // unless explicitly rejected by constraints.
    }

    // Final Validation
    this._verifyCompliance(processedBuffer, finalMimeType, constraints);

    return { buffer: processedBuffer, mimeType: finalMimeType, extension };
  }

  static async _processImage(buffer, constraints) {
    let image = sharp(buffer);
    
    // 1. Strip metadata (EXIF) for privacy and size
    image = image.withMetadata(false);

    // 2. Format conversion if the original is not accepted
    let format = 'jpeg'; // Default target
    if (constraints.acceptedFormats && constraints.acceptedFormats.length > 0) {
        // e.g. ['.pdf', '.jpg', '.png']
        const acceptsJpg = constraints.acceptedFormats.includes('.jpg') || constraints.acceptedFormats.includes('.jpeg');
        const acceptsPng = constraints.acceptedFormats.includes('.png');
        
        if (acceptsJpg) format = 'jpeg';
        else if (acceptsPng) format = 'png';
    }
    
    // 3. Resize if it exceeds dimensions
    if (constraints.maxDimensions) {
      image = image.resize({
        width: constraints.maxDimensions.width,
        height: constraints.maxDimensions.height,
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // 4. Color Requirements
    if (constraints.colorMode === 'grayscale') {
      image = image.grayscale();
    }

    // 5. Compress to hit maxSizeBytes target
    let quality = 90;
    let resultBuffer = await image.toFormat(format, { quality }).toBuffer();
    
    if (constraints.maxSizeBytes) {
       while (resultBuffer.length > constraints.maxSizeBytes && quality > 10) {
           quality -= 10;
           resultBuffer = await image.toFormat(format, { quality }).toBuffer();
       }
    }

    return { 
        buffer: resultBuffer, 
        mimeType: `image/${format}`, 
        extension: format 
    };
  }

  static async _processPdf(buffer, constraints) {
    let pdfDoc = await PDFDocument.load(buffer);
    
    // Strip Metadata
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');

    // Page Limits (Slice pages if it exceeds maxPages)
    if (constraints.maxPages && pdfDoc.getPageCount() > constraints.maxPages) {
      const newPdf = await PDFDocument.create();
      const pagesToCopy = await newPdf.copyPages(pdfDoc, Array.from({length: constraints.maxPages}, (_, i) => i));
      pagesToCopy.forEach(page => newPdf.addPage(page));
      pdfDoc = newPdf;
    }

    let resultBuffer = await pdfDoc.save();
    
    // Basic structural compression attempt (Since we don't have Ghostscript, we rely on stripping metadata and pages)
    return { buffer: Buffer.from(resultBuffer) };
  }

  static _verifyCompliance(buffer, mimeType, constraints) {
    // Check Size
    if (constraints.maxSizeBytes && buffer.length > constraints.maxSizeBytes) {
      throw new Error(`DOCUMENT_TOO_LARGE: Processed document (${buffer.length} bytes) exceeds limit of ${constraints.maxSizeBytes} bytes.`);
    }

    // Check Format
    if (constraints.acceptedFormats && constraints.acceptedFormats.length > 0) {
      const extMatch = constraints.acceptedFormats.some(ext => {
         const cleanExt = ext.replace('.', '').toLowerCase();
         return mimeType.toLowerCase().includes(cleanExt) || 
                (cleanExt === 'jpg' && mimeType === 'image/jpeg');
      });
      if (!extMatch) {
         throw new Error(`INVALID_FORMAT: Mimetype ${mimeType} is not in accepted formats: ${constraints.acceptedFormats.join(', ')}`);
      }
    }
  }

  /**
   * Helper to write a buffer to a temp file for Playwright.
   */
  static async writeToTempFile(buffer, extension) {
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `upload_${Date.now()}.${extension}`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }
}
