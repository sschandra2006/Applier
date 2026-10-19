/**
 * FrameManager — Iframe & Nested Iframe Traversal Controller
 * Applier 2.0 — Phase 3: Browser Session & Context Management
 *
 * Provides safe frame resolution and DOM interactions for single and nested iframes,
 * tracking the hierarchical framePath in serializable form.
 */

export class FrameManager {
  /**
   * Resolves a target Frame based on a hierarchical framePath array or returns mainFrame
   * @param {import('playwright').Page} page
   * @param {Array<string> | string | null} framePath e.g. ['iframe#digilocker', 'iframe#captcha'] or 'root'
   * @returns {Promise<import('playwright').Frame>}
   */
  async resolveFrame(page, framePath = null) {
    if (!page) throw new Error('FrameManager: page instance is required');

    // Default to main frame if root or empty
    if (!framePath || framePath === 'root' || (Array.isArray(framePath) && framePath.length === 0)) {
      return page.mainFrame();
    }

    const pathArray = Array.isArray(framePath) ? framePath : [framePath];
    let currentFrame = page.mainFrame();

    for (const selector of pathArray) {
      // 1. Try finding by frame name or URL
      let nextFrame = page.frames().find((f) => f.name() === selector || (f.url() && f.url().includes(selector)));

      // 2. If not found by name, locate frame element by CSS selector in currentFrame
      if (!nextFrame) {
        try {
          const frameElement = await currentFrame.$(selector);
          if (frameElement) {
            nextFrame = await frameElement.contentFrame();
          }
        } catch (_) {}
      }

      // 3. Fallback: check childFrames of currentFrame
      if (!nextFrame) {
        for (const child of currentFrame.childFrames()) {
          try {
            const frameEl = await child.frameElement();
            const id = await frameEl.getAttribute('id');
            const name = await frameEl.getAttribute('name');
            if (id === selector || `#${id}` === selector || name === selector) {
              nextFrame = child;
              break;
            }
          } catch (_) {}
        }
      }

      if (!nextFrame) {
        throw new Error(`FrameManager: Unable to locate iframe "${selector}" along path: ${JSON.stringify(framePath)}`);
      }

      currentFrame = nextFrame;
    }

    return currentFrame;
  }

  /**
   * Safely fills an input inside a designated frame path
   */
  async safeFill(page, framePath, selector, value, timeout = 10000) {
    const frame = await this.resolveFrame(page, framePath);
    await frame.fill(selector, String(value), { timeout });
  }

  /**
   * Safely clicks an element inside a designated frame path
   */
  async safeClick(page, framePath, selector, timeout = 10000) {
    const frame = await this.resolveFrame(page, framePath);
    await frame.click(selector, { timeout });
  }

  /**
   * Safely evaluates a function inside a designated frame path
   */
  async safeEvaluate(page, framePath, fn, arg = null) {
    const frame = await this.resolveFrame(page, framePath);
    return await frame.evaluate(fn, arg);
  }

  /**
   * Returns metadata of all frames currently attached to page
   */
  getFramesHierarchy(page) {
    if (!page) return [];
    return page.frames().map((f) => ({
      name: f.name() || '',
      url: f.url(),
      isMain: f === page.mainFrame()
    }));
  }
}

export const defaultFrameManager = new FrameManager();
export default FrameManager;
