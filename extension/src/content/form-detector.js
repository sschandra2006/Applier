/**
 * Form Detector Module — Production Grade
 * Comprehensive application form scanning across standard ATS and custom portals.
 *
 * Detects:
 * - Text, Email, Phone, Number, URL, Textarea inputs
 * - Native <select> dropdowns and options
 * - Checkboxes
 * - Radio button groups (with option labels and values)
 * - Multi-step wizard containers, step indicators, and navigation buttons
 * - CAPTCHA / OTP / 2FA security checkpoints (flagged for safety, never bypassed)
 * - Rich metadata: label, accessible name, placeholder, inputType, name, associatedLabel,
 *   required status, available options, explanatory text, and robust selectors.
 */

export class FormDetector {
  /**
   * Scans the active DOM and returns structured metadata for all application fields.
   */
  static detect(rootElement = null) {
    const root = rootElement || document.body;
    const fields = [];
    const fileInputs = [];
    const radioMap = new Map(); // Group radio buttons by name

    // 1. Detect Multi-Step Wizard Progress
    const multiStep = FormDetector._detectMultiStep(root);

    // 2. Detect Security Checkpoints (CAPTCHA / OTP)
    const securityCheckpoints = FormDetector._detectSecurityCheckpoints(root);

    // 3. Scan all form elements
    const elements = root.querySelectorAll('input, select, textarea, [role="combobox"], [role="radiogroup"]');

    elements.forEach((el, index) => {
      // Ignore hidden, submit, reset, or non-data buttons
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'reset') {
        return;
      }

      // Ignore elements inside script/style/noscript or hidden containers
      if (FormDetector._isElementHidden(el)) {
        return;
      }

      // Special handling for Radio buttons: group by name
      if (el.type === 'radio' && el.name) {
        const groupName = el.name;
        if (!radioMap.has(groupName)) {
          radioMap.set(groupName, []);
        }
        radioMap.get(groupName).push(el);
        return;
      }

      const fieldMeta = FormDetector._inspectElement(el, index);
      if (fieldMeta) {
        fields.push(fieldMeta);
        if (fieldMeta.type === 'file') {
          fileInputs.push(fieldMeta);
        }
      }
    });

    // 4. Process Radio Groups into unified field representations
    radioMap.forEach((radios, groupName) => {
      const radioGroupMeta = FormDetector._inspectRadioGroup(radios, groupName);
      if (radioGroupMeta) {
        fields.push(radioGroupMeta);
      }
    });

