/**
 * Document Encryption Service (At-Rest AES-256-GCM)
 * Applier 2.0 — Phase 23: Security Hardening
 *
 * Provides tamper-proof authenticated encryption for sensitive applicant documents
 * (Passports, Aadhaar cards, PAN cards, Transcripts) stored on disk.
 */

import crypto from 'crypto';

export class DocumentEncryptionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DocumentEncryptionError';
    this.code = details.code || 'ENCRYPTION_ERROR';
    this.details = details;
  }
}

export class DocumentEncryptionService {
  /**
   * @param {object} [options]
   * @param {string|Buffer} [options.key] 256-bit (32-byte) encryption key
   */
  constructor(options = {}) {
    const rawKey = options.key || process.env.DOCUMENT_ENCRYPTION_KEY || 'applier_canonical_doc_enc_key_32_bytes_2026!';
    if (typeof rawKey === 'string') {
      // Derive 32-byte key via SHA-256
      this.key = crypto.createHash('sha256').update(rawKey).digest();
    } else {
      this.key = rawKey;
    }
    this.algorithm = 'aes-256-gcm';
    this.ivLength = 12; // Standard 96-bit IV for AES-GCM
    this.tagLength = 16; // 128-bit authentication tag
  }

  /**
   * Encrypts a raw document buffer using AES-256-GCM.
   *
   * @param {Buffer} buffer Plaintext document bytes
   * @returns {{ encryptedBuffer: Buffer, iv: string, authTag: string, packaged: Buffer }}
   */
  encryptBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new DocumentEncryptionError('Payload must be a Buffer for encryption.');
    }

    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv, { authTagLength: this.tagLength });

    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Packaged format: [12-byte IV] + [16-byte Auth Tag] + [Ciphertext]
    const packaged = Buffer.concat([iv, authTag, ciphertext]);

    return {
      encryptedBuffer: ciphertext,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      packaged
    };
  }

  /**
   * Decrypts an encrypted document buffer using AES-256-GCM.
   * Verifies the cryptographic authentication tag to detect any tampering.
   *
   * @param {Buffer|{ encryptedBuffer: Buffer, iv: string, authTag: string }} input
   * @returns {Buffer} Decrypted plaintext buffer
   */
  decryptBuffer(input, ivHex = null, authTagHex = null) {
    let iv, authTag, ciphertext;

    if (Buffer.isBuffer(input) && !ivHex) {
      // Packaged format [IV (12) + Tag (16) + Ciphertext]
      if (input.length < this.ivLength + this.tagLength) {
        throw new DocumentEncryptionError('Encrypted buffer is too short to contain IV and Tag.', {
          code: 'CORRUPTED_CIPHERTEXT'
        });
      }
      iv = input.subarray(0, this.ivLength);
      authTag = input.subarray(this.ivLength, this.ivLength + this.tagLength);
      ciphertext = input.subarray(this.ivLength + this.tagLength);
    } else {
      ciphertext = Buffer.isBuffer(input) ? input : input.encryptedBuffer;
      iv = Buffer.from(ivHex || input.iv, 'hex');
      authTag = Buffer.from(authTagHex || input.authTag, 'hex');
    }

    try {
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv, { authTagLength: this.tagLength });
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext;
    } catch (err) {
      throw new DocumentEncryptionError(
        'Decryption failed: cryptographic authentication tag mismatch (tampering or corrupted key).',
        { code: 'INTEGRITY_VERIFICATION_FAILED', originalError: err.message }
      );
    }
  }
}

export const defaultDocumentEncryptionService = new DocumentEncryptionService();
