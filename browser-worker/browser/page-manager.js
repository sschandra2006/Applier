/**
 * PageManager — Tab, Popup, Navigation & Crash Controller
 * Applier 2.0 — Phase 3: Browser Session & Context Management
 *
 * Tracks open pages, handles new tabs/popups, frame navigation/redirects,
 * file downloads, and recovers gracefully from page crashes.
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import { SSRFGuard, SSRFViolationError } from '../../backend/src/security/ssrf-guard.js';

export class PageManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.pages = new Map(); // pageId -> record
    this.activePageId = null;
    this.contextListeners = new Map(); // contextId -> listener function
    this._isExplicitPageCreation = false;
  }

  /**
   * Binds to a BrowserContext to automatically detect popups and newly opened tabs
   * @param {import('playwright').BrowserContext} context
   * @param {string} contextId
   */
  bindContext(context, contextId) {
    if (this.contextListeners.has(contextId)) return;

    const onPageHandler = async (newPage) => {
      // Do not duplicate explicit context.newPage() calls
      if (this._isExplicitPageCreation) return;

      let openerId = null;
      try {
        const opener = await newPage.opener();
        if (opener) {
          openerId = this.findPageIdByInstance(opener);
        }
      } catch (_) {}

      // Fallback opener to currently active page
      if (!openerId) {
        openerId = this.activePageId;
      }

      const record = this._registerPage(newPage, contextId, {
        isPopup: true,
        openerPageId: openerId
      });

      this.emit('popup', {
        pageId: record.pageId,
        contextId,
        url: record.url,
        openerPageId: openerId
      });
      this.emit('pageAdded', record);
    };

    context.on('page', onPageHandler);
    this.contextListeners.set(contextId, onPageHandler);
  }

  /**
   * Creates a new managed page inside the given context
   */
  async createPage(context, contextId) {
    if (!context) throw new Error('PageManager: context is required');

    this.bindContext(context, contextId);

    this._isExplicitPageCreation = true;
    let page;
    try {
      page = await context.newPage();
    } finally {
      this._isExplicitPageCreation = false;
    }

    const record = this._registerPage(page, contextId, { isPopup: false });

    // Set as active if no active page currently set
    if (!this.activePageId) {
      this.activePageId = record.pageId;
    }

    return record;
  }

  /**
   * Registers a Playwright page instance and attaches lifecycle event listeners
   */
  _registerPage(page, contextId, { isPopup = false, openerPageId = null } = {}) {
    const existingId = this.findPageIdByInstance(page);
    if (existingId) {
      const existing = this.pages.get(existingId);
      if (isPopup !== undefined) existing.isPopup = isPopup;
      if (openerPageId) existing.openerPageId = openerPageId;
      return existing;
    }

    const pageId = `page_${crypto.randomUUID()}`;

    const record = {
      pageId,
      contextId,
      page,
      url: page.url() || 'about:blank',
      title: '',
      isPopup,
      openerPageId,
      status: 'INITIAL',
      openedAt: new Date().toISOString(),
      closedAt: null
    };

    this.pages.set(pageId, record);

    // Track navigation & redirects
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        const newUrl = frame.url();
        record.url = newUrl;
        try {
          record.title = await page.title();
        } catch (_) {}
        record.status = 'LOADED';
        this.emit('navigated', { pageId, url: newUrl, title: record.title });
      }
    });

    // Handle Page Crashes without killing the worker process
    page.on('crash', () => {
      record.status = 'CRASHED';
      this.emit('pageCrash', {
        pageId,
        contextId,
        url: record.url,
        reason: 'Page process crashed'
      });
    });

    // Handle downloads cleanly
    page.on('download', (download) => {
      this.emit('download', {
        pageId,
        url: download.url(),
        suggestedFilename: download.suggestedFilename()
      });
    });

    // Handle close
    page.on('close', () => {
      record.status = 'CLOSED';
      record.closedAt = new Date().toISOString();
      if (this.activePageId === pageId) {
        // Switch to any remaining open page
        const remaining = Array.from(this.pages.values()).find(
          (p) => p.pageId !== pageId && p.status !== 'CLOSED' && p.status !== 'CRASHED'
        );
        this.activePageId = remaining ? remaining.pageId : null;
      }
      this.emit('pageClosed', { pageId, contextId });
    });

    return record;
  }

  findPageIdByInstance(pageInstance) {
    for (const [id, record] of this.pages.entries()) {
      if (record.page === pageInstance) return id;
    }
    return null;
  }

  getPage(pageId) {
    return this.pages.get(pageId) || null;
  }

  getActivePage() {
    if (!this.activePageId) return null;
    return this.pages.get(this.activePageId) || null;
  }

  setActivePage(pageId) {
    if (!this.pages.has(pageId)) {
      throw new Error(`PageManager: Page ${pageId} not found`);
    }
    this.activePageId = pageId;
    this.emit('activePageChanged', { pageId });
  }

  /**
   * Navigates active or specified page safely with timeout and soft fallback
   */
  async safeGoto(pageId, url, options = {}) {
    const record = this.getPage(pageId);
    if (!record || !record.page) {
      throw new Error(`PageManager: Page ${pageId} not found`);
    }

    // SSRF & Private IP Guard
    const isMockTestUrl = process.env.NODE_ENV === 'test' && (
      url.startsWith('data:text/html') ||
      url === 'about:blank' ||
      url.startsWith('http://localhost:') ||
      url.startsWith('http://127.0.0.1:')
    );
    if (!isMockTestUrl) {
      const ssrfCheck = await SSRFGuard.validateUrl(url);
      if (!ssrfCheck.allowed) {
        throw new SSRFViolationError(
          `Browser navigation blocked by SSRF guard: ${ssrfCheck.reason}`,
          { url, reason: ssrfCheck.reason }
        );
      }
    }

    const timeout = options.timeout ?? 30000;

    try {
      await record.page.goto(url, {
        waitUntil: options.waitUntil || 'domcontentloaded',
        timeout
      });

      // Soft network idle wait
      try {
        await record.page.waitForLoadState('networkidle', { timeout: 8000 });
      } catch (_) {}

      record.url = record.page.url();
      try {
        record.title = await record.page.title();
      } catch (_) {}

      return { success: true, url: record.url, title: record.title };
    } catch (err) {
      throw new Error(`PageManager: Navigation failed for ${url}: ${err.message}`);
    }
  }

  /**
   * Safely closes a page
   */
  async closePage(pageId) {
    const record = this.getPage(pageId);
    if (!record || !record.page) return;

    try {
      await record.page.close();
    } catch (_) {}
    record.status = 'CLOSED';
    record.closedAt = new Date().toISOString();
  }

  /**
   * Returns a purely serializable array of page metadata (no Playwright objects)
   */
  getOpenedPagesSerializable() {
    return Array.from(this.pages.values()).map((p) => ({
      pageId: p.pageId,
      contextId: p.contextId,
      url: p.url,
      title: p.title,
      isPopup: p.isPopup,
      openerPageId: p.openerPageId,
      status: p.status,
      openedAt: p.openedAt,
      closedAt: p.closedAt
    }));
  }

  async cleanupAll() {
    const pageIds = Array.from(this.pages.keys());
    await Promise.allSettled(pageIds.map((id) => this.closePage(id)));
    this.pages.clear();
    this.activePageId = null;
  }

  getActiveCount() {
    return Array.from(this.pages.values()).filter(
      (p) => p.status !== 'CLOSED' && p.status !== 'CRASHED'
    ).length;
  }
}

export const defaultPageManager = new PageManager();
export default PageManager;
