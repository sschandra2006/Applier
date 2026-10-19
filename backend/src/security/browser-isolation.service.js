/**
 * Browser Isolation & Sandboxing Service
 * Applier 2.0 — Phase 23: Security Hardening
 *
 * Enforces Playwright browser execution security:
 * 1. Sandboxed BrowserContexts with isolated storage/cookies.
 * 2. Pre-navigation SSRF verification.
 * 3. Stripping of invasive web permissions (camera, microphone, geolocation).
 * 4. Strict timeout enforcement (navigation, action, evaluation).
 * 5. Resource limits (max active pages, max contexts).
 */

import { SSRFGuard, SSRFViolationError } from './ssrf-guard.js';

export class BrowserIsolationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'BrowserIsolationError';
    this.code = details.code || 'BROWSER_ISOLATION_VIOLATION';
    this.details = details;
  }
}

export const DEFAULT_BROWSER_SECURITY_CONFIG = Object.freeze({
  navigationTimeoutMs: 30000,
  actionTimeoutMs: 10000,
  scriptTimeoutMs: 5000,
  maxConcurrentContexts: 10,
  maxPagesPerContext: 5,
  permissionsToBlock: ['geolocation', 'notifications', 'camera', 'microphone', 'clipboard-read']
});

export class BrowserIsolationService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_BROWSER_SECURITY_CONFIG, ...config };
    this.activeContexts = new Set();
  }

  /**
   * Generates secure Playwright BrowserContext configuration options.
   */
  getContextSecurityOptions(options = {}) {
    return {
      javaScriptEnabled: true,
      bypassCSP: false, // Enforce Content Security Policy
      ignoreHTTPSErrors: false, // Strict TLS certificate checking
      permissions: [], // Strip all web permissions by default
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Applier/2.0',
      viewport: options.viewport || { width: 1280, height: 800 },
      recordVideo: undefined, // Do not leak recordings unless specified
      ...options
    };
  }

  /**
   * Validates target navigation URL before dispatching to Playwright page.goto().
   * Prevents browser-level SSRF or navigating to internal administrative interfaces.
   */
  async assertSafeNavigation(url) {
    const check = await SSRFGuard.validateUrl(url);
    if (!check.allowed) {
      throw new SSRFViolationError(
        `Browser navigation blocked by SSRF guard: ${check.reason}`,
        { url, reason: check.reason }
      );
    }
    return check.sanitizedUrl;
  }

  /**
   * Verifies context concurrency limits.
   */
  registerContext(contextId) {
    if (this.activeContexts.size >= this.config.maxConcurrentContexts) {
      throw new BrowserIsolationError(
        `Max concurrent browser contexts (${this.config.maxConcurrentContexts}) exceeded. Resource limit reached.`,
        { code: 'MAX_CONTEXTS_EXCEEDED' }
      );
    }
    this.activeContexts.add(contextId);
  }

  unregisterContext(contextId) {
    this.activeContexts.delete(contextId);
  }

  getTimeouts() {
    return {
      navigationTimeout: this.config.navigationTimeoutMs,
      actionTimeout: this.config.actionTimeoutMs,
      scriptTimeout: this.config.scriptTimeoutMs
    };
  }
}

export const defaultBrowserIsolationService = new BrowserIsolationService();
