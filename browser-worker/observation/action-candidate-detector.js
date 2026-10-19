/**
 * Action Candidate Detector — Generates Action Candidates from Elements
 * Applier 2.0 — Phase 4: Live Browser Observation Engine
 *
 * Detects actionable candidate operations (CLICK, FILL, SELECT, UPLOAD)
 * for each interactive element in the observation snapshot.
 */

export class ActionCandidateDetector {
  /**
   * Generates candidate actions for a collection of normalized elements
   * @param {Array<object>} elements Normalized BrowserObservation elements
   * @returns {Array<object>} Action candidates conforming to schema
   */
  detectCandidates(elements = []) {
    const candidates = [];
    let actionCounter = 1;

    for (const el of elements) {
      // Skip invisible or disabled elements for primary candidates
      if (!el.visible || el.disabled) continue;

      const tag = el.tag;
      const role = el.role;
      const type = el.type;

      let actionType = null;

      // 1. UPLOAD
      if (tag === 'input' && (type === 'file' || role === 'file')) {
        actionType = 'UPLOAD';
      }
      // 2. SELECT
      else if (tag === 'select' || role === 'combobox' || role === 'listbox' || (el.options && el.options.length > 0)) {
        actionType = 'SELECT';
      }
      // 3. CLICK
      else if (
        tag === 'button' ||
        tag === 'a' ||
        type === 'submit' ||
        type === 'button' ||
        type === 'reset' ||
        type === 'checkbox' ||
        type === 'radio' ||
        role === 'button' ||
        role === 'link' ||
        role === 'checkbox' ||
        role === 'radio' ||
        role === 'tab' ||
        role === 'switch' ||
        role === 'menuitem'
      ) {
        actionType = 'CLICK';
      }
      // 4. FILL
      else if (
        tag === 'textarea' ||
        role === 'textbox' ||
        role === 'searchbox' ||
        (tag === 'input' && !['hidden', 'submit', 'button', 'reset'].includes(type))
      ) {
        actionType = 'FILL';
      }

      if (actionType) {
        candidates.push({
          actionId: `act_${actionCounter++}`,
          type: actionType,
          elementId: el.elementId,
          label: el.label || el.text || el.name || el.placeholder || el.id || el.tag,
          framePath: el.framePath || 'root'
        });
      }
    }

    return candidates;
  }
}

export const defaultActionCandidateDetector = new ActionCandidateDetector();
export default defaultActionCandidateDetector;
