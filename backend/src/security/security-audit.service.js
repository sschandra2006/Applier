/**
 * Security Audit Logging Service
 * Applier 2.0 — Phase 23: Security Hardening
 *
 * Records immutable, structured security audit events adhering to the
 * canonical `security-audit-event.json` (v2.0.0) schema.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  SecurityAuditEventType,
  SecurityThreatLevel
} from '../../../shared/enums/index.js';
import { validateSecurityAuditEvent } from '../../../shared/validators/index.js';
import { SecretIsolationService } from './secret-isolation.service.js';

export class SecurityAuditService {
  constructor(options = {}) {
    this.logs = []; // In-memory audit trail (synced to durable store)
    this.maxInMemoryLogs = options.maxInMemoryLogs || 1000;
  }

  /**
   * Records a canonical security audit event.
   */
  logEvent({
    eventType,
    severity = SecurityThreatLevel.MEDIUM,
    userId = null,
    ipAddress = null,
    resourceId = null,
    details = {},
    blocked = true
  }) {
    const eventId = `sae_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const sanitizedDetails = SecretIsolationService.sanitizeObject(details);

    const event = {
      schemaVersion: '2.0.0',
      eventId,
      eventType,
      severity,
      timestamp: new Date().toISOString(),
      userId: userId ? String(userId) : null,
      ipAddress: ipAddress ? String(ipAddress) : null,
      resourceId: resourceId ? String(resourceId) : null,
      details: sanitizedDetails,
      blocked: Boolean(blocked)
    };

    const validation = validateSecurityAuditEvent(event);
    if (!validation.valid) {
      console.error('[SecurityAuditService] Canonical validation failed for audit event:', validation.errors);
      throw new Error(`Invalid SecurityAuditEvent: ${JSON.stringify(validation.errors)}`);
    }

    this.logs.unshift(event);
    if (this.logs.length > this.maxInMemoryLogs) {
      this.logs.pop();
    }

    return event;
  }

  logSSRFBlocked({ url, reason, userId, ipAddress }) {
    return this.logEvent({
      eventType: SecurityAuditEventType.SSRF_BLOCKED,
      severity: SecurityThreatLevel.CRITICAL,
      userId,
      ipAddress,
      details: { attemptedUrl: url, reason }
    });
  }

  logMaliciousUploadBlocked({ filename, threatName, reason, userId, ipAddress }) {
    return this.logEvent({
      eventType: SecurityAuditEventType.MALICIOUS_UPLOAD_BLOCKED,
      severity: SecurityThreatLevel.HIGH,
      userId,
      ipAddress,
      details: { filename, threatName, reason }
    });
  }

  logOversizedUploadBlocked({ filename, size, maxSize, userId, ipAddress }) {
    return this.logEvent({
      eventType: SecurityAuditEventType.OVERSIZED_UPLOAD_BLOCKED,
      severity: SecurityThreatLevel.LOW,
      userId,
      ipAddress,
      details: { filename, size, maxSize }
    });
  }

  logUnauthorizedAccess({ resourceType, resourceId, userId, ipAddress, reason }) {
    return this.logEvent({
      eventType: SecurityAuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
      severity: SecurityThreatLevel.HIGH,
      userId,
      ipAddress,
      resourceId,
      details: { resourceType, reason }
    });
  }

  logTokenExpired({ tokenId, userId, ipAddress }) {
    return this.logEvent({
      eventType: SecurityAuditEventType.TOKEN_EXPIRED,
      severity: SecurityThreatLevel.MEDIUM,
      userId,
      ipAddress,
      resourceId: tokenId,
      details: { tokenId, reason: 'Confirmation token was presented after expiration.' }
    });
  }

  logTokenReplay({ tokenId, userId, ipAddress }) {
    return this.logEvent({
      eventType: SecurityAuditEventType.TOKEN_REPLAY_ATTEMPT,
      severity: SecurityThreatLevel.CRITICAL,
      userId,
      ipAddress,
      resourceId: tokenId,
      details: { tokenId, reason: 'Consumed confirmation token re-used in subsequent request.' }
    });
  }

  logPathTraversalBlocked({ filename, userId, ipAddress }) {
    return this.logEvent({
      eventType: SecurityAuditEventType.PATH_TRAVERSAL_ATTEMPT,
      severity: SecurityThreatLevel.HIGH,
      userId,
      ipAddress,
      details: { attemptedFilename: filename, reason: 'Directory traversal sequence detected.' }
    });
  }

  logSecretLeakPrevented({ field, reason, userId, ipAddress }) {
    return this.logEvent({
      eventType: SecurityAuditEventType.SECRET_LEAK_PREVENTED,
      severity: SecurityThreatLevel.CRITICAL,
      userId,
      ipAddress,
      details: { field, reason }
    });
  }

  getRecentLogs(limit = 50) {
    return this.logs.slice(0, limit);
  }

  clear() {
    this.logs = [];
  }
}

export const defaultSecurityAuditService = new SecurityAuditService();
