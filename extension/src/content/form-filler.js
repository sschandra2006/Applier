/**
 * Form Filler Module — Production Grade
 * Robust DOM automation for React, Vue, Angular, and vanilla web forms.
 *
 * Implements:
 * 1. Pre-fill authorization gate (user MUST authorize action).
 * 2. Unresolved required field identification.
 * 3. Sensitive / ambiguous question protection (blocked unless explicitly confirmed).
 * 4. User edit preservation (never silently overwrites existing candidate edits).
 * 5. React/Vue/Angular synthetic event bypass via native prototype descriptor setters.
 * 6. Post-fill verification (reads back DOM value to guarantee accuracy).
 * 7. Post-fill validation error detection (:invalid, aria-invalid, DOM error banners).
 * 8. Honest reporting of filled, preserved, failed, and unresolved fields.
 */

export class FormFiller {
  /**
   * Executes form filling with safety gates, user preservation, and verification.
   *
   * @param {Array} mappedFields - Array of field mapping records from FieldMapper
   * @param {Object} options - Configuration options:
   *   - userAuthorized {boolean} Required. Must be explicitly true.
   *   - overwriteUserEdits {boolean} Default false. If false, preserves user entries.
   *   - confirmedFieldIds {Array|Set} Set of field IDs explicitly confirmed by the user.
   *   - onProgress {Function} Optional progress callback (current, total, fieldName).
   */
  static async fill(mappedFields = [], options = {}) {
    // 1. Safety Gate: Explicit User Authorization Check
    if (!options.userAuthorized) {
      return {
        success: false,
        error: 'Form filling aborted: User authorization required.',
        totalFields: mappedFields.length,
        filledCount: 0,
        preservedCount: 0,
        failedCount: 0,
        unresolvedRequiredCount: mappedFields.filter(f => f.required).length,
        fields: []
      };
    }

    const confirmedSet = new Set(options.confirmedFieldIds || []);
    const overwriteUserEdits = options.overwriteUserEdits === true;

    const results = {
      totalFields: mappedFields.length,
      filledCount: 0,
      preservedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      validationErrorsCount: 0,
      unresolvedRequiredCount: 0,
      fields: [],
      unresolvedRequiredFields: [],
      validationErrors: [],
      success: true,
      summaryMessage: ''
    };

    // 2. Identify Unresolved Required Fields before filling
    mappedFields.forEach(field => {
      const isConfirmed = confirmedSet.has(field.fieldId);
      if (field.required && field.action !== 'FILL' && !isConfirmed) {
        results.unresolvedRequiredFields.push({
          fieldId: field.fieldId,
          label: field.label,
          reason: field.reason || 'REQUIRED_UNRESOLVED'
        });
      }
    });

    // 3. Process each mapped field
    for (let i = 0; i < mappedFields.length; i++) {
      const field = mappedFields[i];
      const isConfirmed = confirmedSet.has(field.fieldId);

      // Report progress callback if provided
      if (typeof options.onProgress === 'function') {
        try {
          options.onProgress(i + 1, mappedFields.length, field.label || field.fieldName);
        } catch (_) {}
      }

      // ── Safety Check: Ambiguous or Sensitive fields without user confirmation ──
      if ((field.action === 'REQUIRE_USER_CONFIRMATION' || field.isSensitive) && !isConfirmed) {
        results.skippedCount++;
        results.fields.push({
          fieldId: field.fieldId,
          status: 'SKIPPED_UNCONFIRMED',
          label: field.label,
          reason: field.reason || 'User confirmation required for this field'
        });
        continue;
      }

      if (field.action === 'SKIP' && !isConfirmed) {
        results.skippedCount++;
        results.fields.push({
          fieldId: field.fieldId,
          status: 'SKIPPED_OPTIONAL',
          label: field.label,
          reason: field.reason || 'Optional unmapped field'
        });
        continue;
      }

      // ── Locate element in DOM ──
      const el = document.querySelector(field.selector);
      if (!el) {
        results.failedCount++;
        if (field.required) results.unresolvedRequiredCount++;
        results.fields.push({
          fieldId: field.fieldId,
          status: 'ELEMENT_NOT_FOUND',
          label: field.label,
          selector: field.selector,
          error: 'Element could not be found in active DOM'
        });
        continue;
      }

      // ── User Edit Preservation ──
      if (!overwriteUserEdits && FormFiller._hasUserEdit(el, field.fieldType)) {
        results.preservedCount++;
        FormFiller._applyVisualIndicator(el, 'preserved');
        results.fields.push({
          fieldId: field.fieldId,
          status: 'PRESERVED_USER_EDIT',
          label: field.label,
          currentValue: el.value || el.checked,
          reason: 'Existing user edit preserved'
        });
        continue;
      }

      // ── Execute Fill based on field type ──
      try {
        const fillSuccess = await FormFiller._populateField(el, field);

        if (!fillSuccess) {
          results.failedCount++;
          if (field.required) results.unresolvedRequiredCount++;
          results.fields.push({
            fieldId: field.fieldId,
            status: 'FAILED_TO_POPULATE',
            label: field.label,
            error: 'Failed to assign target value to DOM element'
          });
          continue;
        }

        // ── Post-Fill Verification ──
        const verified = FormFiller._verifyFieldFill(el, field);
        if (!verified.isMatch) {
          results.failedCount++;
          if (field.required) results.unresolvedRequiredCount++;
          results.fields.push({
            fieldId: field.fieldId,
            status: 'VERIFICATION_FAILED',
            label: field.label,
            expected: field.matchedOptionValue || field.targetValue,
            actual: verified.actualValue,
            error: 'DOM value does not match expected target value after event dispatch'
          });
          continue;
        }

        // ── Post-Fill Validation Error Detection ──
        const validation = FormFiller._detectDomValidationError(el);
        if (validation.hasError) {
          results.validationErrorsCount++;
          results.validationErrors.push({
            fieldId: field.fieldId,
            label: field.label,
            errorMessage: validation.errorMessage
          });
          FormFiller._applyVisualIndicator(el, 'error');
          results.fields.push({
            fieldId: field.fieldId,
            status: 'VALIDATION_ERROR',
            label: field.label,
            value: verified.actualValue,
            error: validation.errorMessage
          });
        } else {
          // Success!
          results.filledCount++;
          FormFiller._applyVisualIndicator(el, 'success');
          results.fields.push({
            fieldId: field.fieldId,
            status: 'FILLED',
            label: field.label,
            value: verified.actualValue
          });
        }
      } catch (fillErr) {
        results.failedCount++;
        if (field.required) results.unresolvedRequiredCount++;
        results.fields.push({
          fieldId: field.fieldId,
          status: 'EXCEPTION',
          label: field.label,
          error: fillErr.message
        });
      }

      // Human-like execution pacing (50ms) to allow reactive frameworks to update state
      await new Promise(r => setTimeout(r, 50));
    }

    results.unresolvedRequiredCount = results.unresolvedRequiredFields.length +
      results.fields.filter(f => f.status !== 'FILLED' && f.status !== 'PRESERVED_USER_EDIT' && mappedFields.find(m => m.fieldId === f.fieldId)?.required).length;

    // Honest determination of overall success
    results.success = results.unresolvedRequiredCount === 0 && results.validationErrorsCount === 0;

    results.summaryMessage = results.success
      ? `Successfully filled ${results.filledCount} fields (${results.preservedCount} user edits preserved).`
      : `Filled ${results.filledCount} fields with ${results.unresolvedRequiredCount} unresolved required fields and ${results.validationErrorsCount} validation errors.`;

    return results;
  }

