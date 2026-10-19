/**
 * ObservationEngine — Live Browser State to Canonical BrowserObservation Engine
 * Applier 2.0 — Phase 4: Live Browser Observation Engine
 *
 * Converts live Playwright browser state into structured, normalized
 * BrowserObservation contracts. Never emits raw, uncompressed DOM to the LLM.
 */

import crypto from 'crypto';
import { collectFrameDom } from './dom-collector.js';
import { defaultElementNormalizer } from './element-normalizer.js';
import { defaultFormExtractor } from './form-extractor.js';
import { defaultActionCandidateDetector } from './action-candidate-detector.js';
import { validateBrowserObservation } from '../../shared/validators/index.js';

export class ObservationEngine {
  constructor(customComponents = {}) {
    this.elementNormalizer = customComponents.elementNormalizer || defaultElementNormalizer;
    this.formExtractor = customComponents.formExtractor || defaultFormExtractor;
    this.actionDetector = customComponents.actionDetector || defaultActionCandidateDetector;
  }

  /**
   * Converts a live Playwright page into a validated BrowserObservation
   * @param {import('playwright').Page} page Live Playwright Page instance
   * @param {object} options
   * @param {string} options.depth 'interactive' (default) | 'forms_only' | 'full'
   * @param {boolean} options.captureScreenshot Whether to capture base64 screenshot
   * @param {boolean} options.includeFrames Whether to traverse attached iframes
   * @param {number} options.maxElements Maximum elements to extract
   * @param {number} options.maxTextLength Max text length per element
   * @returns {Promise<object>} Canonical BrowserObservation
   */
  async observe(page, options = {}) {
    if (!page) {
      throw new Error('ObservationEngine: Playwright page instance is required');
    }

    const startTime = Date.now();
    const observationId = `obs_${crypto.randomUUID()}`;
    const depth = options.depth || 'interactive';
    const captureScreenshot = Boolean(options.captureScreenshot);
    const includeFrames = options.includeFrames !== false;
    const maxElements = options.maxElements || 500;
    const maxTextLength = options.maxTextLength || 1000;

    // 1. Basic Page Properties
    const pageUrl = page.url() || 'about:blank';
    let pageTitle = '';
    try {
      pageTitle = await page.title();
    } catch (_) {}

    const viewport = page.viewportSize() || { width: 1280, height: 800 };

    // 2. Evaluate Main Frame
    let mainResult = {
      elements: [],
      forms: [],
      visibleTextSummary: '',
      readyState: 'complete'
    };

    try {
      mainResult = await page.evaluate(collectFrameDom, {
        depth,
        maxElements,
        maxTextLength,
        framePath: 'root'
      });
    } catch (err) {
      // In case of evaluation error on empty page, fallback gracefully
      mainResult.visibleTextSummary = `Evaluation failed: ${err.message}`;
    }

    const allRawElements = [...mainResult.elements];
    const allRawForms = [...mainResult.forms];
    const frameRecords = [
      {
        framePath: 'root',
        name: '',
        url: pageUrl
      }
    ];

    // 3. Child Frames Evaluation (Iframes)
    if (includeFrames) {
      const childFrames = page.frames().filter((f) => f !== page.mainFrame());
      for (const frame of childFrames) {
        try {
          // Identify framePath coordinates
          const frameName = frame.name() || '';
          const frameUrl = frame.url() || '';
          const frameSelector = frameName ? `iframe[name="${frameName}"]` : `iframe[src="${frameUrl}"]`;
          const framePath = [frameSelector];

          frameRecords.push({
            framePath,
            name: frameName,
            url: frameUrl
          });

          // Evaluate inside child frame
          const frameResult = await frame.evaluate(collectFrameDom, {
            depth,
            maxElements: Math.max(50, Math.floor(maxElements / 2)),
            maxTextLength,
            framePath
          });

          if (frameResult && Array.isArray(frameResult.elements)) {
            allRawElements.push(...frameResult.elements);
          }
          if (frameResult && Array.isArray(frameResult.forms)) {
            allRawForms.push(...frameResult.forms);
          }
        } catch (_) {
          // Cross-origin or restricted frames safely ignored
        }
      }
    }

    // 4. Normalization
    const normalizedElements = this.elementNormalizer.normalizeElements(allRawElements);
    const forms = this.formExtractor.extractForms(allRawForms, normalizedElements);
    const actions = this.actionDetector.detectCandidates(normalizedElements);

    // Clean internal properties from elements
    const cleanElements = normalizedElements.map((el) => {
      const { _localIndex, ...clean } = el;
      return clean;
    });

    // 5. Screenshot Capture (Optional)
    let screenshotBase64 = null;
    if (captureScreenshot) {
      try {
        const buf = await page.screenshot({ fullPage: false });
        screenshotBase64 = buf.toString('base64');
      } catch (_) {
        try {
          await new Promise((r) => setTimeout(r, 50));
          const buf = await page.screenshot({ fullPage: false });
          screenshotBase64 = buf.toString('base64');
        } catch (_) {}
      }
    }

    const durationMs = Date.now() - startTime;
    const timestamp = new Date().toISOString();

    // 6. Build Backwards-Compatible website-fields projection
    const fields = cleanElements
      .filter((el) => ['input', 'select', 'textarea'].includes(el.tag))
      .map((el) => ({
        schemaVersion: '2.0.0',
        fieldId: el.elementId,
        name: el.name || el.id || el.elementId,
        type: el.type || (el.tag === 'select' ? 'select' : el.tag === 'textarea' ? 'textarea' : 'text'),
        label: el.label || el.placeholder || el.name || '',
        selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : el.tag,
        required: el.required,
        placeholder: el.placeholder || '',
        options: el.options,
        pageUrl,
        pageTitle
      }));

    // 7. Compose Canonical BrowserObservation Payload
    const observation = {
      schemaVersion: '2.0.0',
      observationId,
      url: pageUrl,
      title: pageTitle,
      timestamp,
      page: {
        url: pageUrl,
        title: pageTitle,
        viewport,
        readyState: mainResult.readyState || 'complete',
        visibleTextSummary: mainResult.visibleTextSummary || ''
      },
      elements: cleanElements,
      forms,
      actions,
      frames: frameRecords,
      metadata: {
        observationDepth: depth,
        collectedAt: timestamp,
        durationMs,
        elementCount: cleanElements.length,
        formCount: forms.length,
        actionCount: actions.length,
        visibleTextLength: (mainResult.visibleTextSummary || '').length
      },
      screenshotReference: screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : null,

      // Compatibility fields for Phase 1 / Phase 2 consumers
      domSummary: {
        formCount: forms.length,
        inputCount: fields.length,
        hasFrames: frameRecords.length > 1,
        hasCaptcha: cleanElements.some(
          (el) => /captcha|recaptcha|hcaptcha|cf-turnstile/i.test(el.id) || /captcha|recaptcha/i.test(el.name)
        ),
        pagesScanned: 1
      },
      fields,
      screenshotBase64
    };

    // 8. Validate against Canonical Contract
    const validation = validateBrowserObservation(observation);
    if (!validation.valid) {
      const errorMsg = (validation.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`).join(', ');
      throw new Error(`ObservationEngine: Observation failed canonical validation: ${errorMsg}`);
    }

    return observation;
  }
}

export const defaultObservationEngine = new ObservationEngine();
export default defaultObservationEngine;