    return {
      fieldCount: fields.length,
      fields,
      fileInputs,
      multiStep,
      securityCheckpoints
    };
  }

  /**
   * Extracts detailed metadata for a single input, select, or textarea element.
   */
  static _inspectElement(el, index) {
    const tagName = el.tagName.toLowerCase();
    const type = tagName === 'input' ? (el.type || 'text').toLowerCase() : tagName;
    const id = el.id || '';
    const name = el.name || '';
    const fieldId = id || name || `applier_field_${index}_${type}`;

    // 1. Associated Visible Label
    const associatedLabel = FormDetector._findAssociatedLabelText(el);

    // 2. Accessible Name (aria-label or aria-labelledby)
    const accessibleName = FormDetector._findAccessibleName(el);

    // 3. Primary Label (hierarchical priority: associated label -> accessible name -> placeholder -> name)
    const label = associatedLabel || accessibleName || el.placeholder || name || id;

    // 4. Required Status
    const isRequired = FormDetector._checkRequired(el, label);

    // 5. Explanatory / Hint Text
    const explanatoryText = FormDetector._findExplanatoryText(el);

    // 6. Robust Selector
    const selector = FormDetector._buildSelector(el);

    // 7. Dropdown Options
    const options = FormDetector._extractOptions(el);

    // 8. Current Value & User-Edited State
    const currentValue = el.type === 'checkbox' ? el.checked : (el.value || '');
    const isDirty = FormDetector._checkDirtyState(el);

    return {
      id: fieldId,
      name,
      type,
      selector,
      label: FormDetector._cleanLabel(label),
      associatedLabel: FormDetector._cleanLabel(associatedLabel),
      accessibleName,
      placeholder: el.placeholder || '',
      required: isRequired,
      explanatoryText,
      options,
      currentValue,
      isDirty,
      disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      readOnly: !!el.readOnly,
      maxLength: el.maxLength > 0 ? el.maxLength : null,
      pattern: el.pattern || null
    };
  }

  /**
   * Combines individual radio buttons sharing a name attribute into a single structured field.
   */
  static _inspectRadioGroup(radios, groupName) {
    if (!radios || radios.length === 0) return null;

    const firstRadio = radios[0];
    const groupContainer = firstRadio.closest('fieldset, .form-group, .field, [role="radiogroup"], div');
    
    // Group label from fieldset <legend> or container title
    let groupLabel = '';
    if (groupContainer) {
      const legend = groupContainer.querySelector('legend, .field-label, label.group-label, span.title, h3, h4');
      if (legend) {
        groupLabel = legend.innerText.trim();
      }
    }
    if (!groupLabel) {
      groupLabel = FormDetector._findAssociatedLabelText(firstRadio) || groupName;
    }

    const isRequired = radios.some(r => r.required || r.getAttribute('aria-required') === 'true') ||
                       groupLabel.includes('*');

    // Extract individual radio options
    const options = radios.map(radio => {
      const radioLabel = FormDetector._findAssociatedLabelText(radio) || radio.value;
      return {
        value: radio.value,
        text: FormDetector._cleanLabel(radioLabel),
        checked: radio.checked,
        selector: FormDetector._buildSelector(radio)
      };
    });

    const checkedOption = options.find(o => o.checked);
    const explanatoryText = FormDetector._findExplanatoryText(groupContainer || firstRadio);

    return {
      id: `radio_group_${groupName}`,
      name: groupName,
      type: 'radio-group',
      selector: `input[type="radio"][name="${CSS.escape(groupName)}"]`,
      label: FormDetector._cleanLabel(groupLabel),
      associatedLabel: FormDetector._cleanLabel(groupLabel),
      accessibleName: firstRadio.getAttribute('aria-label') || '',
      placeholder: '',
      required: isRequired,
      explanatoryText,
      options,
      currentValue: checkedOption ? checkedOption.value : null,
      isDirty: !!checkedOption,
      disabled: radios.every(r => r.disabled),
      readOnly: false
    };
  }

  /**
   * Resolves associated label text via explicit for=id, enclosing <label>, or preceding container headers.
   */
  static _findAssociatedLabelText(el) {
    // 1. Explicit <label for="id">
    if (el.id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (explicitLabel && explicitLabel.innerText.trim()) {
        return explicitLabel.innerText.trim();
      }
    }

    // 2. Enclosing parent <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      // Clone label and remove input text to isolate label prompt
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea, button').forEach(c => c.remove());
      const labelText = clone.innerText.trim();
      if (labelText) return labelText;
    }

    // 3. Preceding sibling label or container header
    const container = el.closest('.field, .form-group, .form-item, [data-automation-id*="form"], div');
    if (container) {
      const headerLabel = container.querySelector('label, .label, legend, span.title, .form-label');
      if (headerLabel && headerLabel !== el && headerLabel.innerText.trim()) {
        return headerLabel.innerText.trim();
      }
    }

    return '';
  }

  /**
   * Resolves accessible name via aria-label or referenced aria-labelledby elements.
   */
  static _findAccessibleName(el) {
    if (el.getAttribute('aria-label')) {
      return el.getAttribute('aria-label').trim();
    }

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const texts = labelledBy.split(/\s+/).map(id => {
        const refEl = document.getElementById(id);
        return refEl ? refEl.innerText.trim() : '';
      }).filter(Boolean);

      if (texts.length > 0) {
        return texts.join(' ');
      }
    }

    return '';
  }

  /**
   * Resolves help, hint, or description text via aria-describedby or class heuristics.
   */
  static _findExplanatoryText(el) {
    if (!el) return '';

    // 1. aria-describedby reference
    const describedBy = el.getAttribute ? el.getAttribute('aria-describedby') : null;
    if (describedBy) {
      const texts = describedBy.split(/\s+/).map(id => {
        const refEl = document.getElementById(id);
        return refEl ? refEl.innerText.trim() : '';
      }).filter(Boolean);

      if (texts.length > 0) return texts.join(' ');
    }

    // 2. Container hint / help text
    const container = el.closest ? el.closest('.field, .form-group, .form-item, div') : null;
    if (container) {
      const helpEl = container.querySelector('.help-text, .help-block, .form-text, .description, .hint, .field-hint, small');
      if (helpEl && helpEl.innerText.trim()) {
        return helpEl.innerText.trim();
      }
    }

    return '';
  }

  /**
   * Checks multiple signals for whether a field is mandatory.
   */
  static _checkRequired(el, labelText) {
    if (el.required) return true;
    if (el.getAttribute('aria-required') === 'true') return true;
    if (el.classList.contains('required') || el.classList.contains('is-required')) return true;

    if (labelText && (labelText.includes('*') || /\b(required)\b/i.test(labelText))) {
      return true;
    }

    const container = el.closest ? el.closest('.field, .form-group, .form-item, div') : null;
    if (container) {
      if (container.classList.contains('required') || container.getAttribute('data-required') === 'true') {
        return true;
      }
      const reqMarker = container.querySelector('.required-marker, .asterisk, [aria-hidden="true"]');
      if (reqMarker && reqMarker.innerText.includes('*')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts available options for <select> elements or custom comboboxes.
   */
  static _extractOptions(el) {
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'select') {
      return Array.from(el.options).map(opt => ({
        value: opt.value,
        text: opt.text.trim(),
        selected: opt.selected,
        disabled: opt.disabled
      }));
    }

    // Custom combobox / listbox options
    if (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox') {
      const optionElements = el.querySelectorAll('[role="option"]');
      if (optionElements.length > 0) {
        return Array.from(optionElements).map(opt => ({
          value: opt.getAttribute('data-value') || opt.innerText.trim(),
          text: opt.innerText.trim(),
          selected: opt.getAttribute('aria-selected') === 'true'
        }));
      }
    }

    return [];
  }

  /**
   * Determines if the user has already entered custom information into this field.
   */
  static _checkDirtyState(el) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      return el.checked !== el.defaultChecked;
    }
    if (el.tagName.toLowerCase() === 'select') {
      return el.selectedIndex > 0 && el.value !== '';
    }
    return Boolean(el.value && el.value.trim().length > 0 && el.value !== el.defaultValue);
  }

  /**
   * Constructs a robust, CSS-escaped selector for the element.
   */
  static _buildSelector(el) {
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }
    if (el.name) {
      const tag = el.tagName.toLowerCase();
      if (el.type && tag === 'input') {
        return `input[type="${el.type}"][name="${CSS.escape(el.name)}"]`;
      }
      return `${tag}[name="${CSS.escape(el.name)}"]`;
    }
    if (el.getAttribute('data-automation-id')) {
      return `[data-automation-id="${CSS.escape(el.getAttribute('data-automation-id'))}"]`;
    }
    if (el.getAttribute('data-testid')) {
      return `[data-testid="${CSS.escape(el.getAttribute('data-testid'))}"]`;
    }

    // Hierarchical path fallback
    const parent = el.parentElement;
    if (parent && parent.id) {
      return `#${CSS.escape(parent.id)} > ${el.tagName.toLowerCase()}`;
    }

    return el.tagName.toLowerCase();
  }

  /**
   * Cleans trailing asterisks and excess whitespace from labels.
   */
  static _cleanLabel(text) {
    if (!text) return '';
    return text.replace(/[*:]+$/, '').trim();
  }

  /**
   * Determines whether an element is visually hidden or detached.
   */
  static _isElementHidden(el) {
    if (el.offsetParent === null && el.type !== 'file') {
      // File inputs are often hidden by custom UI upload wrappers
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Detects if the current form is part of a multi-step application wizard.
   */
  static _detectMultiStep(root) {
    const wizardMarkers = root.querySelectorAll(
      '.wizard-steps, .step-indicator, .progress-bar, [role="progressbar"], ' +
      '[data-automation-id*="step"], .application-step, ol.steps, ul.steps'
    );

    const stepTextMatch = (root.innerText || '').match(/\bstep\s*(\d+)\s*(?:of|\/)\s*(\d+)\b/i);

    const candidateButtons = Array.from(root.querySelectorAll(
      'button[name*="next" i], button[id*="next" i], [data-automation-id*="next" i], .btn-next, .next-button, button, input[type="button"]'
    ));
    const nextBtn = candidateButtons.find(b => /\b(next|continue)\b/i.test(b.innerText || b.value || '')) || null;

    const isMultiStep = wizardMarkers.length > 0 || Boolean(stepTextMatch);

    return {
      isMultiStep,
      currentStep: stepTextMatch ? parseInt(stepTextMatch[1], 10) : 1,
      totalSteps: stepTextMatch ? parseInt(stepTextMatch[2], 10) : (wizardMarkers.length || 1),
      nextButtonSelector: nextBtn ? FormDetector._buildSelector(nextBtn) : null
    };
  }

  /**
   * Scans for CAPTCHA, Turnstile, or OTP security checkpoints.
   * Safety invariant: These are NEVER bypassed by automation.
   */
  static _detectSecurityCheckpoints(root) {
    const checkpoints = [];

    // 1. Google reCAPTCHA
    if (root.querySelector('.g-recaptcha, iframe[src*="recaptcha"], [data-sitekey]')) {
      checkpoints.push({ type: 'RECAPTCHA', provider: 'Google reCAPTCHA' });
    }

    // 2. Cloudflare Turnstile
    if (root.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]')) {
      checkpoints.push({ type: 'TURNSTILE', provider: 'Cloudflare Turnstile' });
    }

    // 3. hCaptcha
    if (root.querySelector('.h-captcha, iframe[src*="hcaptcha"]')) {
      checkpoints.push({ type: 'HCAPTCHA', provider: 'hCaptcha' });
    }

    // 4. Arkose Labs / FunCaptcha
    if (root.querySelector('iframe[src*="arkoselabs"], #arkose')) {
      checkpoints.push({ type: 'ARKOSE', provider: 'Arkose Labs' });
    }

    // 5. OTP / SMS / 2FA Code input
    const otpInput = root.querySelector(
      'input[name*="otp" i], input[name*="2fa" i], input[name*="verification_code" i], ' +
      'input[autocomplete="one-time-code"]'
    );
    if (otpInput) {
      checkpoints.push({ type: 'OTP', provider: 'One-Time Verification Code' });
    }

    return {
      hasCheckpoint: checkpoints.length > 0,
      checkpoints,
      requiresManualResolution: checkpoints.length > 0
    };
  }
}
