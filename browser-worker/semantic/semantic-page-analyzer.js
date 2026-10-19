/**
 * Semantic Page Analyzer
 * Applier 2.0 — Phase 5: Semantic Page Understanding
 *
 * Converts a canonical BrowserObservation into a validated SemanticPageModel.
 * Understands WHAT the page and its fields mean without generating execution selectors.
 */

import crypto from 'crypto';
import { validateSemanticPageModel } from '../../shared/validators/index.js';

// Canonical Page Types
export const PAGE_TYPES = Object.freeze({
  LANDING: 'LANDING',
  LOGIN: 'LOGIN',
  REGISTRATION: 'REGISTRATION',
  APPLICATION_FORM: 'APPLICATION_FORM',
  DOCUMENT_UPLOAD: 'DOCUMENT_UPLOAD',
  REVIEW: 'REVIEW',
  PAYMENT: 'PAYMENT',
  OTP: 'OTP',
  CAPTCHA: 'CAPTCHA',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN'
});

// Semantic field heuristic rules (evaluated in strict priority order)
const SEMANTIC_FIELD_PATTERNS = [
  {
    type: 'applicant.email',
    pattern: /\b(email|e-mail|mail\s*address)\b/i,
    reason: 'Email address field pattern recognized in label/attributes.',
    confidence: 0.98
  },
  {
    type: 'applicant.phone',
    pattern: /\b(phone|mobile|contact\s*no|telephone|cell)\b/i,
    reason: 'Telephone or mobile contact number pattern recognized.',
    confidence: 0.96
  },
  {
    type: 'applicant.fatherName',
    pattern: /\b(father|father'?s?\s*name|parent'?s?\s*name|guardian)\b/i,
    reason: 'Field specifically references father or guardian name.',
    confidence: 0.95
  },
  {
    type: 'applicant.motherName',
    pattern: /\b(mother|mother'?s?\s*name)\b/i,
    reason: 'Field specifically references mother name.',
    confidence: 0.95
  },
  {
    type: 'education.college',
    pattern: /\b(college|institution|institute|university|school|campus)\b/i,
    reason: 'Educational institution or college name recognized.',
    confidence: 0.93
  },
  {
    type: 'education.degree',
    pattern: /\b(degree|course|qualification|branch|major|stream|program)\b/i,
    reason: 'Educational degree or academic course recognized.',
    confidence: 0.92
  },
  {
    type: 'education.cgpa',
    pattern: /\b(cgpa|gpa|percentage|marks|grade|score|aggregate)\b/i,
    reason: 'Academic performance metric (CGPA/marks) recognized.',
    confidence: 0.94
  },
  {
    type: 'financial.income',
    pattern: /\b(income|annual\s*income|family\s*income|salary|earnings)\b/i,
    reason: 'Household or family annual income recognized.',
    confidence: 0.94
  },
  {
    type: 'document.identity',
    pattern: /\b(aadhaar|pan|passport|id\s*proof|identity|voter)\b/i,
    reason: 'Identity verification document upload or number.',
    confidence: 0.91
  },
  {
    type: 'auth.password',
    pattern: /\b(password|passwd|pwd|secret)\b/i,
    reason: 'Authentication credential field.',
    confidence: 0.97
  },
  {
    type: 'applicant.dateOfBirth',
    pattern: /\b(dob|date\s*of\s*birth|birth\s*date|born\s*on)\b/i,
    reason: 'Date of birth identifier detected in label or attribute.',
    confidence: 0.96
  },
  {
    type: 'applicant.gender',
    pattern: /\b(gender|sex)\b/i,
    reason: 'Gender or sex selection identifier detected.',
    confidence: 0.94
  },
  {
    type: 'applicant.fullName',
    pattern: /\b(full\s*name|applicant\s*name|candidate\s*name|student\s*name|first\s*name|last\s*name|legal\s*name|your\s*name|name)\b/i,
    reason: 'Field text/label explicitly indicates applicant official name.',
    confidence: 0.95
  },
  {
    type: 'applicant.address',
    pattern: /\b(address|street|residence|domicile|postal\s*address|permanent\s*address)\b/i,
    reason: 'Residential or permanent address field recognized.',
    confidence: 0.92
  }
];

const AMBIGUOUS_PATTERNS = /\b(code|ref|id|temp|query|value|arg|field|data|other|misc|check|item)\b/i;

export class SemanticPageAnalyzer {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxCacheSize = options.maxCacheSize || 200;
  }

  /**
   * Deterministic state hash computed from URL and element signatures.
   */
  computeStateHash(observation) {
    const url = observation?.url || '';
    const elements = observation?.elements || [];
    const signatures = elements
      .map(e => `${e.elementId || ''}|${e.tag || ''}|${e.name || ''}|${e.label || ''}|${e.placeholder || ''}`)
      .sort();

    const raw = `${url}:::${signatures.join('|')}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Classifies the page into a canonical PageType enum.
   */
  classifyPageType(observation) {
    const url = (observation?.url || '').toLowerCase();
    const title = (observation?.title || '').toLowerCase();
    const elements = observation?.elements || [];
    const textSample = (observation?.page?.visibleTextSample || '').toLowerCase();

    // 1. CAPTCHA
    const hasCaptcha = elements.some(e => {
      const cues = `${e.name || ''} ${e.label || ''} ${e.id || ''}`.toLowerCase();
      return cues.includes('captcha') || cues.includes('recaptcha') || cues.includes('hcaptcha');
    });
    if (hasCaptcha || url.includes('captcha')) {
      return {
        pageType: PAGE_TYPES.CAPTCHA,
        confidence: 0.95,
        reason: 'CAPTCHA challenge widget detected in page elements.'
      };
    }

    // 2. OTP
    const hasOtp = elements.some(e => {
      const cues = `${e.name || ''} ${e.label || ''} ${e.placeholder || ''}`.toLowerCase();
      return /\b(otp|one\s*time\s*password|verification\s*code)\b/i.test(cues);
    });
    if (hasOtp || url.includes('otp') || url.includes('verify-phone')) {
      return {
        pageType: PAGE_TYPES.OTP,
        confidence: 0.94,
        reason: 'One-time password (OTP) verification field detected.'
      };
    }

    // 3. Document Upload
    const fileInputs = elements.filter(e => e.tag === 'input' && e.type === 'file');
    if (fileInputs.length >= 2 || (fileInputs.length >= 1 && (url.includes('upload') || url.includes('documents')))) {
      return {
        pageType: PAGE_TYPES.DOCUMENT_UPLOAD,
        confidence: 0.92,
        reason: `Page contains ${fileInputs.length} file upload inputs for document submission.`
      };
    }

    // 4. Payment
    if (url.includes('pay') || url.includes('checkout') || title.includes('payment') || title.includes('checkout')) {
      return {
        pageType: PAGE_TYPES.PAYMENT,
        confidence: 0.93,
        reason: 'Payment or checkout keywords identified in URL or title.'
      };
    }

    // 5. Success / Confirmation
    if (url.includes('success') || url.includes('complete') || url.includes('thank-you') ||
        title.includes('success') || title.includes('application submitted') || title.includes('confirmation')) {
      return {
        pageType: PAGE_TYPES.SUCCESS,
        confidence: 0.95,
        reason: 'Submission success or confirmation indicators identified.'
      };
    }

    // 6. Error
    if (url.includes('error') || title.includes('404') || title.includes('error') || title.includes('not found')) {
      return {
        pageType: PAGE_TYPES.ERROR,
        confidence: 0.90,
        reason: 'Error page indicator detected in page title or URL.'
      };
    }

    // 7. Login vs Registration
    const hasPassword = elements.some(e => e.type === 'password');
    if (hasPassword) {
      if (url.includes('register') || url.includes('signup') || title.includes('register') || title.includes('sign up')) {
        return {
          pageType: PAGE_TYPES.REGISTRATION,
          confidence: 0.92,
          reason: 'Registration cues combined with credential inputs detected.'
        };
      }
      return {
        pageType: PAGE_TYPES.LOGIN,
        confidence: 0.91,
        reason: 'Authentication form with password input detected.'
      };
    }

    // 8. Review
    if (url.includes('review') || title.includes('review') || title.includes('preview') || url.includes('preview')) {
      return {
        pageType: PAGE_TYPES.REVIEW,
        confidence: 0.88,
        reason: 'Application review/preview keywords identified.'
      };
    }

    // 9. Application Form
    const inputCount = elements.filter(e => ['input', 'select', 'textarea'].includes(e.tag)).length;
    if (inputCount >= 3 || url.includes('apply') || url.includes('form') || title.includes('apply') || title.includes('application')) {
      return {
        pageType: PAGE_TYPES.APPLICATION_FORM,
        confidence: 0.89,
        reason: `Multi-field form detected with ${inputCount} interactive input controls.`
      };
    }

    // 10. Landing Page
    if (url.endsWith('/') || url.endsWith('.com') || url.endsWith('.gov.in') || url.endsWith('.org') || url.includes('home')) {
      return {
        pageType: PAGE_TYPES.LANDING,
        confidence: 0.75,
        reason: 'Root portal or home landing page detected.'
      };
    }

    return {
      pageType: PAGE_TYPES.UNKNOWN,
      confidence: 0.40,
      reason: 'No distinctive page type indicators found.'
    };
  }

  /**
   * Resolves semantic meaning for an element.
   */
  resolveFieldSemantic(element) {
    const label = (element.label || '').trim();
    const name = (element.name || '').trim();
    const placeholder = (element.placeholder || '').trim();
    const text = (element.text || '').trim();
    const tag = (element.tag || '').toLowerCase();
    const elemType = (element.type || '').toLowerCase();
    const role = (element.role || '').toLowerCase();

    // Action elements are not profile data fields
    if (['button', 'a'].includes(tag) || ['submit', 'button', 'reset'].includes(elemType) || role === 'button') {
      return {
        semanticType: 'UNKNOWN_FIELD',
        confidence: 0.30,
        reason: `Element is an action control (${tag}/${elemType}), not a profile data field.`,
        isResolved: false
      };
    }

    // HTML input type explicit indicators
    if (elemType === 'email') {
      return {
        semanticType: 'applicant.email',
        confidence: 0.98,
        reason: 'HTML input element type is explicitly email.',
        isResolved: true
      };
    }
    if (elemType === 'tel') {
      return {
        semanticType: 'applicant.phone',
        confidence: 0.96,
        reason: 'HTML input element type is explicitly tel.',
        isResolved: true
      };
    }
    if (elemType === 'password') {
      return {
        semanticType: 'auth.password',
        confidence: 0.98,
        reason: 'HTML input element type is explicitly password.',
        isResolved: true
      };
    }

    const cues = `${label} ${name} ${placeholder} ${text}`.trim();

    // Check for ambiguous or generic markers
    const isAmbiguous = AMBIGUOUS_PATTERNS.test(cues) || cues.length < 3;

    // Pattern matching
    for (const rule of SEMANTIC_FIELD_PATTERNS) {
      if (rule.pattern.test(cues)) {
        if (isAmbiguous && !(/\b(father|mother)\b/i.test(cues))) {
          return {
            semanticType: rule.type,
            confidence: 0.50,
            reason: `Ambiguous matching cue ('${cues}'). Kept unresolved to prevent incorrect mapping.`,
            isResolved: false
          };
        }
        return {
          semanticType: rule.type,
          confidence: rule.confidence,
          reason: rule.reason,
          isResolved: rule.confidence >= 0.70
        };
      }
    }

    return {
      semanticType: 'UNKNOWN_FIELD',
      confidence: 0.20,
      reason: `No recognized applicant semantic pattern matched for cues: '${cues}'.`,
      isResolved: false
    };
  }

  /**
   * Converts a BrowserObservation into a validated SemanticPageModel.
   * STRICT GUARANTEE: NEVER generates browser execution selectors.
   *
   * @param {object} observation Valid canonical BrowserObservation
   * @param {object} [options]
   * @returns {Promise<object>} SemanticPageModel
   */
  async analyze(observation, options = {}) {
    if (!observation || typeof observation !== 'object') {
      throw new Error('SemanticPageAnalyzer: Observation must be a non-null object');
    }

    // 1. Cache Check
    const cacheKey = this.computeStateHash(observation);
    if (!options.bypassCache && this.cache.has(cacheKey)) {
      const cached = JSON.parse(JSON.stringify(this.cache.get(cacheKey)));
      cached.metadata = {
        ...cached.metadata,
        cached: true
      };
      return cached;
    }

    const startTime = Date.now();
    const modelId = `sem_${crypto.randomUUID()}`;
    const observationId = observation.observationId || `obs_${crypto.randomUUID()}`;
    const url = observation.url || 'about:blank';
    const elements = Array.isArray(observation.elements) ? observation.elements : [];

    // 2. Classify Page Type
    const { pageType, confidence: pageTypeConfidence, reason: pageTypeReason } = this.classifyPageType(observation);

    // 3. Resolve Field Semantics
    let resolvedCount = 0;
    const fields = [];

    for (const el of elements) {
      const elementId = el.elementId;
      if (!elementId) continue;

      const semantic = this.resolveFieldSemantic(el);
      if (semantic.isResolved) {
        resolvedCount++;
      }

      // CRITICAL: Pure semantic representation — zero execution selectors
      fields.push({
        elementId,
        semanticType: semantic.semanticType,
        confidence: Math.round(semantic.confidence * 100) / 100,
        reason: semantic.reason,
        isResolved: semantic.isResolved
      });
    }

    const durationMs = Date.now() - startTime;
    const summary = `Semantic model for ${pageType} page at ${url}. Total fields: ${fields.length}, Resolved: ${resolvedCount}.`;

    const model = {
      schemaVersion: '2.0.0',
      modelId,
      observationId,
      url,
      pageType,
      pageTypeConfidence: Math.round(pageTypeConfidence * 100) / 100,
      pageTypeReason,
      fields,
      summary,
      metadata: {
        analyzedAt: new Date().toISOString(),
        durationMs,
        cached: false,
        modelUsed: options.modelUsed || 'semantic-engine-v2',
        fieldCount: fields.length,
        resolvedCount
      }
    };

    // 4. Validate Against Canonical Contract
    const validation = validateSemanticPageModel(model);
    if (!validation.valid) {
      const errorMsg = validation.errors?.map(e => e.message).join(', ') || 'Schema validation failed';
      throw new Error(`SemanticPageAnalyzer: Model failed canonical schema validation: ${errorMsg}`);
    }

    // 5. Cache result
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(cacheKey, JSON.parse(JSON.stringify(model)));

    return model;
  }
}

export const defaultSemanticPageAnalyzer = new SemanticPageAnalyzer();
export default defaultSemanticPageAnalyzer;
