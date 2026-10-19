/**
 * Playwright Browser Lifecycle & Process Leak Prevention Manager
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Guarantees that Chromium child processes are tracked and never left orphaned.
 */

import { chromium } from 'playwright';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export class BrowserManager {
  constructor() {
    this.activeBrowsers = new Set();
    this.activePids = new Set();
    this._setupProcessHooks();
  }

  _setupProcessHooks() {
    const cleanup = () => {
      this.cleanupAllBrowsers().catch(() => {});
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Launches a managed Chromium browser instance and registers its PID
   */
  async launchBrowser(customArgs = {}) {
    try {
      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ],
        ...customArgs
      };

      const browser = await chromium.launch(launchOptions);
      this.activeBrowsers.add(browser);

      // Attempt to capture browser child process PID
      try {
        const proc = browser.process ? browser.process() : null;
        if (proc && proc.pid) {
          this.activePids.add(proc.pid);
        }
      } catch (_) {}

      return browser;
    } catch (err) {
      throw new Error(`BrowserLaunchError: Failed to launch Playwright Chromium: ${err.message}`);
    }
  }

  /**
   * Safely closes a single browser instance with timeout and fallback kill
   */
  async closeBrowser(browser) {
    if (!browser) return;

    let pid = null;
    try {
      const proc = browser.process ? browser.process() : null;
      if (proc && proc.pid) pid = proc.pid;
    } catch (_) {}

    this.activeBrowsers.delete(browser);

    try {
      // 5-second graceful closure timeout
      const closePromise = browser.close();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('BrowserCloseTimeout')), 5000)
      );

      await Promise.race([closePromise, timeoutPromise]);
    } catch (err) {
      // If graceful close timed out or failed, force kill process
      if (pid) {
        await this._forceKillPid(pid);
      }
    } finally {
      if (pid) this.activePids.delete(pid);
    }
  }

  /**
   * Forcefully kills a specific PID across Windows / Linux
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
    this.activePids.delete(pid);
  }

  /**
   * Closes all registered browsers and kills any lingering Chromium PIDs
   */
  async cleanupAllBrowsers() {
    const closePromises = [];
    for (const browser of this.activeBrowsers) {
      closePromises.push(this.closeBrowser(browser));
    }
    await Promise.allSettled(closePromises);
    this.activeBrowsers.clear();

    // Kill any lingering tracked PIDs
    for (const pid of this.activePids) {
      await this._forceKillPid(pid);
    }
    this.activePids.clear();
  }

  getActiveCount() {
    return this.activeBrowsers.size;
  }
}

export const defaultBrowserManager = new BrowserManager();
export default defaultBrowserManager;
