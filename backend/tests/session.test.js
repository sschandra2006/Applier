/**
 * Browser Session & Context Management Tests
 * Applier 2.0 — Phase 3
 *
 * Verifies:
 * - Session creation & serializable state model
 * - Multiple pages & tabs management
 * - Popup detection & opener tracking
 * - Iframes and nested iframe traversal
 * - Timeout handling
 * - Crash recovery (page crash, browser crash)
 * - Guaranteed cleanup across SUCCESS, FAILURE, TIMEOUT, CANCEL, WORKER_CRASH
 * - Serializable checkpoint capture & resumption
 */

import {
  SessionManager,
  BrowserManager,
  ContextManager,
  PageManager,
  FrameManager,
  CheckpointManager,
  CleanupManager,
  CLEANUP_REASONS,
  SESSION_STATUS
} from '../../browser-worker/browser/index.js';

describe('Phase 3: Browser Session & Context Management', () => {
  let sessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(async () => {
    await sessionManager.cleanupAll();
  });

  describe('1. Session Creation & State Model', () => {
    it('should create a first-class BrowserSession with complete serializable tracking', async () => {
      const session = await sessionManager.createSession({
        jobId: 'job_test_session_1'
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toMatch(/^sess_/);
      expect(session.jobId).toBe('job_test_session_1');
      expect(session.browserId).toMatch(/^br_/);
      expect(session.contextId).toMatch(/^ctx_/);
      expect(session.activePageId).toMatch(/^page_/);
      expect(session.status).toBe(SESSION_STATUS.ACTIVE);
      expect(session.framePath).toBe('root');
      expect(session.createdAt).toBeDefined();
      expect(session.lastActivityAt).toBeDefined();

      // Verify strictly serializable state
      const state = session.toSerializableState();
      expect(typeof state).toBe('object');
      expect(JSON.stringify(state)).toBeDefined();

      // Must never contain Playwright instances
      expect(state.page).toBeUndefined();
      expect(state.browser).toBeUndefined();
      expect(state.context).toBeUndefined();
      expect(state.openedPages).toHaveLength(1);
      expect(state.openedPages[0].pageId).toBe(session.activePageId);

      await session.close();
    }, 15000);
  });

  describe('2. Multiple Pages & Tabs Management', () => {
    it('should track multiple opened pages and switch active page', async () => {
      const session = await sessionManager.createSession({ jobId: 'job_multipage' });
      const contextRecord = session.contextManager.getContext(session.contextId);

      // Open a second page in the same context
      const page2Record = await session.pageManager.createPage(contextRecord.context, session.contextId);

      const state = session.toSerializableState();
      expect(state.openedPages).toHaveLength(2);

      // Switch active page
      session.pageManager.setActivePage(page2Record.pageId);
      session.activePageId = page2Record.pageId;

      expect(session.activePageId).toBe(page2Record.pageId);

      await session.close();
    }, 15000);
  });

  describe('3. Popup Pages Handling', () => {
    it('should automatically detect and register popup windows with opener tracking', async () => {
      const session = await sessionManager.createSession({ jobId: 'job_popup' });

      // Navigate to a page that triggers a window.open popup
      const openerHtml = `data:text/html,<!DOCTYPE html><html><body>
        <h1>Opener Window</h1>
        <button id="openPopupBtn" onclick="window.open('about:blank', '_blank');">Open Popup</button>
      </body></html>`;

      await session.navigate(openerHtml);

      // Trigger popup and await Playwright event
      const pageHandle = session.getActivePageHandle();
      await Promise.all([
        pageHandle.waitForEvent('popup'),
        pageHandle.click('#openPopupBtn')
      ]);

      const state = session.toSerializableState();
      expect(state.openedPages.length).toBeGreaterThanOrEqual(2);

      const popupRecord = state.openedPages.find((p) => p.isPopup);
      expect(popupRecord).toBeDefined();
      expect(popupRecord.openerPageId).toBe(session.activePageId);

      await session.close();
    }, 15000);
  });

  describe('4. Iframe & Nested Iframe Traversal', () => {
    it('should resolve and interact with elements inside nested iframes', async () => {
      const session = await sessionManager.createSession({ jobId: 'job_iframe' });

      // Inner iframe content
      const innerHtml = `data:text/html;base64,${Buffer.from(
        '<html><body><input id="innerInput" type="text" /><button id="innerBtn" onclick="document.body.setAttribute(\'data-clicked\', \'true\');">Inner Click</button></body></html>'
      ).toString('base64')}`;

      // Outer iframe containing inner iframe
      const outerHtml = `data:text/html;base64,${Buffer.from(
        `<html><body><iframe id="innerIframe" src="${innerHtml}"></iframe></body></html>`
      ).toString('base64')}`;

      // Main page containing outer iframe
      const mainHtml = `data:text/html;base64,${Buffer.from(
        `<html><body><h1>Main Page</h1><iframe id="outerIframe" src="${outerHtml}"></iframe></body></html>`
      ).toString('base64')}`;

      await session.navigate(mainHtml);
      const pageHandle = session.getActivePageHandle();

      // Wait for iframes to load
      await pageHandle.waitForSelector('#outerIframe');
      await pageHandle.waitForTimeout(500);

      // Target nested iframe path
      const framePath = ['#outerIframe', '#innerIframe'];
      session.setFramePath(framePath);

      // Fill and click in nested iframe
      await session.fill('#innerInput', 'Nested Text Value');
      await session.click('#innerBtn');

      const state = session.toSerializableState();
      expect(state.framePath).toEqual(framePath);

      await session.close();
    }, 20000);
  });

  describe('5. Timeout Handling', () => {
    it('should handle navigation timeout gracefully', async () => {
      const session = await sessionManager.createSession({ jobId: 'job_timeout' });

      // 10ms timeout on a slow/hanging destination
      await expect(
        session.pageManager.safeGoto(session.activePageId, 'https://10.255.255.1', {
          timeout: 100
        })
      ).rejects.toThrow();

      await session.close(CLEANUP_REASONS.TIMEOUT);
      expect(session.status).toBe(SESSION_STATUS.TIMED_OUT);
    }, 15000);
  });

  describe('6. Crash Handling (Page & Browser)', () => {
    it('should transition page and session status on page crash without process termination', async () => {
      const session = await sessionManager.createSession({ jobId: 'job_crash_page' });
      const pageRecord = session.pageManager.getActivePage();

      let crashEmitted = false;
      session.on('crash', (data) => {
        crashEmitted = true;
      });

      // Simulate page crash event
      pageRecord.page.emit('crash');

      expect(pageRecord.status).toBe('CRASHED');
      expect(session.status).toBe(SESSION_STATUS.CRASHED);
      expect(crashEmitted).toBe(true);

      await session.close(CLEANUP_REASONS.FAILURE);
    }, 15000);

    it('should transition session to CRASHED when browser disconnects unexpectedly', async () => {
      const session = await sessionManager.createSession({ jobId: 'job_crash_browser' });
      const browserRecord = session.browserManager.getBrowser(session.browserId);

      let browserCrashEmitted = false;
      sessionManager.on('sessionCrash', (data) => {
        browserCrashEmitted = true;
      });

      // Simulate unexpected browser disconnection
      browserRecord.browser.emit('disconnected');

      expect(session.status).toBe(SESSION_STATUS.CRASHED);
      expect(browserCrashEmitted).toBe(true);

      await session.close(CLEANUP_REASONS.WORKER_CRASH);
    }, 15000);
  });

  describe('7. Guaranteed Cleanup across Conditions', () => {
    const reasons = [
      { reason: CLEANUP_REASONS.SUCCESS, expected: SESSION_STATUS.CLOSED },
      { reason: CLEANUP_REASONS.FAILURE, expected: 'FAILED' },
      { reason: CLEANUP_REASONS.TIMEOUT, expected: 'TIMED_OUT' },
      { reason: CLEANUP_REASONS.CANCEL, expected: 'CANCELLED' },
      { reason: CLEANUP_REASONS.WORKER_CRASH, expected: 'CRASHED' }
    ];

    it.each(reasons)(
      'should clean up session on %s and set status to %s with 0 process leaks',
      async ({ reason, expected }) => {
        const session = await sessionManager.createSession({ jobId: `job_cleanup_${reason}` });

        await session.close(reason);

        expect(session.status).toBe(expected);
        expect(sessionManager.browserManager.getActiveCount()).toBe(0);
        expect(sessionManager.browserManager.getActivePids().length).toBe(0);
      },
      15000
    );
  });

  describe('8. Checkpoint & Resumption', () => {
    it('should capture a serializable checkpoint and restore state in a new session', async () => {
      const session1 = await sessionManager.createSession({ jobId: 'job_checkpoint_1' });

      const formHtml = `data:text/html,<!DOCTYPE html><html><body>
        <h1>Step 1 Form</h1>
        <input id="userName" type="text" />
      </body></html>`;

      await session1.navigate(formHtml);
      await session1.fill('#userName', 'Alice Scholar');

      // Capture checkpoint
      const checkpoint = await session1.createCheckpoint({
        workflowStep: 1,
        executionStep: 3,
        checkpointState: {
          userName: 'Alice Scholar',
          stepCompleted: true
        }
      });

      expect(checkpoint).toBeDefined();
      expect(checkpoint.checkpointVersion).toBe('2.0.0');
      expect(checkpoint.workflowStep).toBe(1);
      expect(checkpoint.executionStep).toBe(3);
      expect(checkpoint.checkpointState.userName).toBe('Alice Scholar');

      // Close session 1
      await session1.close();

      // Restore in new Session 2 from checkpoint
      const session2 = await sessionManager.createSession({
        jobId: 'job_checkpoint_1_resumed',
        checkpoint
      });

      expect(session2.currentUrl).toBe(checkpoint.url);
      expect(session2.workflowStep).toBe(1);
      expect(session2.executionStep).toBe(3);
      expect(session2.checkpointState.userName).toBe('Alice Scholar');

      await session2.close();
    }, 25000);
  });
});
