/**
 * Secret Sanitizer & Privacy Guard
 * Applier 2.0 — Phase 16: Durable Execution Checkpoints
 *
 * Enforces strict secret hygiene:
 * - Never persist secrets unnecessarily.
 * - Do not store raw OTP/CAPTCHA values permanently in checkpoints.
 * - Redacts passwords, OTP codes, CAPTCHA solutions, PINs, and auth secrets.
 */

const SECRET_PATTERNS = [
  /otp/i,
  /captcha/i,
  /password/i,
  /passwd/i,
  /pin\b/i,
  /cvv/i,
  /secret/i,
  /token/i,
  /auth_?code/i,
  /verification_?code/i,
  /security_?code/i
];

/**
 * Checks whether a field name corresponds to a sensitive secret.
 */
export function isSecretField(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') return false;
  return SECRET_PATTERNS.some(pattern => pattern.test(fieldName));
}

/**
 * Sanitizes an answers dictionary by removing or redacting secret fields.
 */
export function sanitizeAnswers(answers = {}) {
  if (!answers || typeof answers !== 'object') return {};
  const sanitized = {};

  for (const [key, val] of Object.entries(answers)) {
    if (isSecretField(key)) {
      // Omit secret from persistent answers
      continue;
    }
    sanitized[key] = val;
  }

  return sanitized;
}

/**
 * Cleans a pending checkpoint structure so that only non-sensitive metadata
 * (e.g. pauseReason, fieldName, captchaImageBase64, screenshot) is retained,
 * and any raw solution or secret is scrubbed.
 */
export function sanitizePendingCheckpoint(pendingCheckpoint) {
  if (!pendingCheckpoint || typeof pendingCheckpoint !== 'object') return null;

  const sanitized = { ...pendingCheckpoint };
  // Scrub any accidental raw input values
  delete sanitized.resolvedValue;
  delete sanitized.otp;
  delete sanitized.captcha;
  delete sanitized.userInput;
  delete sanitized.rawSecret;
  delete sanitized.value;

  return sanitized;
}

/**
 * Recursively scans an object to verify that no raw secrets are stored.
 * Throws SecretHygieneViolation if raw secrets are detected.
 */
export function assertNoSecretsPersisted(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return;

  const checkObject = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return;

    for (const [k, v] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${k}` : k;

      if (isSecretField(k)) {
        // Exclude allowed structural metadata keys
        const isMetadataKey =
          k === 'fieldName' ||
          k === 'pauseReason' ||
          k === 'captchaImageBase64' ||
          k === 'hasCaptcha' ||
          k === 'requiresOtp';

        if (!isMetadataKey && v !== null && v !== undefined && v !== '[REDACTED]' && v !== false) {
          throw new Error(
            `SecretHygieneViolation: Raw secret found at "${currentPath}" in checkpoint. Raw OTP/CAPTCHA/passwords must never be permanently persisted.`
          );
        }
      }

      if (v && typeof v === 'object' && !Array.isArray(v)) {
        checkObject(v, currentPath);
      }
    }
  };

  checkObject(checkpoint);
}

export default {
  isSecretField,
  sanitizeAnswers,
  sanitizePendingCheckpoint,
  assertNoSecretsPersisted
};
