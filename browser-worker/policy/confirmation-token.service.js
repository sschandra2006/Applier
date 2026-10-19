/**
 * Submission Confirmation Token Service
 * Applier 2.0 — Phase 12: Browser Action Policy and Submission Safety
 *
 * Creates, signs, verifies, and invalidates cryptographic confirmation tokens tied to:
 * - applicationId
 * - workflow version
 * - field-state hash (SHA-256)
 * - timestamp & expiration
 * - user
 *
 * "If the form materially changes after confirmation: invalidate confirmation."
 */

import crypto from 'crypto';
import { validateSubmissionConfirmation } from '../../shared/validators/index.js';

export class ConfirmationTokenService {
  constructor(options = {}) {
    this.secret = options.secret || process.env.CONFIRMATION_SECRET || 'applier_canonical_confirmation_secret_2026';
    this.defaultTtlMs = options.defaultTtlMs ?? 15 * 60 * 1000; // 15 minutes
    this.invalidatedTokens = new Set();
  }

  /**
   * Deterministically computes a SHA-256 hash of all form fields/answers.
   * Sorts keys alphabetically to guarantee reproducibility across all runtimes.
   *
   * @param {object|Map} fieldState
   * @returns {string} SHA-256 hex digest
   */
  computeFieldStateHash(fieldState) {
    if (!fieldState || typeof fieldState !== 'object') {
      return crypto.createHash('sha256').update('').digest('hex');
    }

    const entries = fieldState instanceof Map ? Array.from(fieldState.entries()) : Object.entries(fieldState);

    // Sort keys alphabetically
    entries.sort(([k1], [k2]) => k1.localeCompare(k2));

    const normalized = {};
    for (const [key, value] of entries) {
      if (value !== undefined && value !== null) {
        normalized[key] = typeof value === 'object' ? JSON.stringify(value) : String(value).trim();
      }
    }

    const canonicalJson = JSON.stringify(normalized);
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
  }

  /**
   * Generates a signed submission confirmation token tied to the current field state.
   */
  generateConfirmationToken({
    applicationId,
    workflowVersion = '2.0.0',
    userId,
    fieldState = {},
    expiresInMs = null
  }) {
    if (!applicationId) throw new Error('ConfirmationTokenService: applicationId is required.');
    if (!userId) throw new Error('ConfirmationTokenService: userId is required.');

    const confirmationId = `conf_${crypto.randomUUID()}`;
    const fieldStateHash = this.computeFieldStateHash(fieldState);
    const now = Date.now();
    const expiresAtMs = now + (expiresInMs ?? this.defaultTtlMs);

    const payload = {
      confirmationId,
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
      console.warn('[ConfirmationTokenService] Schema validation warning:', validation.errors);
    }

    return canonicalRecord;
  }

  /**
   * Verifies the confirmation token against the live field state.
   * If the form has materially changed after confirmation was issued,
   * the confirmation is strictly INVALIDATED.
   */
  verifyConfirmationToken({
    token,
    currentFieldState = {},
    applicationId = null,
    userId = null
  }) {
    if (!token || typeof token !== 'string') {
      return {
        valid: false,
        reason: 'INVALID_TOKEN_FORMAT',
        error: 'Confirmation token must be a non-empty string.'
      };
    }

    if (this.invalidatedTokens.has(token)) {
      return {
        valid: false,
        reason: 'TOKEN_EXPLICITLY_INVALIDATED',
        error: 'Confirmation token was explicitly invalidated.'
      };
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return {
        valid: false,
        reason: 'MALFORMED_TOKEN',
        error: 'Token structure is malformed.'
      };
    }

    const [payloadStr, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', this.secret).update(payloadStr).digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return {
        valid: false,
        reason: 'SIGNATURE_MISMATCH',
        error: 'Confirmation token cryptographic signature verification failed.'
      };
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    } catch (_) {
      return {
        valid: false,
        reason: 'PAYLOAD_PARSE_ERROR',
        error: 'Failed to decode confirmation token payload.'
      };
    }

    // Expiration check
    if (new Date(payload.expiresAt).getTime() < Date.now()) {
      return {
        valid: false,
        reason: 'EXPIRED_CONFIRMATION_TOKEN',
        error: `Confirmation token expired at ${payload.expiresAt}.`
      };
    }

    // Application and User scope check
    if (applicationId && payload.applicationId !== String(applicationId)) {
      return {
        valid: false,
        reason: 'APPLICATION_SCOPE_MISMATCH',
        error: `Token issued for application "${payload.applicationId}", but requested for "${applicationId}".`
      };
    }

    if (userId && payload.userId !== String(userId)) {
      return {
        valid: false,
        reason: 'USER_SCOPE_MISMATCH',
        error: `Token issued for user "${payload.userId}", but requested by "${userId}".`
      };
    }

    // ─────────────────────────────────────────────────────────────
    // FORM MUTATION INVALIDATION BARRIER
    // "If the form materially changes after confirmation: invalidate confirmation."
    // ─────────────────────────────────────────────────────────────
    const currentHash = this.computeFieldStateHash(currentFieldState);
    if (currentHash !== payload.fieldStateHash) {
      this.invalidatedTokens.add(token);
      return {
        valid: false,
        reason: 'FORM_MUTATED_AFTER_CONFIRMATION',
        error: 'Form fields materially changed after confirmation was granted. Token invalidated.',
        tokenHash: payload.fieldStateHash,
        currentHash
      };
    }

    return {
      valid: true,
      payload,
      fieldStateHash: payload.fieldStateHash
    };
  }

  /**
   * Explicitly invalidates a token (e.g. after successful submission or user reset).
   */
  invalidateToken(token) {
    if (token) {
      this.invalidatedTokens.add(token);
    }
  }
}

export const defaultConfirmationTokenService = new ConfirmationTokenService();
