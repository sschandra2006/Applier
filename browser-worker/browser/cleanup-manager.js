/**
 * CleanupManager — Multi-Condition Teardown & Resource Garbage Collector
 * Applier 2.0 — Phase 3: Browser Session & Context Management
 *
 * Guarantees complete and leak-free resource teardown across SUCCESS, FAILURE,
 * TIMEOUT, CANCEL, and WORKER CRASH conditions.
 */

import { EventEmitter } from 'events';

export const CLEANUP_REASONS = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  TIMEOUT: 'TIMEOUT',
  CANCEL: 'CANCEL',
  WORKER_CRASH: 'WORKER_CRASH'
});

export const SESSION_TERMINAL_STATUSES = Object.freeze({
  [CLEANUP_REASONS.SUCCESS]: 'CLOSED',
  [CLEANUP_REASONS.FAILURE]: 'FAILED',
  [CLEANUP_REASONS.TIMEOUT]: 'TIMED_OUT',
  [CLEANUP_REASONS.CANCEL]: 'CANCELLED',
  [CLEANUP_REASONS.WORKER_CRASH]: 'CRASHED'
});

export class CleanupManager extends EventEmitter {
  constructor({ browserManager, contextManager, pageManager }) {
    super();
    this.browserManager = browserManager;
    this.contextManager = contextManager;
    this.pageManager = pageManager;
  }

  /**
   * Executes complete teardown of a session across pages, context, and browser
   * @param {object} session
   * @param {string} reason CLEANUP_REASONS enum
   */
  async cleanupSession(session, reason = CLEANUP_REASONS.SUCCESS) {
    if (!session) return;

    const normalizedReason = CLEANUP_REASONS[reason] || CLEANUP_REASONS.FAILURE;
    const finalStatus = SESSION_TERMINAL_STATUSES[normalizedReason] || 'CLOSED';

    session.status = 'CLOSING';

    try {
      // 1. Close all associated pages
      if (this.pageManager) {
        const pagesToClose = Array.from(this.pageManager.pages.values())
          .filter((p) => p.contextId === session.contextId)
          .map((p) => this.pageManager.closePage(p.pageId).catch(() => {}));
        await Promise.allSettled(pagesToClose);
      }

      // 2. Close BrowserContext
      if (session.contextId && this.contextManager) {
        await this.contextManager.closeContext(session.contextId).catch(() => {});
      }

      // 3. Close Browser instance
      if (session.browserId && this.browserManager) {
        await this.browserManager.closeBrowser(session.browserId).catch(() => {});
      }
    } catch (_) {
      // Teardown should never bubble unhandled errors
    } finally {
      session.status = finalStatus;
      session.closedAt = new Date().toISOString();
      session.lastActivityAt = new Date().toISOString();

      this.emit('sessionCleaned', {
        sessionId: session.sessionId,
        jobId: session.jobId,
        reason: normalizedReason,
        status: finalStatus
      });
    }
  }

  /**
   * Global emergency teardown across all active sessions and browsers
   */
  async cleanupAll(sessions = []) {
    const promises = sessions.map((s) => this.cleanupSession(s, CLEANUP_REASONS.WORKER_CRASH));
    await Promise.allSettled(promises);

    if (this.pageManager) await this.pageManager.cleanupAll().catch(() => {});
    if (this.contextManager) await this.contextManager.cleanupAll().catch(() => {});
    if (this.browserManager) await this.browserManager.cleanupAll().catch(() => {});
  }
}

export default CleanupManager;
