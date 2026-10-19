/**
 * SessionManager & BrowserSession — First-Class Session Architecture
 * Applier 2.0 — Phase 3: Browser Session & Context Management
 *
 * Implements BrowserSession as a first-class stateful object tracking
 * sessionId, jobId, browserId, contextId, activePageId, currentUrl,
 * openedPages, framePath, status, createdAt, lastActivityAt.
 *
 * Strictly separates live Playwright handles from serializable state.
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import { defaultBrowserManager } from './browser-manager.js';
import { defaultContextManager } from './context-manager.js';
import { defaultPageManager } from './page-manager.js';
import { defaultFrameManager } from './frame-manager.js';
import { defaultCheckpointManager } from './checkpoint-manager.js';
import { CleanupManager, CLEANUP_REASONS } from './cleanup-manager.js';
import { defaultObservationEngine } from '../observation/index.js';
import { defaultSemanticPageAnalyzer } from '../semantic/index.js';

export const SESSION_STATUS = Object.freeze({
  INITIALIZING: 'INITIALIZING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CHECKPOINTED: 'CHECKPOINTED',
  CLOSING: 'CLOSING',
  CLOSED: 'CLOSED',
  CRASHED: 'CRASHED',
  TIMED_OUT: 'TIMED_OUT',
  CANCELLED: 'CANCELLED'
});

/**
 * BrowserSession — First-Class Stateful Automation Session
 */
export class BrowserSession extends EventEmitter {
  constructor({
    sessionId,
    jobId,
    browserId,
    contextId,
    activePageId,
    initialUrl = 'about:blank',
    managers = {}
  }) {
    super();
    this.setMaxListeners(50);
    this.sessionId = sessionId || `sess_${crypto.randomUUID()}`;
    this.jobId = String(jobId || '');
    this.browserId = browserId;
    this.contextId = contextId;
    this.activePageId = activePageId;
    this.currentUrl = initialUrl;
    this.framePath = 'root';
    this.status = SESSION_STATUS.ACTIVE;
    this.createdAt = new Date().toISOString();
    this.lastActivityAt = new Date().toISOString();
    this.workflowStep = 0;
    this.executionStep = 0;
    this.checkpointState = {};

    // Injected engine managers
    this.browserManager = managers.browserManager || defaultBrowserManager;
    this.contextManager = managers.contextManager || defaultContextManager;
    this.pageManager = managers.pageManager || defaultPageManager;
    this.frameManager = managers.frameManager || defaultFrameManager;
    this.checkpointManager = managers.checkpointManager || defaultCheckpointManager;
    this.observationEngine = managers.observationEngine || defaultObservationEngine;
    this.semanticAnalyzer = managers.semanticAnalyzer || defaultSemanticPageAnalyzer;
    this.cleanupManager =
      managers.cleanupManager ||
      new CleanupManager({
        browserManager: this.browserManager,
        contextManager: this.contextManager,
        pageManager: this.pageManager
      });

    this._bindEvents();
  }

  _bindEvents() {
    this._navListener = ({ pageId, url }) => {
      if (pageId === this.activePageId) {
        this.currentUrl = url;
        this.touch();
        this.emit('navigated', { sessionId: this.sessionId, url });
      }
    };

    this._popupListener = ({ pageId, url }) => {
      this.touch();
      this.emit('popup', { sessionId: this.sessionId, pageId, url });
    };

    this._crashListener = ({ pageId }) => {
      if (pageId === this.activePageId) {
        this.status = SESSION_STATUS.CRASHED;
        this.emit('crash', { sessionId: this.sessionId, pageId, type: 'PAGE_CRASH' });
      }
    };

    this.pageManager.on('navigated', this._navListener);
    this.pageManager.on('popup', this._popupListener);
    this.pageManager.on('pageCrash', this._crashListener);
  }

  _unbindEvents() {
    if (this._navListener) this.pageManager.off('navigated', this._navListener);
    if (this._popupListener) this.pageManager.off('popup', this._popupListener);
    if (this._crashListener) this.pageManager.off('pageCrash', this._crashListener);
  }

  touch() {
    this.lastActivityAt = new Date().toISOString();
  }

  /**
   * Returns active Playwright Page instance (held only in memory, never serialized)
   */
  getActivePageHandle() {
    const record = this.pageManager.getActivePage();
    return record ? record.page : null;
  }

