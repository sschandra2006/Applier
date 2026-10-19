/**
 * BrowserManager — Playwright Process & Lifecycle Controller
 * Applier 2.0 — Phase 3: Browser Session & Context Management
 *
 * Manages physical Playwright Chromium instances, tracks OS process PIDs,
 * monitors disconnects/crashes, and guarantees clean process termination.
 */

import { chromium } from 'playwright';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';
import { EventEmitter } from 'events';

const execAsync = util.promisify(exec);

export class BrowserManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.browsers = new Map(); // browserId -> { id, browser, pid, status, createdAt }
    this.pids = new Set();
    this._setupProcessHooks();
  }

  _setupProcessHooks() {
    if (BrowserManager._hooksRegistered) return;
    BrowserManager._hooksRegistered = true;
    const handleExit = () => {
      this.cleanupAll().catch(() => {});
    };
    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
    process.on('beforeExit', handleExit);
  }

  /**
   * Launches a new managed Chromium instance
   * @param {object} options Launch options (headless, slowMo, args)
   * @returns {Promise<{ browserId: string, browser: import('playwright').Browser, pid: number }>}
   */
  async launchBrowser(options = {}) {
    const browserId = `br_${crypto.randomUUID()}`;

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      ...(options.args || [])
    ];

    try {
      const browser = await chromium.launch({
        headless: options.headless ?? true,
        args: launchArgs,
        ...options
      });

      let pid = null;
      try {
        const proc = browser.process ? browser.process() : null;
        if (proc && proc.pid) {
          pid = proc.pid;
          this.pids.add(pid);
        }
      } catch (_) {}

      const record = {
        browserId,
        browser,
        pid,
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };

      this.browsers.set(browserId, record);

      browser.on('disconnected', () => {
        record.status = 'DISCONNECTED';
        this.emit('browserCrash', { browserId, pid, reason: 'Disconnected unexpectedly' });
        this.browsers.delete(browserId);
        if (pid) this.pids.delete(pid);
      });

      this.emit('browserLaunched', { browserId, pid });
      return { browserId, browser, pid };
    } catch (err) {
      throw new Error(`BrowserManager: Failed to launch Chromium: ${err.message}`);
    }
  }

  /**
   * Retrieves an active browser record
   */
  getBrowser(browserId) {
    return this.browsers.get(browserId) || null;
  }

  /**
   * Safely closes a managed browser instance with timeout and fallback kill
   */
  async closeBrowser(browserId) {
    const record = this.browsers.get(browserId);
    if (!record) return;

    this.browsers.delete(browserId);
    record.status = 'CLOSING';

    let timer;
    try {
      const closePromise = record.browser.close();
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('BrowserCloseTimeout')), 5000);
      });

      await Promise.race([closePromise, timeoutPromise]);
    } catch (err) {
      // Force kill process if close hung
      if (record.pid) {
        await this._forceKillPid(record.pid);
      }
    } finally {
      clearTimeout(timer);
      if (record.pid) this.pids.delete(record.pid);
      record.status = 'CLOSED';
      this.emit('browserClosed', { browserId, pid: record.pid });
    }
  }

  /**
   * Forcefully terminates a specific OS PID across Windows & Linux
   */
  async _forceKillPid(pid) {
    if (!pid) return;
    try {
      if (process.platform === 'win32') {
        await execAsync(`taskkill /F /PID ${pid} /T`).catch(() => {});
      } else {
        process.kill(pid, 'SIGKILL');
      }
    } catch (_) {}
    this.pids.delete(pid);
  }

  /**
   * Shuts down all active browsers and forcefully terminates lingering PIDs
   */
  async cleanupAll() {
    const ids = Array.from(this.browsers.keys());
    await Promise.allSettled(ids.map((id) => this.closeBrowser(id)));
    this.browsers.clear();

    for (const pid of this.pids) {
      await this._forceKillPid(pid);
    }
    this.pids.clear();
  }

  getActiveCount() {
    return this.browsers.size;
  }

  getActivePids() {
    return Array.from(this.pids);
  }
}

export const defaultBrowserManager = new BrowserManager();
export default BrowserManager;
