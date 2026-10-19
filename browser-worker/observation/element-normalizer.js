/**
 * Element Normalizer — Semantic Element Normalization & Identity Controller
 * Applier 2.0 — Phase 4: Live Browser Observation Engine
 *
 * Normalizes collected raw DOM elements into canonical contract objects.
 * Assigns deterministic elementIds that do not rely on fragile CSS selectors.
 */

export class ElementNormalizer {
  /**
   * Normalizes a collection of frame elements into canonical BrowserObservation elements
   * @param {Array<object>} rawElements Array of raw collected element objects
   * @param {object} options
   * @returns {Array<object>} Normalized elements conforming to schema
   */
  normalizeElements(rawElements = [], options = {}) {
    const idPrefix = options.idPrefix || 'elem_';
    let counter = 1;

    return rawElements.map((raw) => {
      const elementId = `${idPrefix}${counter++}`;

      // Normalize tag and role to lowercase
      const tag = String(raw.tag || 'unknown').toLowerCase().trim();
      const role = String(raw.role || 'generic').toLowerCase().trim();
      const type = String(raw.type || '').toLowerCase().trim();

      // Clean text and label
      const label = String(raw.label || '').trim();
      const text = String(raw.text || '').trim();
      const placeholder = String(raw.placeholder || '').trim();
      const name = String(raw.name || '').trim();
      const id = String(raw.id || '').trim();
      const value = String(raw.value ?? '');

      // Normalize boolean flags
      const required = Boolean(raw.required);
      const disabled = Boolean(raw.disabled);
      const visible = Boolean(raw.visible);

      // Normalize options for select/combobox
      const optionsList = Array.isArray(raw.options)
        ? raw.options.map((opt) => ({
            text: String(opt.text || '').trim(),
            value: String(opt.value ?? ''),
            selected: Boolean(opt.selected)
          }))
        : [];

      // Clean attributes (only relevant, strictly serializable)
      const attributes = {};
      if (raw.attributes && typeof raw.attributes === 'object') {
        for (const [k, v] of Object.entries(raw.attributes)) {
          if (v !== null && v !== undefined && v !== '') {
            attributes[k] = v;
          }
        }
      }

      // Frame path coordinate
      const framePath = raw.framePath || 'root';

      return {
        elementId,
        tag,
        role,
        type,
        label,
        text,
        placeholder,
        name,
        id,
        value,
        required,
        disabled,
        visible,
        options: optionsList,
        attributes,
        framePath,
        _localIndex: raw.localIndex // temporary reference for form/action mapper
      };
    });
  }
}

export const defaultElementNormalizer = new ElementNormalizer();
export default defaultElementNormalizer;
