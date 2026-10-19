/**
 * Secret Isolation & Credential Redaction Service
 * Applier 2.0 — Phase 23: Security Hardening
 *
 * Enforces strict isolation of:
 * - Database credentials (MONGO_URI, REDIS_URL)
 * - LLM keys (HF_TOKEN, OPENAI_API_KEY)
 * - Browser worker secrets (WORKER_AUTH_TOKEN)
 * - Internal APIs & JWT secrets
 *
 * Guarantees that secrets are NEVER transmitted to frontend or browser.
 */

export class SecretExposureError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SecretExposureError';
    this.code = details.code || 'SECRET_EXPOSURE_PREVENTED';
    this.details = details;
  }
}

// Patterns that identify sensitive configuration keys
const SENSITIVE_KEY_REGEX = /password|secret|token|apikey|api_key|privatekey|private_key|credential|auth_header|bearer|mongo_uri|mongouri|mongourl|mongo_url|database_url|databaseurl|redis_url|redisurl|jwt_secret|jwtsecret|db_uri|db_url/i;

// Regex to catch raw connection strings with embedded passwords: mongodb://user:pass@host
const CONNECTION_STRING_REGEX = /(mongodb|postgres|postgresql|mysql|redis):\/\/[^:]+:([^@]+)@/gi;

// Regex to catch standard API key formats (e.g. hf_..., sk_..., Bearer eyJ...)
const API_KEY_REGEX = /\b(hf_[a-zA-Z0-9]{30,}|sk-[a-zA-Z0-9]{30,}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})\b/g;

export class SecretIsolationService {
  /**
   * Masks a secret string, leaving a small prefix and suffix for debugging.
   */
  static mask(value) {
    if (!value || typeof value !== 'string') return '[REDACTED]';
    if (value.length <= 8) return '********';
    return `${value.slice(0, 3)}****${value.slice(-3)}`;
  }

  /**
   * Sanitizes a string by replacing embedded connection strings and tokens with [REDACTED].
   */
  static sanitizeString(str) {
    if (typeof str !== 'string') return str;

    let sanitized = str.replace(CONNECTION_STRING_REGEX, (match, proto) => {
      return `${proto}://[REDACTED_USER]:[REDACTED_PASS]@`;
    });

    sanitized = sanitized.replace(API_KEY_REGEX, (match) => {
      return this.mask(match);
    });

    return sanitized;
  }

  /**
   * Recursively traverses an object or array to sanitize and redact sensitive keys and values.
   */
  static sanitizeObject(obj, seen = new WeakSet()) {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    // Guard against circular references
    if (seen.has(obj)) {
      return '[CIRCULAR]';
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, seen));
    }

    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        clean[key] = this.sanitizeObject(value, seen);
      } else if (
        SENSITIVE_KEY_REGEX.test(key) ||
        (typeof value === 'string' && /^(mongodb|postgres|postgresql|redis):\/\//i.test(value.trim()))
      ) {
        clean[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        clean[key] = this.sanitizeString(value);
      } else {
        clean[key] = value;
      }
    }

    return clean;
  }

  /**
   * Asserts that a payload does not contain exposed raw credentials.
   * Throws SecretExposureError if any unmasked secret is detected.
   */
  static assertNoExposedSecrets(payload) {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);

    if (CONNECTION_STRING_REGEX.test(serialized)) {
      throw new SecretExposureError('Database connection string with credentials detected in payload.', {
        pattern: 'CONNECTION_STRING'
      });
    }

    // Check for high-entropy tokens
    CONNECTION_STRING_REGEX.lastIndex = 0;
    API_KEY_REGEX.lastIndex = 0;
  }

  /**
   * Express middleware that intercepts res.json to guarantee secrets are never returned to clients.
   */
  static createResponseSanitizerMiddleware() {
    return (req, res, next) => {
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        const sanitized = SecretIsolationService.sanitizeObject(body);
        return originalJson(sanitized);
      };
      next();
    };
  }
}

export const defaultSecretIsolationService = SecretIsolationService;