  /**
   * Navigates active page to target URL
   */
  async navigate(url, options = {}) {
    this.touch();
    const result = await this.pageManager.safeGoto(this.activePageId, url, options);
    this.currentUrl = result.url;
    return result;
  }

  /**
   * Safely fills an input taking current framePath into account
   */
  async fill(selector, value, options = {}) {
    this.touch();
    const page = this.getActivePageHandle();
    if (!page) throw new Error(`BrowserSession: No active page for session ${this.sessionId}`);

    if (this.framePath && this.framePath !== 'root') {
      await this.frameManager.safeFill(page, this.framePath, selector, value, options.timeout);
    } else {
      await page.fill(selector, String(value), { timeout: options.timeout || 10000 });
    }
  }

  /**
   * Safely clicks an element taking current framePath into account
   */
  async click(selector, options = {}) {
    this.touch();
    const page = this.getActivePageHandle();
    if (!page) throw new Error(`BrowserSession: No active page for session ${this.sessionId}`);

    if (this.framePath && this.framePath !== 'root') {
      await this.frameManager.safeClick(page, this.framePath, selector, options.timeout);
    } else {
      await page.click(selector, { timeout: options.timeout || 10000 });
    }
  }

  /**
   * Captures full or element screenshot
   */
  async screenshot(options = {}) {
    this.touch();
    const page = this.getActivePageHandle();
    if (!page) throw new Error(`BrowserSession: No active page for session ${this.sessionId}`);

    const buf = await page.screenshot(options);
    return buf.toString('base64');
  }

  /**
   * Sets current frame hierarchy traversal
   */
  setFramePath(framePath) {
    this.framePath = framePath;
    this.touch();
  }

  /**
   * Captures a structured canonical BrowserObservation snapshot of the active page
   */
  async observe(options = {}) {
    this.touch();
    const page = this.getActivePageHandle();
    if (!page) throw new Error(`BrowserSession: No active page for session ${this.sessionId}`);

    return await this.observationEngine.observe(page, options);
  }

  /**
   * Understands active page semantics by observing and analyzing page elements.
   * Produces a validated SemanticPageModel contract.
   * @param {object} [options]
   * @returns {Promise<object>} SemanticPageModel
   */
  async understandPage(options = {}) {
    this.touch();
    const observation = options.observation || (await this.observe(options.observationOptions || {}));
    return await this.semanticAnalyzer.analyze(observation, options);
  }

  /**
   * Captures a strictly serializable checkpoint snapshot
   */
  async createCheckpoint(metadata = {}) {
    this.touch();
    const pageRecord = this.pageManager.getActivePage();
    const contextRecord = this.contextManager.getContext(this.contextId);

    const checkpoint = await this.checkpointManager.captureCheckpoint({
      sessionId: this.sessionId,
      pageRecord,
      contextInstance: contextRecord?.context,
      workflowStep: metadata.workflowStep ?? this.workflowStep,
      executionStep: metadata.executionStep ?? this.executionStep,
      framePath: this.framePath,
      checkpointState: {
        ...this.checkpointState,
        ...(metadata.checkpointState || {})
      }
    });

    this.workflowStep = checkpoint.workflowStep;
    this.executionStep = checkpoint.executionStep;
    this.checkpointState = checkpoint.checkpointState;
    this.status = SESSION_STATUS.CHECKPOINTED;

    return checkpoint;
  }

  /**
   * Restores session state from a persisted checkpoint
   */
  async restoreFromCheckpoint(checkpoint) {
    this.touch();
    const page = this.getActivePageHandle();
    const restored = await this.checkpointManager.restoreCheckpoint({
      page,
      checkpoint
    });

    this.workflowStep = restored.workflowStep;
    this.executionStep = restored.executionStep;
    this.checkpointState = restored.checkpointState;
    this.currentUrl = restored.url;
    this.status = SESSION_STATUS.ACTIVE;

    return restored;
  }

  /**
   * Closes the session and guarantees complete teardown
   */
  async close(reason = CLEANUP_REASONS.SUCCESS) {
    this._unbindEvents();
    await this.cleanupManager.cleanupSession(this, reason);
  }

