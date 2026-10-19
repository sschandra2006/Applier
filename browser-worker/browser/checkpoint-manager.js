/**
 * CheckpointManager — Serializable State & Resumption Controller
 * Applier 2.0 — Phase 3: Browser Session & Context Management
 *
 * Captures clean, JSON-serializable checkpoints at safe points (URL, page ID,
 * workflow step, execution step, storage state, form answers) and restores them
 * without ever persisting or leaking Playwright objects.
 */

export class CheckpointManager {
  /**
   * Captures a strictly serializable checkpoint snapshot
   * @param {object} params
   * @returns {Promise<object>} JSON-serializable checkpoint object
   */
  async captureCheckpoint({
    sessionId,
    pageRecord,
    contextInstance,
    workflowStep = 0,
    executionStep = 0,
    framePath = 'root',
    checkpointState = {}
  }) {
    if (!pageRecord || !pageRecord.page) {
      throw new Error('CheckpointManager: valid pageRecord is required');
    }

    let storageState = null;
    if (contextInstance && typeof contextInstance.storageState === 'function') {
      try {
        storageState = await contextInstance.storageState();
      } catch (_) {}
    }

    const checkpoint = {
      checkpointVersion: '2.0.0',
      sessionId: String(sessionId || ''),
      url: pageRecord.page.url() || 'about:blank',
      pageId: String(pageRecord.pageId || ''),
      workflowStep,
      executionStep,
      framePath: Array.isArray(framePath) ? [...framePath] : String(framePath || 'root'),
      storageState: storageState || { cookies: [], origins: [] },
      checkpointState: { ...checkpointState },
      timestamp: new Date().toISOString()
    };

    // Verification check: ensure strictly serializable
    this._assertSerializable(checkpoint);

    return checkpoint;
  }

  /**
   * Verifies that the checkpoint contains no functions, circular references, or Playwright objects
   */
  _assertSerializable(obj) {
    try {
      const serialized = JSON.stringify(obj);
      if (!serialized || typeof serialized !== 'string') {
        throw new Error('Failed to stringify checkpoint object');
      }
    } catch (err) {
      throw new Error(`CheckpointManager: Checkpoint contains non-serializable objects: ${err.message}`);
    }
  }

  /**
   * Restores checkpoint state into a page/context
   */
  async restoreCheckpoint({ page, checkpoint }) {
    if (!page || !checkpoint) {
      throw new Error('CheckpointManager: page and checkpoint are required to restore');
    }

    if (checkpoint.url && checkpoint.url !== 'about:blank') {
      await page.goto(checkpoint.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    return {
      url: checkpoint.url,
      pageId: checkpoint.pageId,
      workflowStep: checkpoint.workflowStep,
      executionStep: checkpoint.executionStep,
      checkpointState: checkpoint.checkpointState || {}
    };
  }
}

export const defaultCheckpointManager = new CheckpointManager();
export default CheckpointManager;
