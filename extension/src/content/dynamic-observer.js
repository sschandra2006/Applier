/**
 * Dynamic Form Observer Module
 * Watches for dynamic DOM mutations in single-page applications (SPAs)
 * and multi-step application wizards (e.g. Workday, Greenhouse multi-step).
 */

export class DynamicObserver {
  constructor(onMutationCallback) {
    this.callback = onMutationCallback;
    this.observer = null;
    this.debounceTimer = null;
    this.isObserving = false;
  }

  start() {
    if (this.isObserving) return;

    this.observer = new MutationObserver((mutations) => {
      let hasSignificantChanges = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector && node.querySelector('input, select, textarea, form')) {
                hasSignificantChanges = true;
                break;
              }
            }
          }
        }
        if (hasSignificantChanges) break;
      }

      if (hasSignificantChanges) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          if (this.callback) this.callback();
        }, 500);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    this.isObserving = true;
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    clearTimeout(this.debounceTimer);
    this.isObserving = false;
  }
}
