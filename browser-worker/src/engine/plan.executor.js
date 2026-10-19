/**
 * Plan Executor Engine
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Extracted from automation.service.js. Runs inside browser-worker to execute
 * Playwright application plans, handle robust dropdown selection, document uploads,
 * checkpoints (OTP/CAPTCHA), and status heartbeats.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { defaultBrowserManager } from './browser.manager.js';
import { WORKER_STATUS } from '../../../backend/src/queue/queue.constants.js';
import { VerifiedExecutionEngine } from '../../execution/index.js';

/**
 * Robustly selects an option in standard HTML selects, Select2, Chosen, or custom dropdowns.
 */
export async function selectOptionRobust(page, selector, rawValue) {
  const valueStr = String(rawValue).trim();
  if (!selector || !valueStr) return;

  // 1. Primary Strategy: Standard Playwright selectOption
  try {
    await page.selectOption(selector, valueStr, { timeout: 3000 });
    return;
  } catch (_) {}

  // 2. Secondary Strategy: DOM Evaluation & Event Dispatch (Handles Select2 & hidden native elements)
  try {
    const evaluated = await page.evaluate(
      ({ sel, val }) => {
        const selectEl = document.querySelector(sel);
        if (!selectEl) return { success: false, reason: 'Element not found' };

        if (selectEl.tagName === 'SELECT') {
          const targetNorm = val.toLowerCase();
          let matchedValue = null;

          for (const opt of selectEl.options) {
            if (opt.value === val || opt.value.trim().toLowerCase() === targetNorm) {
              matchedValue = opt.value;
              break;
            }
          }

          if (matchedValue === null) {
            for (const opt of selectEl.options) {
              if (opt.textContent.trim().toLowerCase() === targetNorm) {
                matchedValue = opt.value;
                break;
              }
            }
          }

          if (matchedValue === null) {
            for (const opt of selectEl.options) {
              const text = opt.textContent.trim().toLowerCase();
              if (text.includes(targetNorm) || targetNorm.includes(text)) {
                matchedValue = opt.value;
                break;
              }
            }
          }

          if (matchedValue !== null) {
            selectEl.value = matchedValue;
            selectEl.dispatchEvent(new Event('input', { bubbles: true }));
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));

            // Trigger jQuery/Select2 events if present
            if (typeof window.jQuery !== 'undefined') {
              const $el = window.jQuery(selectEl);
              $el.trigger('change');
              $el.trigger('select2:select');
            }

            return { success: true, matchedValue };
          }
        }
        return { success: false };
      },
      { sel: selector, val: valueStr }
    );

    if (evaluated.success) return;
  } catch (_) {}

  // 3. Tertiary Strategy: Select2 Custom Container Interaction
  try {
    const s2Result = await page.evaluate(
      ({ sel, val }) => {
        const selectEl = document.querySelector(sel);
        if (!selectEl) return false;

        const s2Container =
          selectEl.nextElementSibling?.classList.contains('select2-container')
            ? selectEl.nextElementSibling
            : document.querySelector(`.select2-container[data-select2-id*="${selectEl.id || ''}"]`);

        if (s2Container) {
          const selection = s2Container.querySelector('.select2-selection');
          if (selection) {
            selection.click();
            return true;
          }
        }
        return false;
      },
      { sel: selector, val: valueStr }
    );

    if (s2Result) {
      await page.waitForTimeout(400);
      const searchInput = await page.$('.select2-search__field');
      if (searchInput) {
        await searchInput.fill(valueStr);
        await page.waitForTimeout(400);
        const option = await page.$('.select2-results__option--highlighted, .select2-results__option');
        if (option) {
          await option.click();
          return;
        }
      }
    }
  } catch (_) {}

  // 4. Quaternary Fallback: Force Playwright selectOption by label or value
  try {
    await page.selectOption(selector, { label: valueStr }, { timeout: 3000 });
  } catch (_) {
    await page.selectOption(selector, { value: valueStr }, { timeout: 3000 }).catch(() => {});
  }
}

export class PlanExecutor {
  constructor(browserManager = defaultBrowserManager, verifiedEngine = null) {
    this.browserManager = browserManager;
    this.verifiedEngine = verifiedEngine || new VerifiedExecutionEngine({ browserManager });
  }

  /**
   * Executes an ordered execution plan inside Playwright using the verified execution engine.
   */
  async execute(params) {
    return this.verifiedEngine.execute(params);
  }
}

export const defaultPlanExecutor = new PlanExecutor();
export default defaultPlanExecutor;
