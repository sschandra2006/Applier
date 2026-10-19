/**
 * ContextManager — Playwright BrowserContext Isolation & State Controller
 * Applier 2.0 — Phase 3: Browser Session & Context Management
 *
 * Manages isolated browser contexts, handles cookie/storage state export & import
 * for session checkpointing, and ensures clean context teardown.
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';

export class ContextManager extends EventEmitter {
  constructor() {
    super();
    this.contexts = new Map(); // contextId -> { contextId, browserId, context, createdAt }
  }

  /**
   * Creates an isolated browser context
   * @param {import('playwright').Browser} browser The parent browser instance
   * @param {string} browserId
   * @param {object} options Context options (viewport, userAgent, storageState, etc.)
   * @returns {Promise<{ contextId: string, context: import('playwright').BrowserContext }>}
   */
  async createContext(browser, browserId, options = {}) {
    if (!browser) throw new Error('ContextManager: browser instance is required');

    const contextId = `ctx_${crypto.randomUUID()}`;

    const defaultOptions = {
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true,
      bypassCSP: true,
      ignoreHTTPSErrors: true,
      ...options
    };

    try {
      const context = await browser.newContext(defaultOptions);

      const record = {
        contextId,
        browserId,
        context,
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };

      this.contexts.set(contextId, record);

      context.on('close', () => {
        record.status = 'CLOSED';
        this.contexts.delete(contextId);
        this.emit('contextClosed', { contextId, browserId });
      });

      this.emit('contextCreated', { contextId, browserId });
      return { contextId, context };
    } catch (err) {
      throw new Error(`ContextManager: Failed to create browser context: ${err.message}`);
    }
  }

  /**
   * Retrieves active context record
   */
  getContext(contextId) {
    return this.contexts.get(contextId) || null;
  }

  /**
   * Exports cookies and local storage state for serializable checkpoints
   * @param {string} contextId
   * @returns {Promise<{ cookies: Array, origins: Array } | null>}
   */
  async exportStorageState(contextId) {
    const record = this.contexts.get(contextId);
    if (!record || !record.context) return null;

    try {
      return await record.context.storageState();
    } catch (_) {
      return null;
    }
  }

  /**
   * Safely closes a context
   */
  async closeContext(contextId) {
    const record = this.contexts.get(contextId);
    if (!record) return;

    this.contexts.delete(contextId);
    record.status = 'CLOSING';

    try {
      await record.context.close();
    } catch (_) {
      // Ignored if already closed
    } finally {
      record.status = 'CLOSED';
      this.emit('contextClosed', { contextId, browserId: record.browserId });
    }
  }

  /**
   * Closes all active contexts
   */
  async cleanupAll() {
    const ids = Array.from(this.contexts.keys());
    await Promise.allSettled(ids.map((id) => this.closeContext(id)));
    this.contexts.clear();
  }

  getActiveCount() {
    return this.contexts.size;
  }
}

export const defaultContextManager = new ContextManager();
export default ContextManager;
