/**
 * Form Extractor — Form Grouping & Submission Mapping Controller
 * Applier 2.0 — Phase 4: Live Browser Observation Engine
 *
 * Maps form containers to their constituent normalized elementIds and
 * identifies primary submit buttons.
 */

export class FormExtractor {
  /**
   * Reconciles raw collected forms with globally normalized elements
   * @param {Array<object>} rawForms
   * @param {Array<object>} normalizedElements
   * @returns {Array<object>} Structured forms conforming to schema
   */
  extractForms(rawForms = [], normalizedElements = []) {
    // Map localIndex -> normalized elementId
    const localIndexToElementId = new Map();
    for (const el of normalizedElements) {
      if (el._localIndex !== undefined) {
        localIndexToElementId.set(el._localIndex, el.elementId);
      }
    }

    return rawForms.map((rawForm, idx) => {
      const formId = rawForm.formId || `form_${idx + 1}`;
      const id = String(rawForm.id || '').trim();
      const name = String(rawForm.name || '').trim();
      const action = String(rawForm.action || '').trim();
      const method = String(rawForm.method || 'GET').toUpperCase();

      // Resolve element IDs
      const elementIds = (rawForm.elementLocalIndexes || [])
        .map((localIdx) => localIndexToElementId.get(localIdx))
        .filter(Boolean);

      // Resolve submit button ID
      let submitButtonId = null;
      if (rawForm.submitButtonLocalIndex !== null && rawForm.submitButtonLocalIndex !== undefined) {
        submitButtonId = localIndexToElementId.get(rawForm.submitButtonLocalIndex) || null;
      }

      // Fallback: look for submit button among form's elements if not explicitly assigned
      if (!submitButtonId) {
        const submitElement = normalizedElements.find(
          (el) =>
            elementIds.includes(el.elementId) &&
            (el.type === 'submit' || (el.role === 'button' && /submit|apply|save|continue/i.test(el.text || el.label)))
        );
        if (submitElement) {
          submitButtonId = submitElement.elementId;
        }
      }

      return {
        formId,
        id,
        name,
        action,
        method,
        elementIds,
        submitButtonId: submitButtonId || ''
      };
    });
  }
}

export const defaultFormExtractor = new FormExtractor();
export default defaultFormExtractor;