  /**
   * Exports strictly serializable state.
   * NEVER persists or leaks Playwright Browser, Page, or Context objects.
   */
  toSerializableState() {
    return {
      sessionId: this.sessionId,
      jobId: this.jobId,
      browserId: this.browserId,
      contextId: this.contextId,
      activePageId: this.activePageId,
      currentUrl: this.currentUrl,
      openedPages: this.pageManager.getOpenedPagesSerializable(),
      framePath: Array.isArray(this.framePath) ? [...this.framePath] : this.framePath,
      status: this.status,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt,
      workflowStep: this.workflowStep,
      executionStep: this.executionStep,
      checkpointState: { ...this.checkpointState }
    };
  }

  toJSON() {
    return this.toSerializableState();
  }
}

/**
 * SessionManager — Central Factory & Registry for Browser Sessions
 */
export class SessionManager extends EventEmitter {
  constructor(customManagers = {}) {
    super();
    this.setMaxListeners(100);
    this.sessions = new Map(); // sessionId -> BrowserSession
    this.browserManager = customManagers.browserManager || defaultBrowserManager;
    this.contextManager = customManagers.contextManager || defaultContextManager;
    this.pageManager = customManagers.pageManager || defaultPageManager;
    this.frameManager = customManagers.frameManager || defaultFrameManager;
    this.checkpointManager = customManagers.checkpointManager || defaultCheckpointManager;
    this.cleanupManager =
      customManagers.cleanupManager ||
      new CleanupManager({
        browserManager: this.browserManager,
        contextManager: this.contextManager,
        pageManager: this.pageManager
      });

    this._bindManagerEvents();
  }

  _bindManagerEvents() {
    this._browserCrashListener = ({ browserId }) => {
      for (const session of this.sessions.values()) {
        if (session.browserId === browserId) {
          session.status = SESSION_STATUS.CRASHED;
          this.emit('sessionCrash', { sessionId: session.sessionId, type: 'BROWSER_CRASH' });
        }
      }
    };
    this.browserManager.on('browserCrash', this._browserCrashListener);
  }

  /**
   * Creates a new managed BrowserSession
   */
  async createSession({ jobId, options = {}, checkpoint = null } = {}) {
    const sessionId = `sess_${crypto.randomUUID()}`;

    // 1. Launch Browser
    const { browserId, browser } = await this.browserManager.launchBrowser(options.browserOptions);

    // 2. Create Context (restore storageState if present in checkpoint)
    const contextOptions = {
      ...options.contextOptions,
      ...(checkpoint?.storageState ? { storageState: checkpoint.storageState } : {})
    };
    const { contextId, context } = await this.contextManager.createContext(
      browser,
      browserId,
      contextOptions
    );

    // 3. Create initial Page
    const pageRecord = await this.pageManager.createPage(context, contextId);

    // 4. Construct BrowserSession
    const session = new BrowserSession({
      sessionId,
      jobId,
      browserId,
      contextId,
      activePageId: pageRecord.pageId,
      initialUrl: checkpoint?.url || 'about:blank',
      managers: {
        browserManager: this.browserManager,
        contextManager: this.contextManager,
        pageManager: this.pageManager,
        frameManager: this.frameManager,
        checkpointManager: this.checkpointManager,
        cleanupManager: this.cleanupManager
      }
    });

    if (checkpoint) {
      await session.restoreFromCheckpoint(checkpoint);
    }

    this.sessions.set(sessionId, session);
    this.emit('sessionCreated', { sessionId, jobId });

    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  getSessionByJobId(jobId) {
    if (!jobId) return null;
    return Array.from(this.sessions.values()).find((s) => s.jobId === String(jobId)) || null;
  }

  async destroySession(sessionId, reason = CLEANUP_REASONS.SUCCESS) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);
    await session.close(reason);
    this.emit('sessionDestroyed', { sessionId, reason });
  }

  async cleanupAll() {
    if (this._browserCrashListener) {
      this.browserManager.off('browserCrash', this._browserCrashListener);
    }
    const activeSessions = Array.from(this.sessions.values());
    this.sessions.clear();
    await this.cleanupManager.cleanupAll(activeSessions);
  }

  getActiveCount() {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status !== SESSION_STATUS.CLOSED && s.status !== SESSION_STATUS.CRASHED
    ).length;
  }
}

export const defaultSessionManager = new SessionManager();
export default SessionManager;
