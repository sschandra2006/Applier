/**
 * File Security Service
 * Applier 2.0 — Phase 23: Security Hardening
 *
 * Implements:
 * 1. File type & extension validation (strict whitelist)
 * 2. Magic byte / header signature verification
 * 3. File size limits
 * 4. Path traversal protection (filename sanitization)
 * 5. Malware scanning integration point (EICAR & signature inspection)
 * 6. Sandboxed temporary files management
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

export class FileSecurityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'FileSecurityError';
    this.code = details.code || 'FILE_SECURITY_VIOLATION';
    this.details = details;
  }
}

// Dangerous executable & script extensions that are unconditionally blocked
export const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.vbs', '.js', '.mjs',
  '.php', '.php3', '.php4', '.phtml', '.jsp', '.asp', '.aspx', '.cgi',
  '.pl', '.py', '.rb', '.jar', '.html', '.htm', '.svg', '.dll', '.so',
  '.dylib', '.bin', '.scr', '.msi', '.com'
]);

// Allowed document & image extensions for job applications
export const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.doc', '.txt'
]);

export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Standard EICAR Antivirus Test Signature string
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export class FileSecurityService {
  constructor(options = {}) {
    this.maxFileSize = options.maxFileSize || DEFAULT_MAX_FILE_SIZE;
    this.externalScanner = options.externalScanner || null;
    this.sandboxedBaseDir = options.sandboxedBaseDir || path.join(process.cwd(), 'uploads', '.sandboxed_temp');

    if (!fs.existsSync(this.sandboxedBaseDir)) {
      try {
        fs.mkdirSync(this.sandboxedBaseDir, { recursive: true, mode: 0o700 });
      } catch (_) {}
    }
  }

  /**
   * Sanitizes filenames to eliminate directory traversal (../, ..\\),
   * null bytes (%00, \0), and special control characters.
   *
   * @param {string} rawFilename
   * @returns {string} Sanitized safe filename
   */
  sanitizeFilename(rawFilename) {
    if (!rawFilename || typeof rawFilename !== 'string') {
      return `file_${Date.now()}.dat`;
    }

    // Strip path separators, null bytes, and directory traversal tokens
    let clean = rawFilename.replace(/\0/g, '').replace(/%00/gi, '');
    clean = path.basename(clean);
    clean = clean.replace(/(\.\.[\/\\])+/g, '');
    // Keep only alphanumeric characters, dots, dashes, underscores
    clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Ensure filename is not just dots
    if (!clean || clean.replace(/\./g, '').length === 0) {
      clean = `doc_${Date.now()}${path.extname(rawFilename) || '.dat'}`;
    }

    return clean;
  }

  /**
   * Checks whether the filename extension is allowed and non-executable.
   */
  validateExtension(filename) {
    const ext = path.extname(filename).toLowerCase();

    if (!ext) {
      return { valid: false, reason: 'File has no extension.' };
    }

    if (BLOCKED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        reason: `Executable or script extension "${ext}" is strictly forbidden.`
      };
    }

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        reason: `Unsupported extension "${ext}". Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}.`
      };
    }

    return { valid: true, extension: ext };
  }

  /**
   * Inspects magic bytes (header signatures) of the file buffer to ensure
   * the true content matches the declared extension.
   *
   * @param {Buffer} buffer
   * @param {string} filename
   * @returns {{ valid: boolean, detectedType?: string, reason?: string }}
   */
  validateMagicBytes(buffer, filename) {
    if (!buffer || buffer.length === 0) {
      return { valid: false, reason: 'Empty file buffer.' };
    }

    const ext = path.extname(filename).toLowerCase();

    // 1. PDF: %PDF- (0x25 0x50 0x44 0x46)
    if (ext === '.pdf') {
      const isPdf = buffer.length >= 4 &&
        buffer[0] === 0x25 && buffer[1] === 0x50 &&
        buffer[2] === 0x44 && buffer[3] === 0x46;
      if (!isPdf) {
        return { valid: false, reason: 'File claims to be PDF but lacks valid %PDF header signature.' };
      }
      return { valid: true, detectedType: 'application/pdf' };
    }

    // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
    if (ext === '.png') {
      const isPng = buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
      if (!isPng) {
        return { valid: false, reason: 'File claims to be PNG but lacks valid PNG magic bytes.' };
      }
      return { valid: true, detectedType: 'image/png' };
    }

    // 3. JPEG: FF D8 FF
    if (ext === '.jpg' || ext === '.jpeg') {
      const isJpeg = buffer.length >= 3 &&
        buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      if (!isJpeg) {
        return { valid: false, reason: 'File claims to be JPEG but lacks valid JPEG magic bytes.' };
      }
      return { valid: true, detectedType: 'image/jpeg' };
    }

    // 4. WEBP: 'RIFF' .... 'WEBP'
    if (ext === '.webp') {
      const isWebp = buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP';
      if (!isWebp) {
        return { valid: false, reason: 'File claims to be WEBP but lacks valid RIFF/WEBP header.' };
      }
      return { valid: true, detectedType: 'image/webp' };
    }

    // 5. DOCX: PK\x03\x04 (ZIP format)
    if (ext === '.docx') {
      const isZip = buffer.length >= 4 &&
        buffer[0] === 0x50 && buffer[1] === 0x4B &&
        buffer[2] === 0x03 && buffer[3] === 0x04;
      if (!isZip) {
        return { valid: false, reason: 'File claims to be DOCX but lacks valid PK ZIP header.' };
      }
      return { valid: true, detectedType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    }

    // 6. Plain text (.txt)
    if (ext === '.txt') {
      // Check for binary/executable bytes in first 512 bytes
      const sample = buffer.slice(0, Math.min(512, buffer.length));
      for (let i = 0; i < sample.length; i++) {
        const b = sample[i];
        if (b === 0) { // Null byte indicates binary
          return { valid: false, reason: 'Text file contains null bytes (binary content disguised as text).' };
        }
      }
      return { valid: true, detectedType: 'text/plain' };
    }

    return { valid: true, detectedType: 'application/octet-stream' };
  }

  /**
   * Enforces file size limitations.
   */
  validateFileSize(sizeInBytes) {
    if (sizeInBytes > this.maxFileSize) {
      return {
        valid: false,
        reason: `File size (${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${(this.maxFileSize / (1024 * 1024)).toFixed(2)} MB.`
      };
    }
    return { valid: true };
  }

  /**
   * Malware scanning integration point.
   * Performs signature inspection (EICAR standard, embedded script tags)
   * and delegates to external scanning provider if configured.
   */
  async scanForMalware(buffer) {
    if (!buffer || buffer.length === 0) {
      return { isClean: true };
    }

    // 1. In-memory check for EICAR test string
    const contentStr = buffer.toString('utf8', 0, Math.min(buffer.length, 4096));
    if (contentStr.includes(EICAR_SIGNATURE)) {
      return {
        isClean: false,
        threatName: 'EICAR-Test-Signature',
        reason: 'Malicious payload signature detected (EICAR standard test virus).'
      };
    }

    // 2. Check for active malicious script injection disguised in text/documents
    if (/<script[\s>]/i.test(contentStr) && !contentStr.startsWith('%PDF-')) {
      return {
        isClean: false,
        threatName: 'HTML-Script-Injection',
        reason: 'Disallowed active executable HTML script tag detected.'
      };
    }

    // 3. Delegate to external antivirus scanner (e.g. ClamAV, cloud scan)
    if (this.externalScanner) {
      try {
        const extScan = await this.externalScanner(buffer);
        if (!extScan.isClean) {
          return {
            isClean: false,
            threatName: extScan.threatName || 'ExternalAV-Threat',
            reason: extScan.reason || 'Flagged by external antivirus scanner.'
          };
        }
      } catch (err) {
        console.error('[FileSecurityService] External AV scanner error:', err.message);
      }
    }

    return { isClean: true };
  }

  /**
   * Complete validation pipeline: sanitizes, checks size, extension, magic bytes, and scans malware.
   */
  async validateFile({ filename, buffer, size }) {
    const sanitizedName = this.sanitizeFilename(filename);

    // 1. Size check
    const fileSize = size !== undefined ? size : buffer?.length;
    const sizeCheck = this.validateFileSize(fileSize);
    if (!sizeCheck.valid) {
      throw new FileSecurityError(sizeCheck.reason, { code: 'OVERSIZED_FILE', size: fileSize });
    }

    // 2. Extension check
    const extCheck = this.validateExtension(sanitizedName);
    if (!extCheck.valid) {
      throw new FileSecurityError(extCheck.reason, { code: 'INVALID_FILE_TYPE', filename: sanitizedName });
    }

    // 3. Magic bytes check
    if (buffer) {
      const magicCheck = this.validateMagicBytes(buffer, sanitizedName);
      if (!magicCheck.valid) {
        throw new FileSecurityError(magicCheck.reason, { code: 'MIME_SPOOFING_DETECTED', filename: sanitizedName });
      }

      // 4. Malware scan
      const scanResult = await this.scanForMalware(buffer);
      if (!scanResult.isClean) {
        throw new FileSecurityError(scanResult.reason, {
          code: 'MALWARE_DETECTED',
          threatName: scanResult.threatName,
          filename: sanitizedName
        });
      }
    }

    return {
      valid: true,
      sanitizedFilename: sanitizedName,
      extension: extCheck.extension
    };
  }

  /**
   * Creates a dedicated temporary directory with restricted permissions (0o700).
   */
  createSandboxedTempDir() {
    const sandboxId = `sb_${crypto.randomUUID()}`;
    const targetDir = path.join(this.sandboxedBaseDir, sandboxId);
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });

    return {
      dirPath: targetDir,
      cleanup: () => {
        try {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
        } catch (_) {}
      }
    };
  }
}

export const defaultFileSecurityService = new FileSecurityService();
