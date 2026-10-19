/**
 * DOM Collector — In-Browser DOM Evaluation Script
 * Applier 2.0 — Phase 4: Live Browser Observation Engine
 *
 * Runs inside the browser page context via page.evaluate().
 * High-speed synchronous evaluation with zero IPC roundtrips for element attributes.
 * Gathers interactive elements, forms, accessibility data, and computed visibility.
 */

/**
 * Evaluates the current frame's DOM and returns raw, unnormalized observation primitives.
 * @param {object} options
 * @param {string} options.depth 'interactive' | 'forms_only' | 'full'
 * @param {number} options.maxElements
 * @param {number} options.maxTextLength
 * @param {Array<string>|string} options.framePath
 */
export function collectFrameDom(options = {}) {
  const depth = options.depth || 'interactive';
  const maxElements = options.maxElements || 500;
  const maxTextLength = options.maxTextLength || 1000;
  const framePath = options.framePath || 'root';

  // 1. Helper: True computed visibility
  function isVisible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.type === 'hidden') return false;
    if (el.hasAttribute('hidden')) return false;

    // Check element and all ancestors for visibility styles
    let cur = el;
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
      if (cur.hasAttribute && cur.hasAttribute('hidden')) return false;
      const s = window.getComputedStyle(cur);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') {
        return false;
      }
      cur = cur.parentElement;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && el.tagName !== 'BODY') {
      return false;
    }

    return true;
  }

  // 2. Helper: Accessible label resolution
  function resolveLabel(el) {
    if (!el) return '';

    // A. Native HTML labels collection
    if (el.labels && el.labels.length > 0) {
      const labelTexts = Array.from(el.labels)
        .map((l) => (l.innerText || l.textContent || '').trim())
        .filter(Boolean)
        .join(' ');
      if (labelTexts) return labelTexts;
    }

    // B. Explicit label[for="id"]
    if (el.id) {
      try {
        const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelFor) {
          const t = (labelFor.innerText || labelFor.textContent || '').trim();
          if (t) return t;
        }
      } catch (_) {}
    }

    // C. Wrapping parent <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      try {
        const clone = parentLabel.cloneNode(true);
        clone.querySelectorAll('input, select, textarea, button').forEach((c) => c.remove());
        const t = (clone.textContent || '').trim();
        if (t) return t;
      } catch (_) {}
    }

    // D. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // E. aria-labelledby
    const ariaLabelledby = el.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      const parts = ariaLabelledby
        .split(/\s+/)
        .map((id) => {
          const target = document.getElementById(id);
          return target ? (target.innerText || target.textContent || '').trim() : '';
        })
        .filter(Boolean);
      const combined = parts.join(' ').trim();
      if (combined) return combined;
    }

    // F. placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) return placeholder.trim();

    // G. Inner visible text for buttons / links / tabs
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (tag === 'button' || tag === 'a' || role === 'button' || role === 'tab' || role === 'link') {
      const t = (el.innerText || el.textContent || '').trim();
      if (t) return t;
    }

    // H. Preceding sibling label or text
    let prev = el.previousElementSibling;
    while (prev) {
      const prevTag = prev.tagName.toLowerCase();
      if (prevTag === 'label' || prev.getAttribute('role') === 'label' || prev.classList.contains('label')) {
        const t = (prev.innerText || prev.textContent || '').trim();
        if (t) return t;
      }
      prev = prev.previousElementSibling;
    }

    return '';
  }

  // 3. Helper: Accessible role derivation
  function resolveRole(el) {
    const explicitRole = el.getAttribute('role');
    if (explicitRole) return explicitRole.toLowerCase().trim();

    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'file') return 'file';
      if (type === 'search') return 'searchbox';
      return 'textbox';
    }
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'form') return 'form';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    return tag;
  }

  // 4. Helper: Extract select and custom dropdown options
  function resolveOptions(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();

    // Native <select>
    if (tag === 'select') {
      return Array.from(el.options || []).map((opt) => ({
        text: (opt.text || opt.textContent || '').trim(),
        value: opt.value ?? '',
        selected: Boolean(opt.selected)
      }));
    }

    // ARIA Combobox / Listbox / Custom Dropdown
    if (role === 'combobox' || role === 'listbox' || el.classList.contains('custom-select')) {
      let optionNodes = Array.from(el.querySelectorAll('[role="option"], .option, .dropdown-item, li'));
      if (optionNodes.length === 0) {
        const controlsId = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
        if (controlsId) {
          const popup = document.getElementById(controlsId);
          if (popup) {
            optionNodes = Array.from(popup.querySelectorAll('[role="option"], .option, .dropdown-item, li'));
          }
        }
      }

      if (optionNodes.length > 0) {
        return optionNodes.map((opt) => {
          const isSelected =
            opt.getAttribute('aria-selected') === 'true' ||
            opt.classList.contains('selected') ||
            opt.classList.contains('active');
          const value =
            opt.getAttribute('data-value') ||
            opt.getAttribute('value') ||
            (opt.textContent || '').trim();
          return {
            text: (opt.innerText || opt.textContent || '').trim(),
            value: String(value),
            selected: Boolean(isSelected)
          };
        });
      }
    }

    return [];
  }

  // 5. Select elements based on requested depth
  const interactiveSelector = [
    'input',
    'select',
    'textarea',
    'button',
    'a[href]',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="combobox"]',
    '[role="radio"]',
    '[role="textbox"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="option"]',
    '[role="switch"]',
    '[role="searchbox"]',
    '[role="listbox"]',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
    '[data-testid]'
  ].join(', ');

  const formsOnlySelector = [
    'form',
    'input',
    'select',
    'textarea',
    'button',
    'fieldset',
    'label',
    '[role="form"]'
  ].join(', ');

  const fullSelector = [
    interactiveSelector,
    'h1, h2, h3, h4, h5, h6',
    '[role="alert"]',
    '.error',
    '.invalid-feedback',
    '.error-message',
    '.validation-message',
    'label'
  ].join(', ');

  let selector = interactiveSelector;
  if (depth === 'forms_only') selector = formsOnlySelector;
  if (depth === 'full') selector = fullSelector;

  // Helper: Deep DOM and Shadow Root query traversal
  function queryAllDeep(rootNode, sel, maxCount) {
    const result = [];
    function walk(node) {
      if (!node || result.length >= maxCount) return;
      if (node.querySelectorAll) {
        try {
          const matched = node.querySelectorAll(sel);
          for (let i = 0; i < matched.length && result.length < maxCount; i++) {
            result.push(matched[i]);
          }
        } catch (_) {}
      }
      const elements = node.querySelectorAll ? node.querySelectorAll('*') : [];
      for (let i = 0; i < elements.length && result.length < maxCount; i++) {
        if (elements[i].shadowRoot) {
          walk(elements[i].shadowRoot);
        }
      }
    }
    walk(rootNode);
    return result;
  }

  const rawElements = queryAllDeep(document, selector, maxElements);

  // 6. Inspect and extract elements
  const collectedElements = [];
  const elementDomMap = new Map();

  for (let idx = 0; idx < rawElements.length; idx++) {
    const el = rawElements[idx];
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : '')).toLowerCase();
    const role = resolveRole(el);
    const label = resolveLabel(el);
    const visible = isVisible(el);
    const disabled = Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true');
    const required = Boolean(el.required || el.getAttribute('aria-required') === 'true');

    // Extract value
    let value = '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (type === 'checkbox' || type === 'radio') {
        value = el.checked ? 'true' : 'false';
      } else {
        value = el.value || '';
      }
    }

    // Text content (trimmed, bounded)
    let text = '';
    if (tag !== 'input' && tag !== 'textarea') {
      text = (el.innerText || el.textContent || '').trim().slice(0, maxTextLength);
    }

    // Filter relevant attributes only (no classList/style bloat)
    const attributes = {};
    const relevantAttrs = [
      'href',
      'accept',
      'pattern',
      'min',
      'max',
      'step',
      'maxlength',
      'minlength',
      'autocomplete',
      'data-testid'
    ];

    if (el.attributes) {
      for (let aIdx = 0; aIdx < el.attributes.length; aIdx++) {
        const attr = el.attributes[aIdx];
        if (attr.name.startsWith('aria-') || relevantAttrs.includes(attr.name)) {
          attributes[attr.name] = attr.value;
        }
      }
    }

    // Native validation message & state
    if (typeof el.checkValidity === 'function') {
      try {
        const isValid = el.checkValidity();
        if (!isValid) {
          attributes['isInvalid'] = true;
          if (el.validationMessage) {
            attributes['validationMessage'] = el.validationMessage;
          }
        }
      } catch (_) {}
    }

    // Resolve aria-describedby validation text
    const describedBy = el.getAttribute('aria-describedby');
    if (describedBy) {
      try {
        const descEl = document.getElementById(describedBy);
        if (descEl) {
          const descText = (descEl.innerText || descEl.textContent || '').trim();
          if (descText) attributes['describedByText'] = descText;
        }
      } catch (_) {}
    }

    const optionsList = resolveOptions(el);

    const item = {
      localIndex: idx,
      tag,
      role,
      type,
      label,
      text,
      placeholder: el.getAttribute('placeholder') || '',
      name: el.getAttribute('name') || '',
      id: el.id || '',
      value,
      required,
      disabled,
      visible,
      options: optionsList,
      attributes,
      framePath
    };

    collectedElements.push(item);
    elementDomMap.set(el, item);
  }

  // 7. Collect Forms
  const formNodes = queryAllDeep(document, 'form, [role="form"]', 50);
  const collectedForms = formNodes.map((formEl, formIdx) => {
    const formId = `form_${formIdx + 1}`;
    const id = formEl.id || '';
    const name = formEl.getAttribute('name') || '';
    const action = formEl.getAttribute('action') || '';
    const method = (formEl.getAttribute('method') || 'GET').toUpperCase();

    // Find elements inside or explicitly linked to this form
    const childInputs = queryAllDeep(
      formEl,
      'input, select, textarea, button, [role="button"]',
      100
    );

    const formElementLocalIndexes = [];
    let submitButtonLocalIndex = null;

    for (const child of childInputs) {
      const match = elementDomMap.get(child);
      if (match) {
        formElementLocalIndexes.push(match.localIndex);
        if (
          !submitButtonLocalIndex &&
          (match.type === 'submit' ||
            (match.role === 'button' && /submit|apply|save|continue|login/i.test(match.text || match.label)))
        ) {
          submitButtonLocalIndex = match.localIndex;
        }
      }
    }

    return {
      formId,
      id,
      name,
      action,
      method,
      elementLocalIndexes: formElementLocalIndexes,
      submitButtonLocalIndex
    };
  });

  // 8. Extract Visible Text Summary
  const bodyText = (document.body ? document.body.innerText || '' : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);

  return {
    elements: collectedElements,
    forms: collectedForms,
    visibleTextSummary: bodyText,
    url: window.location.href,
    title: document.title,
    readyState: document.readyState,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };
}

export default collectFrameDom;