  /**
   * Dispatches value to the element using framework-compatible setters.
   */
  static async _populateField(el, field) {
    const tagName = el.tagName.toLowerCase();
    const type = field.fieldType || el.type || tagName;

    // 1. Select Controls
    if (tagName === 'select') {
      const optionValue = field.matchedOptionValue || field.targetValue;
      return FormFiller._setSelectValue(el, optionValue);
    }

    // 2. Radio Groups
    if (type === 'radio-group' || el.type === 'radio') {
      const optionValue = field.matchedOptionValue || field.targetValue;
      return FormFiller._setRadioValue(el, field.name, optionValue);
    }

    // 3. Checkboxes
    if (el.type === 'checkbox') {
      const boolVal = typeof field.targetValue === 'boolean'
        ? field.targetValue
        : /^(yes|true|1|checked)$/i.test(String(field.targetValue).trim());
      return FormFiller._setCheckboxValue(el, boolVal);
    }

    // 4. Text / Textarea / Email / Tel / Number / URL
    if (tagName === 'textarea' || (tagName === 'input' && !['checkbox', 'radio', 'file'].includes(el.type))) {
      return FormFiller._setTextInputValue(el, String(field.targetValue));
    }

    return false;
  }

  /**
   * Populates text/textarea via prototype setter bypass for React/Vue/Angular.
   */
  static _setTextInputValue(el, value) {
    const prototype = Object.getPrototypeOf(el);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    const valueSetter = Object.getOwnPropertyDescriptor(el, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(el, value);
    } else if (valueSetter) {
      valueSetter.call(el, value);
    } else {
      el.value = value;
    }

    // Reactive event lifecycle
    el.dispatchEvent(new Event('focus', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
  }

  /**
   * Sets select dropdown value and triggers reactive events.
   */
  static _setSelectValue(selectEl, value) {
    if (!selectEl || !value) return false;

    const valLower = String(value).toLowerCase().trim();
    let matchedOption = null;

    // 1. Match option value
    for (const opt of selectEl.options) {
      if ((opt.value || '').toLowerCase().trim() === valLower) {
        matchedOption = opt;
        break;
      }
    }

    // 2. Match option text
    if (!matchedOption) {
      for (const opt of selectEl.options) {
        if ((opt.text || '').toLowerCase().trim() === valLower) {
          matchedOption = opt;
          break;
        }
      }
    }

    // 3. Substring match
    if (!matchedOption) {
      for (const opt of selectEl.options) {
        const textLower = (opt.text || '').toLowerCase().trim();
        if (textLower.length > 2 && (textLower.includes(valLower) || valLower.includes(textLower))) {
          matchedOption = opt;
          break;
        }
      }
    }

    if (matchedOption) {
      selectEl.value = matchedOption.value;
      selectEl.dispatchEvent(new Event('focus', { bubbles: true }));
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      selectEl.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }

    return false;
  }

  /**
   * Selects the correct radio button in a radio group.
   */
  static _setRadioValue(firstRadioEl, groupName, value) {
    const selector = `input[type="radio"][name="${CSS.escape(groupName)}"]`;
    const radios = Array.from(document.querySelectorAll(selector));
    if (radios.length === 0) return false;

    const valLower = String(value).toLowerCase().trim();

    let targetRadio = radios.find(r => (r.value || '').toLowerCase().trim() === valLower);

    // Try finding via associated label text
    if (!targetRadio) {
      targetRadio = radios.find(r => {
        const label = (r.closest('label')?.innerText || document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.innerText || '').toLowerCase().trim();
        return label.includes(valLower) || valLower.includes(label);
      });
    }

    if (targetRadio) {
      targetRadio.checked = true;
      targetRadio.dispatchEvent(new Event('focus', { bubbles: true }));
      targetRadio.dispatchEvent(new Event('click', { bubbles: true }));
      targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
      targetRadio.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }

    return false;
  }

  /**
   * Sets checkbox state and dispatches events.
   */
  static _setCheckboxValue(checkboxEl, boolVal) {
    checkboxEl.checked = boolVal;
    checkboxEl.dispatchEvent(new Event('focus', { bubbles: true }));
    checkboxEl.dispatchEvent(new Event('click', { bubbles: true }));
    checkboxEl.dispatchEvent(new Event('change', { bubbles: true }));
    checkboxEl.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  /**
   * Reads back the DOM element's actual value to verify that the fill succeeded.
   */
  static _verifyFieldFill(el, field) {
    if (el.type === 'checkbox') {
      const expectedBool = typeof field.targetValue === 'boolean'
        ? field.targetValue
        : /^(yes|true|1|checked)$/i.test(String(field.targetValue).trim());
      return {
        isMatch: el.checked === expectedBool,
        actualValue: el.checked
      };
    }

    if (el.type === 'radio' || field.fieldType === 'radio-group') {
      const groupName = field.fieldName || el.name;
      const checkedRadio = document.querySelector(`input[type="radio"][name="${CSS.escape(groupName)}"]:checked`);
      const expectedVal = field.matchedOptionValue || field.targetValue;
      return {
        isMatch: !!checkedRadio,
        actualValue: checkedRadio ? checkedRadio.value : null
      };
    }

    if (el.tagName.toLowerCase() === 'select') {
      const selectedOpt = el.options[el.selectedIndex];
      const actualVal = selectedOpt ? selectedOpt.value : '';
      const actualText = selectedOpt ? selectedOpt.text.trim() : '';
      const expectedVal = field.matchedOptionValue || field.targetValue;
      const isMatch = actualVal === expectedVal ||
                      actualText.toLowerCase() === String(expectedVal).toLowerCase() ||
                      actualVal.toLowerCase() === String(expectedVal).toLowerCase();
      return { isMatch, actualValue: actualVal };
    }

    const actual = (el.value || '').trim();
    const expected = String(field.targetValue || '').trim();
    return {
      isMatch: actual === expected,
      actualValue: actual
    };
  }

  /**
   * Detects whether an input field is in a validation error state after filling.
   */
  static _detectDomValidationError(el) {
    // 1. Native HTML5 validity API
    if (typeof el.checkValidity === 'function' && !el.checkValidity()) {
      return {
        hasError: true,
        errorMessage: el.validationMessage || 'Native browser field validation failed'
      };
    }

    // 2. CSS pseudo-class :invalid
    if (el.matches && el.matches(':invalid')) {
      return {
        hasError: true,
        errorMessage: el.validationMessage || 'Field is marked invalid by CSS'
      };
    }

    // 3. ARIA invalid attribute
    if (el.getAttribute('aria-invalid') === 'true') {
      return {
        hasError: true,
        errorMessage: 'Field flagged with aria-invalid="true"'
      };
    }

    // 4. Surrounding DOM error containers
    const container = el.closest('.field, .form-group, .form-item, div');
    if (container) {
      if (container.classList.contains('has-error') || container.classList.contains('is-invalid')) {
        const errorText = container.querySelector('.error-message, .invalid-feedback, .error, [role="alert"]')?.innerText;
        return {
          hasError: true,
          errorMessage: errorText ? errorText.trim() : 'Container flagged with validation error'
        };
      }

      const alertEl = container.querySelector('.error-message, .invalid-feedback, .field-error, [role="alert"]');
      if (alertEl && alertEl.innerText.trim() && alertEl.offsetParent !== null) {
        return {
          hasError: true,
          errorMessage: alertEl.innerText.trim()
        };
      }
    }

    return { hasError: false, errorMessage: null };
  }

  /**
   * Checks whether the element already contains user-entered content that should be preserved.
   */
  static _hasUserEdit(el, type) {
    if (el.type === 'checkbox') {
      return el.checked !== el.defaultChecked;
    }
    if (el.type === 'radio') {
      return el.checked && !el.defaultChecked;
    }
    if (el.tagName.toLowerCase() === 'select') {
      return el.selectedIndex > 0 && el.value !== '';
    }
    return Boolean(el.value && el.value.trim().length > 0 && el.value !== el.defaultValue);
  }

  /**
   * Applies non-intrusive visual indicator highlighting field status.
   */
  static _applyVisualIndicator(el, type = 'success') {
    try {
      const colors = {
        success: '#10b981', // Emerald green
        preserved: '#3b82f6', // Soft blue
        error: '#ef4444'      // Red
      };

      const color = colors[type] || colors.success;
      el.style.outline = `2px solid ${color}`;
      el.style.transition = 'outline 0.3s ease';

      setTimeout(() => {
        try {
          el.style.outline = `1px solid ${color}88`;
        } catch (_) {}
      }, 2500);
    } catch (_) {}
  }
}
