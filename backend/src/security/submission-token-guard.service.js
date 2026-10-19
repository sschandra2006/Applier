/**
 * Submission Confirmation Token Guard Service
 * Applier 2.0 — Phase 23: Security Hardening
 *
 * Implements cryptographically signed, expiring, replay-protected confirmation tokens
 * for high-risk actions (final application submission, payments, declarations).
 *
 * Guarantees:
 * 1. Tokens expire after a strict TTL.
 * 2. Replay protection: A token can only be consumed once.
 * 3. Scope validation: Token is cryptographically bound to specific user and application.
 * 4. Mutation barrier: Form field modifications invalidate confirmation.
 */

import crypto from 'crypto';
import { validateSubmissionConfirmation } from '../../../shared/validators/index.js';

export class SubmissionTokenError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SubmissionTokenError';
    this.code = details.code || 'TOKEN_VALIDATION_ERROR';
    this.status = details.status || 400;
    this.details = details;
  }
}

export class SubmissionTokenGuardService {
  constructor(options = {}) {
    this.secret = options.secret || process.env.CONFIRMATION_SECRET || 'applier_canonical_confirmation_secret_2026';
    this.defaultTtlMs = options.defaultTtlMs ?? 10 * 60 * 1000; // 10 minutes default
    this.consumedTokens = new Set();
    this.invalidatedTokens = new Set();
  }

  /**
   * Deterministically computes a SHA-256 hash of form fields.
   */
  computeFieldStateHash(fieldState) {
    if (!fieldState || typeof fieldState !== 'object') {
      return crypto.createHash('sha256').update('').digest('hex');
    }

    const entries = fieldState instanceof Map ? Array.from(fieldState.entries()) : Object.entries(fieldState);
    entries.sort(([k1], [k2]) => k1.localeCompare(k2));

    const normalized = {};
    for (const [key, value] of entries) {
      if (value !== undefined && value !== null) {
        normalized[key] = typeof value === 'object' ? JSON.stringify(value) : String(value).trim();
      }
    }

    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  /**
   * Generates a signed, single-use submission confirmation token.
   */
  generateToken({
    applicationId,
    userId,
    fieldState = {},
    workflowVersion = '2.0.0',
    expiresInMs = null
  }) {
    if (!applicationId) throw new SubmissionTokenError('applicationId is required for confirmation token.');
    if (!userId) throw new SubmissionTokenError('userId is required for confirmation token.');

    const confirmationId = `conf_${crypto.randomUUID()}`;
    const nonce = crypto.randomBytes(16).toString('hex');
    const fieldStateHash = this.computeFieldStateHash(fieldState);
    const now = Date.now();
    const expiresAtMs = now + (expiresInMs ?? this.defaultTtlMs);

    const payload = {
      confirmationId,
      nonce,
      applicationId: String(applicationId),
      workflowVersion: String(workflowVersion),
      userId: String(userId),
      fieldStateHash,
      timestamp: new Date(now).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString()
    };

    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(payloadStr).digest('base64url');
    const token = `${payloadStr}.${signature}`;

    const canonicalRecord = {
      schemaVersion: '2.0.0',
      confirmationId,
      applicationId: String(applicationId),
      workflowVersion: String(workflowVersion),
      userId: String(userId),
      fieldStateHash,
      token,
      signature,
      isValid: true,
      invalidatedReason: null,
      expiresAt: payload.expiresAt,
      timestamp: payload.timestamp
    };

    const validation = validateSubmissionConfirmation(canonicalRecord);
    if (!validation.valid) {
      console.warn('[SubmissionTokenGuard] Validation warning:', validation.errors);
    }

    return canonicalRecord;
  }

  /**
   * Verifies and atomically consumes a confirmation token.
   * If token is expired, replayed, or invalid, throws an explicit SubmissionTokenError.
   */
  verifyAndConsumeToken({
    token,
    currentFieldState = {},
    applicationId = null,
    userId = null
  }) {
    if (!token || typeof token !== 'string') {
      throw new SubmissionTokenError('Confirmation token must be a non-empty string.', {
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // 1. Replay Check
    if (this.consumedTokens.has(token)) {
      throw new SubmissionTokenError('Confirmation token has already been consumed. Replay attack detected.', {
        code: 'TOKEN_REPLAY_DETECTED',
        token
      });
    }

    // 2. Explicit Invalidation Check
    if (this.invalidatedTokens.has(token)) {
      throw new SubmissionTokenError('Confirmation token was explicitly invalidated.', {
        code: 'TOKEN_INVALIDATED'
      });
    }

    // 3. Cryptographic Signature Check
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new SubmissionTokenError('Malformed confirmation token format.', {
        code: 'MALFORMED_TOKEN'
      });
    }

    const [payloadStr, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', this.secret).update(payloadStr).digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      throw new SubmissionTokenError('Cryptographic signature verification failed.', {
        code: 'SIGNATURE_MISMATCH'
      });
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    } catch (_) {
      throw new SubmissionTokenError('Failed to decode token payload.', {
        code: 'PAYLOAD_PARSE_ERROR'
      });
    }

    // 4. Expiration Check
    const expiresAtMs = new Date(payload.expiresAt).getTime();
    if (Date.now() > expiresAtMs) {
      throw new SubmissionTokenError(`Confirmation token expired at ${payload.expiresAt}.`, {
        code: 'TOKEN_EXPIRED',
        expiresAt: payload.expiresAt
      });
    }

    // 5. Scope Validation (Application and User)
    if (applicationId && payload.applicationId !== String(applicationId)) {
      throw new SubmissionTokenError(`Token was issued for application "${payload.applicationId}", but presented for "${applicationId}".`, {
        code: 'APPLICATION_SCOPE_MISMATCH'
      });
    }

    if (userId && payload.userId !== String(userId)) {
      throw new SubmissionTokenError(`Token was issued for user "${payload.userId}", but presented by "${userId}".`, {
        code: 'USER_SCOPE_MISMATCH'
      });
    }

    // 6. Mutation Barrier: Form changes invalidate confirmation
    const currentHash = this.computeFieldStateHash(currentFieldState);
    if (currentHash !== payload.fieldStateHash) {
      this.invalidatedTokens.add(token);
      throw new SubmissionTokenError('Form state materially mutated after confirmation was granted. Token invalidated.', {
        code: 'FORM_MUTATED_AFTER_CONFIRMATION',
        originalHash: payload.fieldStateHash,
        currentHash
      });
    }

    // 7. Atomic Consumption: Mark token as consumed to prevent replay attacks
    this.consumedTokens.add(token);

    return {
      valid: true,
      consumed: true,
      payload
    };
  }

  /**
   * Resets consumed state (primarily for test environments).
   */
  reset() {
    this.consumedTokens.clear();
    this.invalidatedTokens.clear();
  }
}

export const defaultSubmissionTokenGuardService = new SubmissionTokenGuardService();
