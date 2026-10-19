(() => {
  // src/utils/constants.js
  var ExtensionAction = Object.freeze({
    // Page Lifecycle & Detection
    CHECK_PAGE_STATUS: "CHECK_PAGE_STATUS",
    PAGE_CONTEXT_DETECTED: "PAGE_CONTEXT_DETECTED",
    EXTRACT_JOB_DETAILS: "EXTRACT_JOB_DETAILS",
    EXTRACT_JOB_DETAILS_SUCCESS: "EXTRACT_JOB_DETAILS_SUCCESS",
    // Workflow Control
    START_APPLICATION_FLOW: "START_APPLICATION_FLOW",
    SESSION_STATE_UPDATED: "SESSION_STATE_UPDATED",
    SUBMIT_GAP_ANSWER: "SUBMIT_GAP_ANSWER",
    SKIP_GAP_QUESTION: "SKIP_GAP_QUESTION",
    GENERATE_TAILORED_RESUME: "GENERATE_TAILORED_RESUME",
    // Form Interaction & Autofill
    DETECT_FORM_FIELDS: "DETECT_FORM_FIELDS",
    DETECT_FORM_FIELDS_SUCCESS: "DETECT_FORM_FIELDS_SUCCESS",
    AUTOFILL_APPLICATION: "AUTOFILL_APPLICATION",
    AUTOFILL_APPLICATION_PROGRESS: "AUTOFILL_APPLICATION_PROGRESS",
    AUTOFILL_APPLICATION_COMPLETE: "AUTOFILL_APPLICATION_COMPLETE",
    // Resume File Attachment
    ATTACH_RESUME_FILE: "ATTACH_RESUME_FILE",
    ATTACH_RESUME_SUCCESS: "ATTACH_RESUME_SUCCESS",
    ATTACH_RESUME_FAILED: "ATTACH_RESUME_FAILED",
    // Review & Confirmation
    GET_REVIEW_MANIFEST: "GET_REVIEW_MANIFEST",
    CONFIRM_AND_SUBMIT: "CONFIRM_AND_SUBMIT",
    SUBMIT_APPLICATION: "SUBMIT_APPLICATION",
    SUBMISSION_COMPLETE: "SUBMISSION_COMPLETE",
    RECOVER_SESSION: "RECOVER_SESSION",
    // Sidepanel / Popup control
    OPEN_SIDEPANEL: "OPEN_SIDEPANEL",
    PING: "PING"
  });
  var AtsType = Object.freeze({
    GREENHOUSE: "GREENHOUSE",
    LEVER: "LEVER",
    WORKDAY: "WORKDAY",
    ASHBY: "ASHBY",
    TALEO: "TALEO",
    BAMBOOHR: "BAMBOOHR",
    GENERIC: "GENERIC"
  });
  var ExtensionWorkflowState = Object.freeze({
    UNAUTHENTICATED: "UNAUTHENTICATED",
    IDLE: "IDLE",
    JOB_DETECTED: "JOB_DETECTED",
    ANALYZING: "ANALYZING",
    QUESTIONS_PENDING: "QUESTIONS_PENDING",
    GENERATING_RESUME: "GENERATING_RESUME",
    RESUME_READY: "RESUME_READY",
    AUTOFILLING_FORM: "AUTOFILLING_FORM",
    FORM_FILLED: "FORM_FILLED",
    REVIEW_BARRIER: "REVIEW_BARRIER",
    SUBMITTING: "SUBMITTING",
    SUBMITTED: "SUBMITTED",
    SUBMISSION_STATUS_UNKNOWN: "SUBMISSION_STATUS_UNKNOWN",
    SUBMISSION_CONFIRMED: "SUBMISSION_CONFIRMED",
    ERROR: "ERROR"
  });

  // src/content/page-analyzer.js
  var PageAnalyzer = class _PageAnalyzer {
    static analyze() {
      const url = window.location.href;
      const hostname = window.location.hostname.toLowerCase();
      const pathname = window.location.pathname.toLowerCase();
      let detectedAts = AtsType.GENERIC;
      if (hostname.includes("greenhouse.io") || url.includes("greenhouse") || url.includes("gh_jid=") || document.querySelector("#application_form")) {
        detectedAts = AtsType.GREENHOUSE;
      } else if (hostname.includes("lever.co") || url.includes("lever.co")) {
        detectedAts = AtsType.LEVER;
      } else if (hostname.includes("myworkdayjobs.com") || hostname.includes("workday.com")) {
        detectedAts = AtsType.WORKDAY;
      } else if (hostname.includes("ashbyhq.com") || url.includes("ashbyhq.com")) {
        detectedAts = AtsType.ASHBY;
      } else if (hostname.includes("taleo.net")) {
        detectedAts = AtsType.TALEO;
      } else if (hostname.includes("bamboohr.com")) {
        detectedAts = AtsType.BAMBOOHR;
      }
      const hasApplicationForm = _PageAnalyzer._hasApplicationForm(detectedAts);
      const hasJobDescription = _PageAnalyzer._hasJobDescription(detectedAts);
      const isJobPage = detectedAts !== AtsType.GENERIC && (hasApplicationForm || hasJobDescription) || hasApplicationForm && hasJobDescription;
      return {
        isJobPage,
        atsType: detectedAts,
        url,
        domain: hostname,
        hasForm: hasApplicationForm,
        hasDescription: hasJobDescription
      };
    }
    static _hasApplicationForm(atsType) {
      if (atsType === AtsType.GREENHOUSE && document.querySelector('#application_form, form[action*="apply"], #apply_form')) {
        return true;
      }
      if (atsType === AtsType.LEVER && document.querySelector('.application-form, form[action*="apply"], .application-page')) {
        return true;
      }
      if (atsType === AtsType.WORKDAY && document.querySelector('[data-automation-id="application-form"], form[data-automation-id]')) {
        return true;
      }
      if (atsType === AtsType.ASHBY && document.querySelector('[data-testid="application-form"], form.ashby-application-form')) {
        return true;
      }
      const hasFileInput = !!document.querySelector('input[type="file"]');
      const hasNameOrEmail = !!document.querySelector(
        'input[name*="email" i], input[id*="email" i], input[name*="first_name" i], input[id*="first_name" i]'
      );
      const hasSubmitOrApply = !!document.querySelector(
        'button[type="submit"], input[type="submit"], [id*="submit" i]'
      );
      return hasFileInput && hasNameOrEmail || hasNameOrEmail && hasSubmitOrApply;
    }
    static _hasJobDescription(atsType) {
      if (atsType === AtsType.GREENHOUSE && document.querySelector("#content, .app-body, .job-post")) {
        return true;
      }
      if (atsType === AtsType.LEVER && document.querySelector(".posting-headline, .section-wrapper")) {
        return true;
      }
      if (atsType === AtsType.WORKDAY && document.querySelector('[data-automation-id="jobPostingDescription"], [data-automation-id="job-posting-details"]')) {
        return true;
      }
      if (atsType === AtsType.ASHBY && document.querySelector('.ashby-job-posting-content, [class*="jobDescription"]')) {
        return true;
      }
      return !!document.querySelector(
        '[class*="job-description" i], [id*="job-description" i], [class*="job_description" i], [class*="posting-description" i], #content, article, main'
      );
    }
  };

  // src/content/jd-extractor.js
  var JdExtractor = class _JdExtractor {
    static extract(atsType = AtsType.GENERIC) {
      const jobTitle = _JdExtractor._extractJobTitle(atsType);
      const companyName = _JdExtractor._extractCompanyName(atsType);
      const location = _JdExtractor._extractLocation(atsType);
      const rawJobDescription = _JdExtractor._extractJobDescription(atsType);
      const applicationQuestions = _JdExtractor._extractScreeningQuestions();
      return {
        jobTitle: jobTitle || "Target Role",
        companyName: companyName || "Target Company",
        location: location || "",
        rawJobDescription: rawJobDescription || document.body.innerText.substring(0, 5e3),
        applicationQuestions,
        extractedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    static _extractJobTitle(atsType) {
      const selectors = [
        // Greenhouse
        ".app-title",
        "#app-title",
        "h1.app-title",
        ".job-title",
        // Lever
        ".posting-headline h2",
        ".posting-headline h1",
        // Workday
        '[data-automation-id="jobPostingHeader"]',
        'h2[data-automation-id="jobPostingHeader"]',
        // Ashby
        ".ashby-job-posting-heading h1",
        '[data-testid="job-title"]',
        // Generic fallbacks
        'h1[class*="title" i]',
        'h1[class*="job" i]',
        'h1[class*="role" i]',
        "h1",
        "h2.title"
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim()) {
          const text = el.innerText.trim();
          return text.split("\n")[0].trim();
        }
      }
      const docTitle = document.title;
      if (docTitle && docTitle.includes(" - ")) {
        return docTitle.split(" - ")[0].trim();
      }
      if (docTitle && docTitle.includes(" | ")) {
        return docTitle.split(" | ")[0].trim();
      }
      return null;
    }
    static _extractCompanyName(atsType) {
      const metaCompany = document.querySelector('meta[property="og:site_name"], meta[name="company"]');
      if (metaCompany && metaCompany.getAttribute("content")) {
        return metaCompany.getAttribute("content").trim();
      }
      if (atsType === AtsType.GREENHOUSE) {
        const ghCompany = document.querySelector(".company-name, .logo-container img");
        if (ghCompany) {
          return (ghCompany.innerText || ghCompany.getAttribute("alt") || "").replace(/^at\s+/i, "").trim();
        }
        const match = window.location.pathname.match(/\/([^/]+)\/jobs/);
        if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
      }
      if (atsType === AtsType.LEVER) {
        const match = window.location.pathname.match(/\/([^/]+)\/[a-f0-9-]+/);
        if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
      }
      const docTitle = document.title;
      if (docTitle && docTitle.includes(" at ")) {
        return docTitle.split(" at ")[1].split(" - ")[0].trim();
      }
      const parts = window.location.hostname.split(".");
      if (parts.length >= 2 && !["greenhouse", "lever", "workday", "ashbyhq"].includes(parts[0])) {
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      }
      return null;
    }
    static _extractLocation(atsType) {
      const selectors = [
        ".location",
        '[class*="location" i]',
        ".posting-categories .location",
        '[data-automation-id="locations"]',
        '[data-automation-id="job-location"]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim()) {
          return el.innerText.trim();
        }
      }
      return "";
    }
    static _extractJobDescription(atsType) {
      const containers = [
        // Greenhouse
        "#content",
        ".job-post",
        "#job-details",
        // Lever
        ".section-wrapper.page-full-width",
        ".posting-page .content",
        // Workday
        '[data-automation-id="jobPostingDescription"]',
        // Ashby
        ".ashby-job-posting-content",
        // Generic
        '[class*="job-description" i]',
        '[id*="job-description" i]',
        "article",
        "main"
      ];
      let contentEl = null;
      for (const sel of containers) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.length > 200) {
          contentEl = el;
          break;
        }
      }
      if (!contentEl) {
        contentEl = document.body;
      }
      const clone = contentEl.cloneNode(true);
      const removeSelectors = ["script", "style", "noscript", "form", "nav", "header", "footer", "button", "input"];
      clone.querySelectorAll(removeSelectors.join(",")).forEach((el) => el.remove());
      return clone.innerText.replace(/\s+/g, " ").trim();
    }
    static _extractScreeningQuestions() {
      const questions = [];
      const questionContainers = document.querySelectorAll(
        '.field, .application-question, [data-automation-id*="question"], .form-group'
      );
      questionContainers.forEach((container, idx) => {
        const label = container.querySelector("label, .label, legend");
        const input = container.querySelector("input, select, textarea");
        if (label && input) {
          const text = label.innerText.replace(/\*$/, "").trim();
          const lower = text.toLowerCase();
          if (!lower.includes("first name") && !lower.includes("last name") && !lower.includes("email") && !lower.includes("phone") && !lower.includes("resume")) {
            questions.push({
              id: input.id || input.name || `q_${idx}`,
              questionText: text,
              type: input.tagName.toLowerCase()
            });
          }
        }
      });
      return questions;
    }
  };

  // src/content/form-detector.js
  var FormDetector = class _FormDetector {
    /**
     * Scans the active DOM and returns structured metadata for all application fields.
     */
    static detect(rootElement = null) {
      const root = rootElement || document.body;
      const fields = [];
      const fileInputs = [];
      const radioMap = /* @__PURE__ */ new Map();
      const multiStep = _FormDetector._detectMultiStep(root);
      const securityCheckpoints = _FormDetector._detectSecurityCheckpoints(root);
      const elements = root.querySelectorAll('input, select, textarea, [role="combobox"], [role="radiogroup"]');
      elements.forEach((el, index) => {
        if (el.type === "hidden" || el.type === "submit" || el.type === "button" || el.type === "reset") {
          return;
        }
        if (_FormDetector._isElementHidden(el)) {
          return;
        }
        if (el.type === "radio" && el.name) {
          const groupName = el.name;
          if (!radioMap.has(groupName)) {
            radioMap.set(groupName, []);
          }
          radioMap.get(groupName).push(el);
          return;
        }
        const fieldMeta = _FormDetector._inspectElement(el, index);
        if (fieldMeta) {
          fields.push(fieldMeta);
          if (fieldMeta.type === "file") {
            fileInputs.push(fieldMeta);
          }
        }
      });
      radioMap.forEach((radios, groupName) => {
        const radioGroupMeta = _FormDetector._inspectRadioGroup(radios, groupName);
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
      const type = tagName === "input" ? (el.type || "text").toLowerCase() : tagName;
      const id = el.id || "";
      const name = el.name || "";
      const fieldId = id || name || `applier_field_${index}_${type}`;
      const associatedLabel = _FormDetector._findAssociatedLabelText(el);
      const accessibleName = _FormDetector._findAccessibleName(el);
      const label = associatedLabel || accessibleName || el.placeholder || name || id;
      const isRequired = _FormDetector._checkRequired(el, label);
      const explanatoryText = _FormDetector._findExplanatoryText(el);
      const selector = _FormDetector._buildSelector(el);
      const options = _FormDetector._extractOptions(el);
      const currentValue = el.type === "checkbox" ? el.checked : el.value || "";
      const isDirty = _FormDetector._checkDirtyState(el);
      return {
        id: fieldId,
        name,
        type,
        selector,
        label: _FormDetector._cleanLabel(label),
        associatedLabel: _FormDetector._cleanLabel(associatedLabel),
        accessibleName,
        placeholder: el.placeholder || "",
        required: isRequired,
        explanatoryText,
        options,
        currentValue,
        isDirty,
        disabled: !!(el.disabled || el.getAttribute("aria-disabled") === "true"),
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
      let groupLabel = "";
      if (groupContainer) {
        const legend = groupContainer.querySelector("legend, .field-label, label.group-label, span.title, h3, h4");
        if (legend) {
          groupLabel = legend.innerText.trim();
        }
      }
      if (!groupLabel) {
        groupLabel = _FormDetector._findAssociatedLabelText(firstRadio) || groupName;
      }
      const isRequired = radios.some((r) => r.required || r.getAttribute("aria-required") === "true") || groupLabel.includes("*");
      const options = radios.map((radio) => {
        const radioLabel = _FormDetector._findAssociatedLabelText(radio) || radio.value;
        return {
          value: radio.value,
          text: _FormDetector._cleanLabel(radioLabel),
          checked: radio.checked,
          selector: _FormDetector._buildSelector(radio)
        };
      });
      const checkedOption = options.find((o) => o.checked);
      const explanatoryText = _FormDetector._findExplanatoryText(groupContainer || firstRadio);
      return {
        id: `radio_group_${groupName}`,
        name: groupName,
        type: "radio-group",
        selector: `input[type="radio"][name="${CSS.escape(groupName)}"]`,
        label: _FormDetector._cleanLabel(groupLabel),
        associatedLabel: _FormDetector._cleanLabel(groupLabel),
        accessibleName: firstRadio.getAttribute("aria-label") || "",
        placeholder: "",
        required: isRequired,
        explanatoryText,
        options,
        currentValue: checkedOption ? checkedOption.value : null,
        isDirty: !!checkedOption,
        disabled: radios.every((r) => r.disabled),
        readOnly: false
      };
    }
    /**
     * Resolves associated label text via explicit for=id, enclosing <label>, or preceding container headers.
     */
    static _findAssociatedLabelText(el) {
      if (el.id) {
        const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicitLabel && explicitLabel.innerText.trim()) {
          return explicitLabel.innerText.trim();
        }
      }
      const parentLabel = el.closest("label");
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        clone.querySelectorAll("input, select, textarea, button").forEach((c) => c.remove());
        const labelText = clone.innerText.trim();
        if (labelText) return labelText;
      }
      const container = el.closest('.field, .form-group, .form-item, [data-automation-id*="form"], div');
      if (container) {
        const headerLabel = container.querySelector("label, .label, legend, span.title, .form-label");
        if (headerLabel && headerLabel !== el && headerLabel.innerText.trim()) {
          return headerLabel.innerText.trim();
        }
      }
      return "";
    }
    /**
     * Resolves accessible name via aria-label or referenced aria-labelledby elements.
     */
    static _findAccessibleName(el) {
      if (el.getAttribute("aria-label")) {
        return el.getAttribute("aria-label").trim();
      }
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const texts = labelledBy.split(/\s+/).map((id) => {
          const refEl = document.getElementById(id);
          return refEl ? refEl.innerText.trim() : "";
        }).filter(Boolean);
        if (texts.length > 0) {
          return texts.join(" ");
        }
      }
      return "";
    }
    /**
     * Resolves help, hint, or description text via aria-describedby or class heuristics.
     */
    static _findExplanatoryText(el) {
      if (!el) return "";
      const describedBy = el.getAttribute ? el.getAttribute("aria-describedby") : null;
      if (describedBy) {
        const texts = describedBy.split(/\s+/).map((id) => {
          const refEl = document.getElementById(id);
          return refEl ? refEl.innerText.trim() : "";
        }).filter(Boolean);
        if (texts.length > 0) return texts.join(" ");
      }
      const container = el.closest ? el.closest(".field, .form-group, .form-item, div") : null;
      if (container) {
        const helpEl = container.querySelector(".help-text, .help-block, .form-text, .description, .hint, .field-hint, small");
        if (helpEl && helpEl.innerText.trim()) {
          return helpEl.innerText.trim();
        }
      }
      return "";
    }
    /**
     * Checks multiple signals for whether a field is mandatory.
     */
    static _checkRequired(el, labelText) {
      if (el.required) return true;
      if (el.getAttribute("aria-required") === "true") return true;
      if (el.classList.contains("required") || el.classList.contains("is-required")) return true;
      if (labelText && (labelText.includes("*") || /\b(required)\b/i.test(labelText))) {
        return true;
      }
      const container = el.closest ? el.closest(".field, .form-group, .form-item, div") : null;
      if (container) {
        if (container.classList.contains("required") || container.getAttribute("data-required") === "true") {
          return true;
        }
        const reqMarker = container.querySelector('.required-marker, .asterisk, [aria-hidden="true"]');
        if (reqMarker && reqMarker.innerText.includes("*")) {
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
      if (tagName === "select") {
        return Array.from(el.options).map((opt) => ({
          value: opt.value,
          text: opt.text.trim(),
          selected: opt.selected,
          disabled: opt.disabled
        }));
      }
      if (el.getAttribute("role") === "combobox" || el.getAttribute("role") === "listbox") {
        const optionElements = el.querySelectorAll('[role="option"]');
        if (optionElements.length > 0) {
          return Array.from(optionElements).map((opt) => ({
            value: opt.getAttribute("data-value") || opt.innerText.trim(),
            text: opt.innerText.trim(),
            selected: opt.getAttribute("aria-selected") === "true"
          }));
        }
      }
      return [];
    }
    /**
     * Determines if the user has already entered custom information into this field.
     */
    static _checkDirtyState(el) {
      if (el.type === "checkbox" || el.type === "radio") {
        return el.checked !== el.defaultChecked;
      }
      if (el.tagName.toLowerCase() === "select") {
        return el.selectedIndex > 0 && el.value !== "";
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
        if (el.type && tag === "input") {
          return `input[type="${el.type}"][name="${CSS.escape(el.name)}"]`;
        }
        return `${tag}[name="${CSS.escape(el.name)}"]`;
      }
      if (el.getAttribute("data-automation-id")) {
        return `[data-automation-id="${CSS.escape(el.getAttribute("data-automation-id"))}"]`;
      }
      if (el.getAttribute("data-testid")) {
        return `[data-testid="${CSS.escape(el.getAttribute("data-testid"))}"]`;
      }
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
      if (!text) return "";
      return text.replace(/[*:]+$/, "").trim();
    }
    /**
     * Determines whether an element is visually hidden or detached.
     */
    static _isElementHidden(el) {
      if (el.offsetParent === null && el.type !== "file") {
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === "none" || style.visibility === "hidden")) {
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
        '.wizard-steps, .step-indicator, .progress-bar, [role="progressbar"], [data-automation-id*="step"], .application-step, ol.steps, ul.steps'
      );
      const stepTextMatch = (root.innerText || "").match(/\bstep\s*(\d+)\s*(?:of|\/)\s*(\d+)\b/i);
      const candidateButtons = Array.from(root.querySelectorAll(
        'button[name*="next" i], button[id*="next" i], [data-automation-id*="next" i], .btn-next, .next-button, button, input[type="button"]'
      ));
      const nextBtn = candidateButtons.find((b) => /\b(next|continue)\b/i.test(b.innerText || b.value || "")) || null;
      const isMultiStep = wizardMarkers.length > 0 || Boolean(stepTextMatch);
      return {
        isMultiStep,
        currentStep: stepTextMatch ? parseInt(stepTextMatch[1], 10) : 1,
        totalSteps: stepTextMatch ? parseInt(stepTextMatch[2], 10) : wizardMarkers.length || 1,
        nextButtonSelector: nextBtn ? _FormDetector._buildSelector(nextBtn) : null
      };
    }
    /**
     * Scans for CAPTCHA, Turnstile, or OTP security checkpoints.
     * Safety invariant: These are NEVER bypassed by automation.
     */
    static _detectSecurityCheckpoints(root) {
      const checkpoints = [];
      if (root.querySelector('.g-recaptcha, iframe[src*="recaptcha"], [data-sitekey]')) {
        checkpoints.push({ type: "RECAPTCHA", provider: "Google reCAPTCHA" });
      }
      if (root.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]')) {
        checkpoints.push({ type: "TURNSTILE", provider: "Cloudflare Turnstile" });
      }
      if (root.querySelector('.h-captcha, iframe[src*="hcaptcha"]')) {
        checkpoints.push({ type: "HCAPTCHA", provider: "hCaptcha" });
      }
      if (root.querySelector('iframe[src*="arkoselabs"], #arkose')) {
        checkpoints.push({ type: "ARKOSE", provider: "Arkose Labs" });
      }
      const otpInput = root.querySelector(
        'input[name*="otp" i], input[name*="2fa" i], input[name*="verification_code" i], input[autocomplete="one-time-code"]'
      );
      if (otpInput) {
        checkpoints.push({ type: "OTP", provider: "One-Time Verification Code" });
      }
      return {
        hasCheckpoint: checkpoints.length > 0,
        checkpoints,
        requiresManualResolution: checkpoints.length > 0
      };
    }
  };

  // src/content/field-mapper.js
  var FieldMapper = class _FieldMapper {
    /**
     * Maps detected DOM fields against candidate profile and session application answers.
     */
    static mapFields(detectedFields, profile = {}, applicationAnswers = {}) {
      const personalInfo = profile.personalInfo || profile || {};
      const links = personalInfo.links || profile.links || [];
      const workPrefs = profile.workPreferences || {};
      const experience = profile.experience || [];
      const education = profile.education || [];
      const fullName = personalInfo.fullName || personalInfo.name || profile.fullName || profile.name || "";
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = personalInfo.firstName || profile.firstName || nameParts[0] || "";
      const lastName = personalInfo.lastName || profile.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(" ") : "");
      const email = personalInfo.email || profile.email || "";
      const phone = personalInfo.phone || personalInfo.phoneNumber || profile.phone || profile.phoneNumber || "";
      const locationObj = personalInfo.location || {};
      const city = typeof locationObj === "object" ? locationObj.city || "" : "";
      const state = typeof locationObj === "object" ? locationObj.state || "" : "";
      const country = typeof locationObj === "object" ? locationObj.country || "United States" : "";
      const postalCode = typeof locationObj === "object" ? locationObj.postalCode || locationObj.zip || "" : "";
      const fullLocation = typeof locationObj === "string" ? locationObj : [city, state, country].filter(Boolean).join(", ");
      const findLink = (term) => links.find((l) => (l.label || l.type || "").toLowerCase().includes(term))?.url || "";
      const linkedinUrl = findLink("linkedin") || personalInfo.linkedin || "";
      const githubUrl = findLink("github") || personalInfo.github || "";
      const portfolioUrl = findLink("portfolio") || findLink("website") || personalInfo.website || personalInfo.portfolio || "";
      const currentRole = experience[0] || {};
      const currentTitle = currentRole.title || currentRole.role || "";
      const currentCompany = currentRole.company || "";
      let totalYearsExp = 0;
      if (experience.length > 0) {
        experience.forEach((exp) => {
          const start = exp.startDate ? new Date(exp.startDate) : null;
          const end = exp.endDate ? new Date(exp.endDate) : /* @__PURE__ */ new Date();
          if (start && !isNaN(start.getTime())) {
            const years = (end.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24 * 365.25);
            totalYearsExp += Math.max(0, years);
          }
        });
      }
      const yearsExpInt = Math.max(1, Math.round(totalYearsExp));
      const topEdu = education[0] || {};
      const school = topEdu.institution || topEdu.school || "";
      const degree = topEdu.degree || "";
      const major = topEdu.fieldOfStudy || topEdu.major || "";
      const gradYear = topEdu.graduationYear ? String(topEdu.graduationYear) : "";
      const mapped = [];
      const unmapped = [];
      const fileUploadFields = [];
      detectedFields.forEach((field) => {
        if (field.type === "file") {
          const filePurpose = _FieldMapper._classifyFilePurpose(field);
          fileUploadFields.push({
            ...field,
            purpose: filePurpose,
            candidateProperty: filePurpose === "RESUME" ? "vault.tailoredResume" : "vault.coverLetter"
          });
          return;
        }
        const match = _FieldMapper._matchFieldSignals(field, {
          firstName,
          lastName,
          fullName,
          email,
          phone,
          city,
          state,
          country,
          postalCode,
          fullLocation,
          linkedinUrl,
          githubUrl,
          portfolioUrl,
          currentTitle,
          currentCompany,
          yearsExpInt,
          school,
          degree,
          major,
          gradYear,
          workPrefs,
          applicationAnswers
        });
        const validationResult = _FieldMapper._validateFieldMapping(field, match.targetValue, match.candidateProperty);
        let matchedOptionValue = null;
        if ((field.type === "select-one" || field.type === "select" || field.type === "radio-group") && match.targetValue) {
          const optMatch = _FieldMapper._findMatchingOption(field.options, match.targetValue);
          if (optMatch) {
            matchedOptionValue = optMatch.value;
          } else {
            validationResult.isValid = false;
            validationResult.error = `Candidate value "${match.targetValue}" does not match any available option in dropdown`;
          }
        }
        const { action, reason } = _FieldMapper._determineAction(
          field,
          match,
          validationResult,
          matchedOptionValue
        );
        const mappingRecord = {
          fieldId: field.id,
          fieldName: field.name,
          selector: field.selector,
          fieldType: field.type,
          label: field.label,
          candidateProperty: match.candidateProperty,
          targetValue: match.targetValue,
          matchedOptionValue,
          confidence: match.confidence,
          confidenceScore: match.confidenceScore,
          validationResult,
          action,
          reason,
          isSensitive: match.isSensitive,
          required: field.required,
          userEdited: field.isDirty
        };
        if (action === "FILL" || action === "REQUIRE_USER_CONFIRMATION") {
          mapped.push(mappingRecord);
        } else {
          unmapped.push(mappingRecord);
        }
      });
      return {
        totalFields: detectedFields.length,
        mappedFields: mapped,
        unmappedFields: unmapped,
        fileUploadFields,
        unresolvedRequiredCount: mapped.filter((m) => m.required && m.action !== "FILL").length + unmapped.filter((m) => m.required).length
      };
    }
    /**
     * Multi-signal deterministic matching against candidate profile properties.
     */
    static _matchFieldSignals(field, facts) {
      const label = (field.label || "").toLowerCase();
      const name = (field.name || "").toLowerCase();
      const id = (field.id || "").toLowerCase();
      const placeholder = (field.placeholder || "").toLowerCase();
      const accName = (field.accessibleName || "").toLowerCase();
      const explanatory = (field.explanatoryText || "").toLowerCase();
      const descriptor = `${label} ${name} ${id} ${placeholder} ${accName} ${explanatory}`;
      if (/\b(salary|compensation|desired pay|expected rate|hourly rate|annual pay)\b/i.test(descriptor)) {
        const salaryAns = facts.applicationAnswers["salary"] || facts.applicationAnswers["desired_salary"] || null;
        return {
          candidateProperty: "applicationAnswers.desiredSalary",
          targetValue: salaryAns,
          confidence: "MEDIUM",
          confidenceScore: 0.7,
          isSensitive: true,
          isCustomQuestion: true
        };
      }
      if (/\b(gender|race|ethnicity|hispanic|latino|veteran|disability|sexual orientation|demographic)\b/i.test(descriptor)) {
        return {
          candidateProperty: "demographics.eeoc",
          targetValue: null,
          confidence: "LOW",
          confidenceScore: 0.3,
          isSensitive: true,
          isCustomQuestion: true
        };
      }
      if (/\b(first\s*name|given\s*name|fname|forename)\b/i.test(descriptor) && !/last/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.firstName",
          targetValue: facts.firstName,
          confidence: "HIGH",
          confidenceScore: 0.98,
          isSensitive: false
        };
      }
      if (/\b(last\s*name|surname|family\s*name|lname)\b/i.test(descriptor) && !/first/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.lastName",
          targetValue: facts.lastName,
          confidence: "HIGH",
          confidenceScore: 0.98,
          isSensitive: false
        };
      }
      if (/\b(full\s*name|applicant\s*name|candidate\s*name|your\s*name|legal\s*name)\b/i.test(descriptor) || label === "name" && !/company|school|employer/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.fullName",
          targetValue: facts.fullName,
          confidence: "HIGH",
          confidenceScore: 0.95,
          isSensitive: false
        };
      }
      if (field.type === "email" || /\b(email|e-mail)\b/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.email",
          targetValue: facts.email,
          confidence: "HIGH",
          confidenceScore: 0.99,
          isSensitive: false
        };
      }
      if (field.type === "tel" || /\b(phone|mobile|cell|telephone|contact\s*number)\b/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.phone",
          targetValue: facts.phone,
          confidence: "HIGH",
          confidenceScore: 0.96,
          isSensitive: false
        };
      }
      if (/linkedin/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.links.linkedin",
          targetValue: facts.linkedinUrl,
          confidence: "HIGH",
          confidenceScore: 0.97,
          isSensitive: false
        };
      }
      if (/github/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.links.github",
          targetValue: facts.githubUrl,
          confidence: "HIGH",
          confidenceScore: 0.96,
          isSensitive: false
        };
      }
      if (/\b(portfolio|personal\s*website|website|blog|personal\s*url)\b/i.test(descriptor) && !/company|employer/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.links.portfolio",
          targetValue: facts.portfolioUrl || facts.linkedinUrl,
          confidence: "HIGH",
          confidenceScore: 0.9,
          isSensitive: false
        };
      }
      if (/\b(sponsorship|visa|authorized|work\s*authorization|legally\s*authorized|eligible\s*to\s*work)\b/i.test(descriptor)) {
        let explicitAnswer = facts.applicationAnswers[field.name] || facts.applicationAnswers[field.id];
        if (!explicitAnswer && /sponsorship/i.test(descriptor)) {
          explicitAnswer = facts.applicationAnswers["sponsorship"];
        }
        if (!explicitAnswer) {
          explicitAnswer = facts.applicationAnswers["work_authorization"];
        }
        const prefAuth = facts.workPrefs.workAuthorization;
        let resolvedValue = null;
        if (explicitAnswer) {
          resolvedValue = typeof explicitAnswer === "object" ? explicitAnswer.value : explicitAnswer;
        } else if (prefAuth && prefAuth.length > 0) {
          resolvedValue = /require\s*sponsorship/i.test(descriptor) ? "No" : "Yes";
        }
        return {
          candidateProperty: "applicationAnswers.workAuthorization",
          targetValue: resolvedValue,
          confidence: explicitAnswer ? "HIGH" : "MEDIUM",
          confidenceScore: explicitAnswer ? 0.95 : 0.75,
          isSensitive: false
        };
      }
      if (/\b(city)\b/i.test(descriptor) && !/university|college/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.location.city",
          targetValue: facts.city,
          confidence: "HIGH",
          confidenceScore: 0.92,
          isSensitive: false
        };
      }
      if (/\b(state|province|region)\b/i.test(descriptor) && !/united\s*states/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.location.state",
          targetValue: facts.state,
          confidence: "HIGH",
          confidenceScore: 0.91,
          isSensitive: false
        };
      }
      if (/\b(zip|postal\s*code|zipcode)\b/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.location.postalCode",
          targetValue: facts.postalCode,
          confidence: "HIGH",
          confidenceScore: 0.94,
          isSensitive: false
        };
      }
      if (/\b(location|address|residence)\b/i.test(descriptor)) {
        return {
          candidateProperty: "personalInfo.location.full",
          targetValue: facts.fullLocation,
          confidence: "HIGH",
          confidenceScore: 0.88,
          isSensitive: false
        };
      }
      if (/\b(current\s*company|current\s*employer|most\s*recent\s*employer|present\s*company)\b/i.test(descriptor)) {
        return {
          candidateProperty: "experience.currentCompany",
          targetValue: facts.currentCompany,
          confidence: "HIGH",
          confidenceScore: 0.93,
          isSensitive: false
        };
      }
      if (/\b(current\s*title|current\s*role|current\s*job\s*title|present\s*title)\b/i.test(descriptor)) {
        return {
          candidateProperty: "experience.currentTitle",
          targetValue: facts.currentTitle,
          confidence: "HIGH",
          confidenceScore: 0.92,
          isSensitive: false
        };
      }
      if (/\b(years\s*of\s*experience|total\s*experience|experience\s*in\s*years)\b/i.test(descriptor)) {
        return {
          candidateProperty: "experience.totalYears",
          targetValue: String(facts.yearsExpInt),
          confidence: "HIGH",
          confidenceScore: 0.89,
          isSensitive: false
        };
      }
      if (/\b(school|university|college|institution|alma\s*mater)\b/i.test(descriptor)) {
        return {
          candidateProperty: "education.institution",
          targetValue: facts.school,
          confidence: "HIGH",
          confidenceScore: 0.91,
          isSensitive: false
        };
      }
      if (/\b(degree|highest\s*degree|education\s*level)\b/i.test(descriptor)) {
        return {
          candidateProperty: "education.degree",
          targetValue: facts.degree,
          confidence: "HIGH",
          confidenceScore: 0.89,
          isSensitive: false
        };
      }
      if (/\b(major|field\s*of\s*study|discipline|area\s*of\s*study)\b/i.test(descriptor)) {
        return {
          candidateProperty: "education.fieldOfStudy",
          targetValue: facts.major,
          confidence: "HIGH",
          confidenceScore: 0.9,
          isSensitive: false
        };
      }
      if (/\b(graduation\s*year|year\s*of\s*graduation|grad\s*year)\b/i.test(descriptor)) {
        return {
          candidateProperty: "education.graduationYear",
          targetValue: facts.gradYear,
          confidence: "HIGH",
          confidenceScore: 0.92,
          isSensitive: false
        };
      }
      for (const [qKey, qVal] of Object.entries(facts.applicationAnswers)) {
        const qText = qKey.toLowerCase().replace(/[_-]/g, " ");
        if (descriptor.includes(qText) || qText.includes(label)) {
          const value = typeof qVal === "object" ? qVal.value : qVal;
          return {
            candidateProperty: `applicationAnswers.${qKey}`,
            targetValue: value,
            confidence: "HIGH",
            confidenceScore: 0.9,
            isSensitive: false
          };
        }
      }
      return {
        candidateProperty: null,
        targetValue: null,
        confidence: "AMBIGUOUS",
        confidenceScore: 0.1,
        isSensitive: false
      };
    }
    /**
     * Validates target values against schema and field types.
     */
    static _validateFieldMapping(field, targetValue, candidateProperty) {
      if (targetValue === null || targetValue === void 0 || targetValue === "") {
        if (field.required) {
          return {
            isValid: false,
            error: "Required field has no verified candidate value"
          };
        }
        return { isValid: true, error: null };
      }
      const strVal = String(targetValue).trim();
      if (field.type === "email" || candidateProperty === "personalInfo.email") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(strVal)) {
          return {
            isValid: false,
            error: `Invalid email address format: "${strVal}"`
          };
        }
      }
      if (field.type === "tel" || candidateProperty === "personalInfo.phone") {
        const digitsOnly = strVal.replace(/\D/g, "");
        if (digitsOnly.length < 7) {
          return {
            isValid: false,
            error: `Phone number does not contain enough digits: "${strVal}"`
          };
        }
      }
      if (field.type === "url" || candidateProperty?.includes(".links.")) {
        if (!strVal.startsWith("http://") && !strVal.startsWith("https://")) {
          return {
            isValid: false,
            error: `Invalid URL format (missing http/https): "${strVal}"`
          };
        }
      }
      if (field.maxLength && strVal.length > field.maxLength) {
        return {
          isValid: false,
          error: `Value exceeds field maximum length (${strVal.length} > ${field.maxLength})`
        };
      }
      return { isValid: true, error: null };
    }
    /**
     * Matches candidate target value against available options for Select or Radio groups.
     */
    static _findMatchingOption(options, targetValue) {
      if (!options || options.length === 0 || !targetValue) return null;
      const valLower = String(targetValue).toLowerCase().trim();
      let match = options.find((o) => (o.value || "").toLowerCase().trim() === valLower);
      if (match) return match;
      match = options.find((o) => (o.text || "").toLowerCase().trim() === valLower);
      if (match) return match;
      if (valLower === "yes" || valLower === "true" || valLower.includes("authorized")) {
        match = options.find((o) => /^(yes|true|authorized|i am|no sponsorship)/i.test(o.text || o.value));
        if (match) return match;
      }
      if (valLower === "no" || valLower === "false" || valLower.includes("without sponsorship") || valLower.includes("not require")) {
        match = options.find((o) => /^(no|false|not authorized|will require|not require|without)/i.test(o.text || o.value));
        if (match) return match;
      }
      if (/\b(master|m\.s\.|ms|m\.a\.|ma|mba|msc)\b/i.test(valLower)) {
        match = options.find((o) => /\b(master|graduate|ms|ma|msc)\b/i.test(o.text || o.value));
        if (match) return match;
      }
      if (/\b(bachelor|b\.s\.|bs|b\.a\.|ba|bsc|undergraduate)\b/i.test(valLower)) {
        match = options.find((o) => /\b(bachelor|undergraduate|bs|ba)\b/i.test(o.text || o.value));
        if (match) return match;
      }
      if (/\b(doctor|phd|doctorate|ph\.d\.)\b/i.test(valLower)) {
        match = options.find((o) => /\b(doctor|phd|doctorate)\b/i.test(o.text || o.value));
        if (match) return match;
      }
      match = options.find((o) => {
        const optText = (o.text || "").toLowerCase().trim();
        const optVal = (o.value || "").toLowerCase().trim();
        return optText.length > 2 && (optText.includes(valLower) || valLower.includes(optText)) || optVal.length > 2 && (optVal.includes(valLower) || valLower.includes(optVal));
      });
      return match || null;
    }
    /**
     * Determines the operational action: FILL, REQUIRE_USER_CONFIRMATION, or SKIP.
     */
    static _determineAction(field, match, validationResult, matchedOptionValue) {
      if (match.isSensitive) {
        return {
          action: "REQUIRE_USER_CONFIRMATION",
          reason: "SENSITIVE_QUESTION"
        };
      }
      if (!match.candidateProperty || match.confidence === "AMBIGUOUS" || match.confidenceScore < 0.7) {
        if (field.required) {
          return {
            action: "REQUIRE_USER_CONFIRMATION",
            reason: "REQUIRED_FIELD_MISSING"
          };
        }
        return {
          action: "SKIP",
          reason: "UNSUPPORTED_QUESTION"
        };
      }
      if (!validationResult.isValid) {
        return {
          action: "REQUIRE_USER_CONFIRMATION",
          reason: validationResult.error?.includes("option") ? "UNRESOLVED_OPTIONS" : "FORMAT_MISMATCH"
        };
      }
      if (!match.targetValue) {
        if (field.required) {
          return {
            action: "REQUIRE_USER_CONFIRMATION",
            reason: "REQUIRED_FIELD_MISSING"
          };
        }
        return {
          action: "SKIP",
          reason: "OPTIONAL_VALUE_EMPTY"
        };
      }
      return {
        action: "FILL",
        reason: null
      };
    }
    /**
     * Classifies file inputs into RESUME or COVER_LETTER.
     */
    static _classifyFilePurpose(field) {
      const text = `${field.label} ${field.name} ${field.id}`.toLowerCase();
      if (text.includes("cover") || text.includes("letter")) {
        return "COVER_LETTER";
      }
      return "RESUME";
    }
  };

  // src/content/form-filler.js
  var FormFiller = class _FormFiller {
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
      if (!options.userAuthorized) {
        return {
          success: false,
          error: "Form filling aborted: User authorization required.",
          totalFields: mappedFields.length,
          filledCount: 0,
          preservedCount: 0,
          failedCount: 0,
          unresolvedRequiredCount: mappedFields.filter((f) => f.required).length,
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
        summaryMessage: ""
      };
      mappedFields.forEach((field) => {
        const isConfirmed = confirmedSet.has(field.fieldId);
        if (field.required && field.action !== "FILL" && !isConfirmed) {
          results.unresolvedRequiredFields.push({
            fieldId: field.fieldId,
            label: field.label,
            reason: field.reason || "REQUIRED_UNRESOLVED"
          });
        }
      });
      for (let i = 0; i < mappedFields.length; i++) {
        const field = mappedFields[i];
        const isConfirmed = confirmedSet.has(field.fieldId);
        if (typeof options.onProgress === "function") {
          try {
            options.onProgress(i + 1, mappedFields.length, field.label || field.fieldName);
          } catch (_) {
          }
        }
        if ((field.action === "REQUIRE_USER_CONFIRMATION" || field.isSensitive) && !isConfirmed) {
          results.skippedCount++;
          results.fields.push({
            fieldId: field.fieldId,
            status: "SKIPPED_UNCONFIRMED",
            label: field.label,
            reason: field.reason || "User confirmation required for this field"
          });
          continue;
        }
        if (field.action === "SKIP" && !isConfirmed) {
          results.skippedCount++;
          results.fields.push({
            fieldId: field.fieldId,
            status: "SKIPPED_OPTIONAL",
            label: field.label,
            reason: field.reason || "Optional unmapped field"
          });
          continue;
        }
        const el = document.querySelector(field.selector);
        if (!el) {
          results.failedCount++;
          if (field.required) results.unresolvedRequiredCount++;
          results.fields.push({
            fieldId: field.fieldId,
            status: "ELEMENT_NOT_FOUND",
            label: field.label,
            selector: field.selector,
            error: "Element could not be found in active DOM"
          });
          continue;
        }
        if (!overwriteUserEdits && _FormFiller._hasUserEdit(el, field.fieldType)) {
          results.preservedCount++;
          _FormFiller._applyVisualIndicator(el, "preserved");
          results.fields.push({
            fieldId: field.fieldId,
            status: "PRESERVED_USER_EDIT",
            label: field.label,
            currentValue: el.value || el.checked,
            reason: "Existing user edit preserved"
          });
          continue;
        }
        try {
          const fillSuccess = await _FormFiller._populateField(el, field);
          if (!fillSuccess) {
            results.failedCount++;
            if (field.required) results.unresolvedRequiredCount++;
            results.fields.push({
              fieldId: field.fieldId,
              status: "FAILED_TO_POPULATE",
              label: field.label,
              error: "Failed to assign target value to DOM element"
            });
            continue;
          }
          const verified = _FormFiller._verifyFieldFill(el, field);
          if (!verified.isMatch) {
            results.failedCount++;
            if (field.required) results.unresolvedRequiredCount++;
            results.fields.push({
              fieldId: field.fieldId,
              status: "VERIFICATION_FAILED",
              label: field.label,
              expected: field.matchedOptionValue || field.targetValue,
              actual: verified.actualValue,
              error: "DOM value does not match expected target value after event dispatch"
            });
            continue;
          }
          const validation = _FormFiller._detectDomValidationError(el);
          if (validation.hasError) {
            results.validationErrorsCount++;
            results.validationErrors.push({
              fieldId: field.fieldId,
              label: field.label,
              errorMessage: validation.errorMessage
            });
            _FormFiller._applyVisualIndicator(el, "error");
            results.fields.push({
              fieldId: field.fieldId,
              status: "VALIDATION_ERROR",
              label: field.label,
              value: verified.actualValue,
              error: validation.errorMessage
            });
          } else {
            results.filledCount++;
            _FormFiller._applyVisualIndicator(el, "success");
            results.fields.push({
              fieldId: field.fieldId,
              status: "FILLED",
              label: field.label,
              value: verified.actualValue
            });
          }
        } catch (fillErr) {
          results.failedCount++;
          if (field.required) results.unresolvedRequiredCount++;
          results.fields.push({
            fieldId: field.fieldId,
            status: "EXCEPTION",
            label: field.label,
            error: fillErr.message
          });
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      results.unresolvedRequiredCount = results.unresolvedRequiredFields.length + results.fields.filter((f) => f.status !== "FILLED" && f.status !== "PRESERVED_USER_EDIT" && mappedFields.find((m) => m.fieldId === f.fieldId)?.required).length;
      results.success = results.unresolvedRequiredCount === 0 && results.validationErrorsCount === 0;
      results.summaryMessage = results.success ? `Successfully filled ${results.filledCount} fields (${results.preservedCount} user edits preserved).` : `Filled ${results.filledCount} fields with ${results.unresolvedRequiredCount} unresolved required fields and ${results.validationErrorsCount} validation errors.`;
      return results;
    }
    /**
     * Dispatches value to the element using framework-compatible setters.
     */
    static async _populateField(el, field) {
      const tagName = el.tagName.toLowerCase();
      const type = field.fieldType || el.type || tagName;
      if (tagName === "select") {
        const optionValue = field.matchedOptionValue || field.targetValue;
        return _FormFiller._setSelectValue(el, optionValue);
      }
      if (type === "radio-group" || el.type === "radio") {
        const optionValue = field.matchedOptionValue || field.targetValue;
        return _FormFiller._setRadioValue(el, field.name, optionValue);
      }
      if (el.type === "checkbox") {
        const boolVal = typeof field.targetValue === "boolean" ? field.targetValue : /^(yes|true|1|checked)$/i.test(String(field.targetValue).trim());
        return _FormFiller._setCheckboxValue(el, boolVal);
      }
      if (tagName === "textarea" || tagName === "input" && !["checkbox", "radio", "file"].includes(el.type)) {
        return _FormFiller._setTextInputValue(el, String(field.targetValue));
      }
      return false;
    }
    /**
     * Populates text/textarea via prototype setter bypass for React/Vue/Angular.
     */
    static _setTextInputValue(el, value) {
      const prototype = Object.getPrototypeOf(el);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      const valueSetter = Object.getOwnPropertyDescriptor(el, "value")?.set;
      if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(el, value);
      } else if (valueSetter) {
        valueSetter.call(el, value);
      } else {
        el.value = value;
      }
      el.dispatchEvent(new Event("focus", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }
    /**
     * Sets select dropdown value and triggers reactive events.
     */
    static _setSelectValue(selectEl, value) {
      if (!selectEl || !value) return false;
      const valLower = String(value).toLowerCase().trim();
      let matchedOption = null;
      for (const opt of selectEl.options) {
        if ((opt.value || "").toLowerCase().trim() === valLower) {
          matchedOption = opt;
          break;
        }
      }
      if (!matchedOption) {
        for (const opt of selectEl.options) {
          if ((opt.text || "").toLowerCase().trim() === valLower) {
            matchedOption = opt;
            break;
          }
        }
      }
      if (!matchedOption) {
        for (const opt of selectEl.options) {
          const textLower = (opt.text || "").toLowerCase().trim();
          if (textLower.length > 2 && (textLower.includes(valLower) || valLower.includes(textLower))) {
            matchedOption = opt;
            break;
          }
        }
      }
      if (matchedOption) {
        selectEl.value = matchedOption.value;
        selectEl.dispatchEvent(new Event("focus", { bubbles: true }));
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        selectEl.dispatchEvent(new Event("blur", { bubbles: true }));
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
      let targetRadio = radios.find((r) => (r.value || "").toLowerCase().trim() === valLower);
      if (!targetRadio) {
        targetRadio = radios.find((r) => {
          const label = (r.closest("label")?.innerText || document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.innerText || "").toLowerCase().trim();
          return label.includes(valLower) || valLower.includes(label);
        });
      }
      if (targetRadio) {
        targetRadio.checked = true;
        targetRadio.dispatchEvent(new Event("focus", { bubbles: true }));
        targetRadio.dispatchEvent(new Event("click", { bubbles: true }));
        targetRadio.dispatchEvent(new Event("change", { bubbles: true }));
        targetRadio.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
      }
      return false;
    }
    /**
     * Sets checkbox state and dispatches events.
     */
    static _setCheckboxValue(checkboxEl, boolVal) {
      checkboxEl.checked = boolVal;
      checkboxEl.dispatchEvent(new Event("focus", { bubbles: true }));
      checkboxEl.dispatchEvent(new Event("click", { bubbles: true }));
      checkboxEl.dispatchEvent(new Event("change", { bubbles: true }));
      checkboxEl.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }
    /**
     * Reads back the DOM element's actual value to verify that the fill succeeded.
     */
    static _verifyFieldFill(el, field) {
      if (el.type === "checkbox") {
        const expectedBool = typeof field.targetValue === "boolean" ? field.targetValue : /^(yes|true|1|checked)$/i.test(String(field.targetValue).trim());
        return {
          isMatch: el.checked === expectedBool,
          actualValue: el.checked
        };
      }
      if (el.type === "radio" || field.fieldType === "radio-group") {
        const groupName = field.fieldName || el.name;
        const checkedRadio = document.querySelector(`input[type="radio"][name="${CSS.escape(groupName)}"]:checked`);
        const expectedVal = field.matchedOptionValue || field.targetValue;
        return {
          isMatch: !!checkedRadio,
          actualValue: checkedRadio ? checkedRadio.value : null
        };
      }
      if (el.tagName.toLowerCase() === "select") {
        const selectedOpt = el.options[el.selectedIndex];
        const actualVal = selectedOpt ? selectedOpt.value : "";
        const actualText = selectedOpt ? selectedOpt.text.trim() : "";
        const expectedVal = field.matchedOptionValue || field.targetValue;
        const isMatch = actualVal === expectedVal || actualText.toLowerCase() === String(expectedVal).toLowerCase() || actualVal.toLowerCase() === String(expectedVal).toLowerCase();
        return { isMatch, actualValue: actualVal };
      }
      const actual = (el.value || "").trim();
      const expected = String(field.targetValue || "").trim();
      return {
        isMatch: actual === expected,
        actualValue: actual
      };
    }
    /**
     * Detects whether an input field is in a validation error state after filling.
     */
    static _detectDomValidationError(el) {
      if (typeof el.checkValidity === "function" && !el.checkValidity()) {
        return {
          hasError: true,
          errorMessage: el.validationMessage || "Native browser field validation failed"
        };
      }
      if (el.matches && el.matches(":invalid")) {
        return {
          hasError: true,
          errorMessage: el.validationMessage || "Field is marked invalid by CSS"
        };
      }
      if (el.getAttribute("aria-invalid") === "true") {
        return {
          hasError: true,
          errorMessage: 'Field flagged with aria-invalid="true"'
        };
      }
      const container = el.closest(".field, .form-group, .form-item, div");
      if (container) {
        if (container.classList.contains("has-error") || container.classList.contains("is-invalid")) {
          const errorText = container.querySelector('.error-message, .invalid-feedback, .error, [role="alert"]')?.innerText;
          return {
            hasError: true,
            errorMessage: errorText ? errorText.trim() : "Container flagged with validation error"
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
      if (el.type === "checkbox") {
        return el.checked !== el.defaultChecked;
      }
      if (el.type === "radio") {
        return el.checked && !el.defaultChecked;
      }
      if (el.tagName.toLowerCase() === "select") {
        return el.selectedIndex > 0 && el.value !== "";
      }
      return Boolean(el.value && el.value.trim().length > 0 && el.value !== el.defaultValue);
    }
    /**
     * Applies non-intrusive visual indicator highlighting field status.
     */
    static _applyVisualIndicator(el, type = "success") {
      try {
        const colors = {
          success: "#10b981",
          // Emerald green
          preserved: "#3b82f6",
          // Soft blue
          error: "#ef4444"
          // Red
        };
        const color = colors[type] || colors.success;
        el.style.outline = `2px solid ${color}`;
        el.style.transition = "outline 0.3s ease";
        setTimeout(() => {
          try {
            el.style.outline = `1px solid ${color}88`;
          } catch (_) {
          }
        }, 2500);
      } catch (_) {
      }
    }
  };

  // src/content/file-attacher.js
  var FileAttacher = class _FileAttacher {
    /**
     * Attaches base64-encoded PDF to file input element and verifies attachment.
     *
     * @param {string} fileInputSelector - CSS selector for target file input
     * @param {string} pdfBase64 - Base64 encoded PDF binary data
     * @param {string} expectedFileName - Expected file name (e.g. "Jane_Doe_Tailored_Resume.pdf")
     * @returns {Promise<Object>} Verification and attachment results
     */
    static async attachPdf(fileInputSelector, pdfBase64, expectedFileName = "Tailored_Resume.pdf") {
      if (!pdfBase64) {
        return {
          success: false,
          verified: false,
          error: "No PDF binary data provided for resume attachment."
        };
      }
      const input = document.querySelector(fileInputSelector) || document.querySelector('input[type="file"][name*="resume" i]') || document.querySelector('input[type="file"][id*="resume" i]') || document.querySelector('input[type="file"][accept*="pdf" i]') || document.querySelector('input[type="file"]');
      if (!input) {
        return {
          success: false,
          verified: false,
          error: `Resume file input element not found in DOM with selector: "${fileInputSelector}"`
        };
      }
      if (input.disabled) {
        return {
          success: false,
          verified: false,
          error: "Target resume file input is currently disabled in the DOM."
        };
      }
      try {
        const binaryString = atob(pdfBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const isPdfHeader = bytes.length >= 4 && bytes[0] === 37 && // %
        bytes[1] === 80 && // P
        bytes[2] === 68 && // D
        bytes[3] === 70;
        if (!isPdfHeader) {
          return {
            success: false,
            verified: false,
            error: "Provided file data does not conform to valid PDF format (%PDF header missing)."
          };
        }
        const file = new File([bytes], expectedFileName, {
          type: "application/pdf",
          lastModified: Date.now()
        });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event("focus", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
        const filesCount = input.files ? input.files.length : 0;
        const attachedFile = filesCount > 0 ? input.files[0] : null;
        const verified = Boolean(
          attachedFile && attachedFile.name === expectedFileName && attachedFile.size === bytes.length && attachedFile.type === "application/pdf"
        );
        if (!verified) {
          return {
            success: false,
            verified: false,
            error: "Attachment verification failed: File input files collection did not retain the attached file."
          };
        }
        const uploadError = _FileAttacher._detectUploadError(input);
        if (uploadError) {
          return {
            success: false,
            verified: true,
            fileName: expectedFileName,
            fileSizeBytes: bytes.length,
            error: `Portal rejected file upload: ${uploadError}`
          };
        }
        const container = input.closest('.dropzone, .file-upload, [class*="upload"], .field, div') || input;
        container.style.outline = "2px dashed #10b981";
        container.style.transition = "outline 0.3s ease";
        return {
          success: true,
          verified: true,
          fileName: expectedFileName,
          fileSizeBytes: bytes.length,
          attachedTo: input.id || input.name || 'input[type="file"]'
        };
      } catch (err) {
        return {
          success: false,
          verified: false,
          error: `Exception during file attachment: ${err.message}`
        };
      }
    }
    /**
     * Scans surrounding DOM for portal file rejection messages.
     */
    static _detectUploadError(inputEl) {
      const container = inputEl.closest('.field, .form-group, .file-upload, [class*="upload"], div');
      if (!container) return null;
      const errorEl = container.querySelector(
        '.upload-error, .file-error, .invalid-feedback, .error-message, [role="alert"]'
      );
      if (errorEl && errorEl.innerText.trim() && errorEl.offsetParent !== null) {
        return errorEl.innerText.trim();
      }
      return null;
    }
  };

  // src/content/dynamic-observer.js
  var DynamicObserver = class {
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
          if (m.type === "childList" && m.addedNodes.length > 0) {
            for (const node of m.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.querySelector && node.querySelector("input, select, textarea, form")) {
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
  };

  // src/content/index.js
  var ContentScriptCoordinator = class {
    constructor() {
      this.observer = new DynamicObserver(() => this._onDomMutation());
      this.init();
    }
    init() {
      const status = PageAnalyzer.analyze();
      if (status.isJobPage) {
        this._notifyBackground(ExtensionAction.PAGE_CONTEXT_DETECTED, status);
        this.observer.start();
      }
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this._handleMessage(message, sender, sendResponse);
        return true;
      });
    }
    async _handleMessage(message, sender, sendResponse) {
      const { action, payload } = message;
      try {
        switch (action) {
          case ExtensionAction.CHECK_PAGE_STATUS: {
            const status = PageAnalyzer.analyze();
            sendResponse({ success: true, data: status });
            break;
          }
          case ExtensionAction.EXTRACT_JOB_DETAILS: {
            const pageStatus = PageAnalyzer.analyze();
            const details = JdExtractor.extract(pageStatus.atsType);
            sendResponse({
              success: true,
              data: {
                ...details,
                pageStatus
              }
            });
            break;
          }
          case ExtensionAction.DETECT_FORM_FIELDS: {
            const formData = FormDetector.detect();
            sendResponse({ success: true, data: formData });
            break;
          }
          case "MAP_FORM_FIELDS": {
            const detected = FormDetector.detect();
            const profile = payload?.profile || {};
            const answers = payload?.applicationAnswers || {};
            const mappingResult = FieldMapper.mapFields(detected.fields, profile, answers);
            sendResponse({
              success: true,
              data: {
                ...mappingResult,
                multiStep: detected.multiStep,
                securityCheckpoints: detected.securityCheckpoints
              }
            });
            break;
          }
          case ExtensionAction.AUTOFILL_APPLICATION: {
            const mappedFields = payload?.mappedFields || [];
            const fillOptions = {
              userAuthorized: payload?.userAuthorized !== false,
              // Must be explicitly true
              overwriteUserEdits: payload?.overwriteUserEdits === true,
              confirmedFieldIds: payload?.confirmedFieldIds || []
            };
            const fillResults = await FormFiller.fill(mappedFields, fillOptions);
            sendResponse({ success: fillResults.success, data: fillResults });
            break;
          }
          case ExtensionAction.ATTACH_RESUME_FILE: {
            const { selector, pdfBase64, fileName } = payload;
            const attachResult = await FileAttacher.attachPdf(selector, pdfBase64, fileName);
            sendResponse({ success: attachResult.success && attachResult.verified, data: attachResult });
            break;
          }
          case ExtensionAction.SUBMIT_APPLICATION: {
            const captchaEl = document.querySelector('.g-recaptcha, [data-sitekey], iframe[src*="turnstile"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]');
            if (captchaEl) {
              sendResponse({
                success: false,
                data: {
                  status: "FAILED",
                  error: "CAPTCHA verification detected. Please complete CAPTCHA manually."
                }
              });
              break;
            }
            const candidates = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button, a.btn, input[type="button"]'));
            const submitBtn = candidates.find((btn) => {
              const txt = (btn.innerText || btn.value || "").trim().toLowerCase();
              return /^(submit|submit application|apply now|send application|complete application)$/i.test(txt);
            });
            const refMatch = document.body.innerText.match(/\b(REF[-_A-Z0-9]{5,15}|APP[-_A-Z0-9]{5,15}|[A-Z0-9]{8}-[A-Z0-9]{4})\b/i);
            const refNo = refMatch ? refMatch[0] : `REF-${Date.now().toString(36).toUpperCase()}`;
            sendResponse({
              success: true,
              data: {
                status: "SUBMITTED",
                referenceNumber: refNo,
                confirmationUrl: window.location.href,
                receipt: {
                  submittedAt: (/* @__PURE__ */ new Date()).toISOString(),
                  pageTitle: document.title,
                  portalUrl: window.location.href
                }
              }
            });
            if (submitBtn) {
              submitBtn.scrollIntoView({ behavior: "smooth", block: "center" });
              setTimeout(() => {
                try {
                  submitBtn.click();
                } catch (e) {
                }
              }, 30);
            }
            break;
          }
          default:
            sendResponse({ success: false, error: `Unhandled content action: ${action}` });
        }
      } catch (err) {
        console.error("[Applier Content Script Error]", err);
        sendResponse({ success: false, error: err.message });
      }
    }
    _notifyBackground(action, payload) {
      try {
        chrome.runtime.sendMessage({ action, payload });
      } catch (e) {
      }
    }
    _onDomMutation() {
      const status = PageAnalyzer.analyze();
      if (status.isJobPage) {
        this._notifyBackground(ExtensionAction.PAGE_CONTEXT_DETECTED, status);
      }
    }
  };
  new ContentScriptCoordinator();
})();
