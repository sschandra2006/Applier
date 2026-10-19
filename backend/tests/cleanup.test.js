/**
 * Browser Cleanup & Process Leak Prevention Tests
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Verifies that BrowserManager properly tracks browser instances and PIDs,
 * ensuring no orphaned Chromium processes linger after job termination.
 */

import { BrowserManager } from '../../browser-worker/src/engine/browser.manager.js';

describe('5. Browser Cleanup & Process Tracking Tests', () => {
  let manager;

  beforeEach(() => {
    manager = new BrowserManager();
  });

  afterEach(async () => {
    await manager.cleanupAllBrowsers();
  });

  it('should launch Chromium, register active instance and track its PID', async () => {
    const browser = await manager.launchBrowser();
    expect(browser).toBeDefined();
    expect(manager.getActiveCount()).toBe(1);

    // PID should be tracked if available from browser process
    const proc = browser.process ? browser.process() : null;
    if (proc && proc.pid) {
      expect(manager.activePids.has(proc.pid)).toBe(true);
    }

    await manager.closeBrowser(browser);
    expect(manager.getActiveCount()).toBe(0);
  }, 20000);

  it('should clean up all active browsers on cleanupAllBrowsers call', async () => {
    const b1 = await manager.launchBrowser();
    const b2 = await manager.launchBrowser();
    expect(manager.getActiveCount()).toBe(2);

    await manager.cleanupAllBrowsers();
    expect(manager.getActiveCount()).toBe(0);
    expect(manager.activePids.size).toBe(0);
  }, 20000);

  it('should gracefully handle already-closed browsers without throwing errors', async () => {
    const browser = await manager.launchBrowser();
    await browser.close(); // Closed externally
    
    // Calling closeBrowser should handle it without unhandled rejection
    await expect(manager.closeBrowser(browser)).resolves.not.toThrow();
    expect(manager.getActiveCount()).toBe(0);
  });
});
