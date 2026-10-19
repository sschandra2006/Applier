/**
 * WebsiteFingerprintService — Applier 2.0 (Phase 19)
 * Learns successful portal behavior, detects website structural changes,
 * promotes candidate knowledge to trusted knowledge, demotes failing strategies,
 * and guards sensitive user secrets.
 */

import crypto from 'crypto';
import { WebsiteFingerprint } from './website-fingerprint.model.js';
import { validateWebsiteFingerprint } from '../../../shared/validators/index.js';

// Regex identifying sensitive fields that must never store raw input values
const SENSITIVE_FIELD_REGEX = /(password|passcode|secret|pin|otp|captcha|ssn|aadhaar|pan|taxid|cvv|cardnumber|token)/i;

export class WebsiteFingerprintService {
  constructor(options = {}) {
    // In-memory registry fallback for zero-dependency test execution & fast caching
    this.memoryStore = new Map();
    this.useMemoryFallback = options.useMemoryFallback ?? true;
  }

  /**
   * Generates a deterministic structural hash from page metadata or tag layout
   * @param {object|string} structure Layout indicators (forms, buttons, inputs, titles)
   * @returns {string} SHA-256 structural hash prefix
   */
  computeStructuralHash(structure) {
    if (!structure) return 'hash_empty_structure';
    const normalized = typeof structure === 'string' 
      ? structure 
      : JSON.stringify(structure, Object.keys(structure).sort());
    return 'struct_' + crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  /**
   * Retrieves active fingerprint for domain
   * @param {string} domain Target domain e.g. 'careers.example.com'
   * @returns {Promise<object|null>}
   */
  async getFingerprint(domain) {
    if (!domain) return null;
    const cleanDomain = domain.toLowerCase().trim();

    // Check memory store first
    if (this.memoryStore.has(cleanDomain)) {
      const stored = this.memoryStore.get(cleanDomain);
      if (stored.status === 'ACTIVE') return stored;
    }

    // Check Mongoose model if available
    try {
      if (WebsiteFingerprint.db?.readyState === 1) {
        const doc = await WebsiteFingerprint.findOne({ domain: cleanDomain, status: 'ACTIVE' }).lean();
        if (doc) {
          this.memoryStore.set(cleanDomain, doc);
          return doc;
        }
      }
    } catch (_) {
      // Fallback gracefully to memory store
    }

    return null;
  }

  /**
   * Sanitizes payload ensuring zero raw sensitive secrets are stored
   * @param {object} payload Learned actions and form data
   * @returns {object} Scrubbed payload
   */
  sanitizeKnowledge(payload) {
    if (!payload || typeof payload !== 'object') return payload;

    const scrubbed = JSON.parse(JSON.stringify(payload));

    const scrubObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;

      for (const key of Object.keys(obj)) {
        if (SENSITIVE_FIELD_REGEX.test(key)) {
          // Replace sensitive data with structural flag
          if (typeof obj[key] === 'string' || typeof obj[key] === 'number') {
            obj[key] = '[SCRUBBED_SENSITIVE_DATA]';
          }
        } else if (typeof obj[key] === 'object') {
          scrubObject(obj[key]);
        }
      }
    };

    scrubObject(scrubbed);
    return scrubbed;
  }

  /**
   * Records initial execution knowledge (FIRST VISIT) as CANDIDATE tier
   */
  async recordFirstVisit(domain, portalInfo, executionData = {}) {
    const cleanDomain = domain.toLowerCase().trim();
    const structuralHash = portalInfo.structuralHash || this.computeStructuralHash(portalInfo);

    // Sanitize any input values from executionData
    const sanitizedData = this.sanitizeKnowledge(executionData);

    const semanticFields = (sanitizedData.fields || []).map(f => {
      const isSensitive = SENSITIVE_FIELD_REGEX.test(f.semanticTarget || '');
      return {
        semanticTarget: f.semanticTarget,
        learnedStrategies: [{
          strategy: f.strategy || 'CSS',
          // Store only selector, NEVER user-provided input values
          selector: f.selector || `#${f.semanticTarget.replace('.', '_')}`,
          confidence: isSensitive ? 0.5 : 0.65, // Lower initial confidence for sensitive triggers
          successCount: 1,
          failureCount: 0,
          tier: 'CANDIDATE',
          lastVerifiedAt: new Date().toISOString()
        }],
        confidence: isSensitive ? 0.5 : 0.65,
        tier: 'CANDIDATE'
      };
    });

    const successfulLocatorStrategies = semanticFields.map(sf => {
      const topStrat = sf.learnedStrategies[0];
      return {
        semanticTarget: sf.semanticTarget,
        strategy: topStrat.strategy,
        selector: topStrat.selector,
        confidence: topStrat.confidence,
        tier: topStrat.tier
      };
    });

    const pageFingerprints = (sanitizedData.pages || []).map(p => ({
      pageId: p.pageId || `page_${Math.random().toString(36).slice(2, 8)}`,
      semanticPageType: p.semanticPageType || 'APPLICATION_FORM',
      urlPattern: p.urlPattern || `^https://${cleanDomain}`,
      titlePattern: p.titlePattern || null,
      domSignature: p.domSignature || structuralHash,
      confidence: 0.65,
      tier: 'CANDIDATE'
    }));

    const workflowTransitions = (sanitizedData.transitions || []).map(t => ({
      fromPage: t.fromPage,
      toPage: t.toPage,
      triggerAction: t.triggerAction,
      confidence: 0.65,
      tier: 'CANDIDATE',
      successCount: 1,
      failureCount: 0
    }));

    const uploadConstraints = (sanitizedData.uploadConstraints || []).map(u => ({
      semanticField: u.semanticField || 'documents.resume',
      acceptedExtensions: u.acceptedExtensions || ['.pdf', '.docx'],
      maxSizeBytes: u.maxSizeBytes || 5242880,
      observedAcceptAttribute: u.observedAcceptAttribute || null,
      confidence: 0.70
    }));

    const checkpointBehavior = (sanitizedData.checkpoints || []).map(c => ({
      pageType: c.pageType || 'APPLICATION_FORM',
      checkpointType: c.checkpointType || 'CAPTCHA',
      observedStep: c.observedStep ?? 1,
      frequency: 0.5,
      detectionSignals: c.detectionSignals || []
    }));

    const recoveryStrategies = (sanitizedData.recoveryStrategies || []).map(r => ({
      failureType: r.failureType || 'UNEXPECTED_MODAL',
      successfulRecoveryAction: r.successfulRecoveryAction || 'DISMISS_MODAL',
      confidence: 0.70,
      successCount: 1,
      failureCount: 0
    }));

    const fingerprint = {
      schemaVersion: '2.0.0',
      fingerprintId: `wfp_${cleanDomain.replace(/[^a-zA-Z0-9]/g, '_')}_v1`,
      domain: cleanDomain,
      portalIdentity: {
        name: portalInfo.name || 'Discovered Portal',
        portalType: portalInfo.portalType || 'CUSTOM',
        framework: portalInfo.framework || null,
        structuralHash
      },
      knowledgeVersion: 1,
      status: 'ACTIVE',
      pageFingerprints: pageFingerprints.length > 0 ? pageFingerprints : [{
        pageId: 'page_main',
        semanticPageType: 'APPLICATION_FORM',
        urlPattern: `^https://${cleanDomain}`,
        titlePattern: null,
        domSignature: structuralHash,
        confidence: 0.65,
        tier: 'CANDIDATE'
      }],
      semanticFields,
      successfulLocatorStrategies,
      workflowTransitions,
      uploadConstraints,
      checkpointBehavior,
      recoveryStrategies,
      statistics: {
        totalExecutions: 1,
        successfulExecutions: 1,
        failedExecutions: 0,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString()
      }
    };

    // Validate against canonical contract
    validateWebsiteFingerprint(fingerprint);

    // Save to memory store
    this.memoryStore.set(cleanDomain, fingerprint);

    // Save to Mongoose if connected
    try {
      if (WebsiteFingerprint.db?.readyState === 1) {
        await WebsiteFingerprint.findOneAndUpdate(
          { domain: cleanDomain, knowledgeVersion: 1 },
          fingerprint,
          { upsert: true, new: true }
        );
      }
    } catch (_) {}

    return fingerprint;
  }

  /**
   * Evaluates incoming structural DOM signature to detect if portal layout changed
   */
  detectWebsiteChange(existingFingerprint, currentStructuralHash) {
    if (!existingFingerprint || !currentStructuralHash) return false;
    const storedHash = existingFingerprint.portalIdentity?.structuralHash;
    return !!storedHash && storedHash !== currentStructuralHash;
  }

  /**
   * Handles website structural changes: invalidates stale assumptions and bumps knowledge version
   */
  async handleWebsiteChange(domain, newStructuralHash, options = {}) {
    const cleanDomain = domain.toLowerCase().trim();
    const existing = await this.getFingerprint(cleanDomain);
    if (!existing) return null;

    // Invalidate existing fingerprint
    existing.status = 'SUPERSEDED';

    const newVersion = existing.knowledgeVersion + 1;
    const newFingerprint = {
      ...JSON.parse(JSON.stringify(existing)),
      fingerprintId: `wfp_${cleanDomain.replace(/[^a-zA-Z0-9]/g, '_')}_v${newVersion}`,
      knowledgeVersion: newVersion,
      status: 'ACTIVE',
      portalIdentity: {
        ...existing.portalIdentity,
        structuralHash: newStructuralHash
      },
      // Demote stale assumptions to CANDIDATE with lower confidence
      semanticFields: existing.semanticFields.map(sf => ({
        ...sf,
        tier: 'CANDIDATE',
        confidence: Math.max(0.4, Number((sf.confidence * 0.7).toFixed(2))),
        learnedStrategies: sf.learnedStrategies.map(ls => ({
          ...ls,
          tier: 'CANDIDATE',
          confidence: Math.max(0.4, Number((ls.confidence * 0.7).toFixed(2)))
        }))
      })),
      successfulLocatorStrategies: existing.successfulLocatorStrategies.map(sl => ({
        ...sl,
        tier: 'CANDIDATE',
        confidence: Math.max(0.4, Number((sl.confidence * 0.7).toFixed(2)))
      })),
      pageFingerprints: existing.pageFingerprints.map(pf => ({
        ...pf,
        domSignature: newStructuralHash,
        tier: 'CANDIDATE',
        confidence: 0.5
      })),
      statistics: {
        ...existing.statistics,
        lastSeenAt: new Date().toISOString()
      }
    };

    validateWebsiteFingerprint(newFingerprint);

    this.memoryStore.set(cleanDomain, newFingerprint);

    try {
      if (WebsiteFingerprint.db?.readyState === 1) {
        await WebsiteFingerprint.updateOne(
          { fingerprintId: existing.fingerprintId },
          { status: 'SUPERSEDED' }
        );
        await WebsiteFingerprint.create(newFingerprint);
      }
    } catch (_) {}

    return newFingerprint;
  }

  /**
   * Records execution outcome on a REPEAT VISIT.
   * Promotes candidate knowledge to TRUSTED on repeat successes.
   * Decreases confidence on failures and invalidates stale locators.
   */
  async recordRepeatVisit(domain, executionOutcome = {}, currentStructuralHash = null) {
    const cleanDomain = domain.toLowerCase().trim();
    let fp = await this.getFingerprint(cleanDomain);

    if (!fp) {
      // First visit fallback
      return this.recordFirstVisit(cleanDomain, { name: cleanDomain, portalType: 'CUSTOM', structuralHash: currentStructuralHash }, executionOutcome);
    }

    // Check for website structural change
    if (currentStructuralHash && this.detectWebsiteChange(fp, currentStructuralHash)) {
      fp = await this.handleWebsiteChange(cleanDomain, currentStructuralHash);
    }

    const { isSuccess, verifiedFields = [], failedLocators = [] } = executionOutcome;

    fp.statistics.totalExecutions += 1;
    fp.statistics.lastSeenAt = new Date().toISOString();

    if (isSuccess) {
      fp.statistics.successfulExecutions += 1;
      fp.statistics.lastSuccessAt = new Date().toISOString();
    } else {
      fp.statistics.failedExecutions += 1;
    }

    // 1. Process Verified Successful Fields
    for (const vField of verifiedFields) {
      // Security guard: Never store sensitive values
      if (SENSITIVE_FIELD_REGEX.test(vField.semanticTarget)) {
        delete vField.value;
      }

      let fieldEntry = fp.semanticFields.find(f => f.semanticTarget === vField.semanticTarget);
      if (!fieldEntry) {
        fieldEntry = {
          semanticTarget: vField.semanticTarget,
          learnedStrategies: [],
          confidence: 0.65,
          tier: 'CANDIDATE'
        };
        fp.semanticFields.push(fieldEntry);
      }

      let stratEntry = fieldEntry.learnedStrategies.find(s => s.strategy === vField.strategy && s.selector === vField.selector);
      if (!stratEntry) {
        stratEntry = {
          strategy: vField.strategy || 'CSS',
          selector: vField.selector,
          confidence: 0.65,
          successCount: 0,
          failureCount: 0,
          tier: 'CANDIDATE',
          lastVerifiedAt: null
        };
        fieldEntry.learnedStrategies.push(stratEntry);
      }

      stratEntry.successCount += 1;
      stratEntry.lastVerifiedAt = new Date().toISOString();
      // Increase confidence
      stratEntry.confidence = Math.min(1.0, Number((stratEntry.confidence + 0.15).toFixed(2)));

      // Promote to TRUSTED if repeated and validated (>= 2 successes, >= 0.80 confidence)
      if (stratEntry.successCount >= 2 && stratEntry.confidence >= 0.80) {
        stratEntry.tier = 'TRUSTED';
        fieldEntry.tier = 'TRUSTED';
      }

      fieldEntry.confidence = Math.max(...fieldEntry.learnedStrategies.map(s => s.confidence));

      // Update successfulLocatorStrategies
      const bestStrat = [...fieldEntry.learnedStrategies].sort((a, b) => b.confidence - a.confidence)[0];
      const existingSuccessIndex = fp.successfulLocatorStrategies.findIndex(s => s.semanticTarget === vField.semanticTarget);
      const successPayload = {
        semanticTarget: vField.semanticTarget,
        strategy: bestStrat.strategy,
        selector: bestStrat.selector,
        confidence: bestStrat.confidence,
        tier: bestStrat.tier
      };

      if (existingSuccessIndex >= 0) {
        fp.successfulLocatorStrategies[existingSuccessIndex] = successPayload;
      } else {
        fp.successfulLocatorStrategies.push(successPayload);
      }
    }

    // 2. Process Failed / Stale Locators (Decreasing confidence & demoting)
    for (const fLoc of failedLocators) {
      const fieldEntry = fp.semanticFields.find(f => f.semanticTarget === fLoc.semanticTarget);
      if (fieldEntry) {
        const stratEntry = fieldEntry.learnedStrategies.find(s => s.selector === fLoc.selector);
        if (stratEntry) {
          stratEntry.failureCount += 1;
          stratEntry.confidence = Math.max(0.0, Number((stratEntry.confidence - 0.25).toFixed(2)));

          // Demote if confidence drops below threshold
          if (stratEntry.confidence < 0.40) {
            stratEntry.tier = 'DEPRECATED';
            // Remove from successful strategies
            fp.successfulLocatorStrategies = fp.successfulLocatorStrategies.filter(
              s => !(s.semanticTarget === fLoc.semanticTarget && s.selector === fLoc.selector)
            );
          }
        }
        fieldEntry.confidence = Math.max(0.0, ...fieldEntry.learnedStrategies.map(s => s.confidence));
        if (fieldEntry.learnedStrategies.every(s => s.tier === 'DEPRECATED')) {
          fieldEntry.tier = 'DEPRECATED';
        }
      }
    }

    validateWebsiteFingerprint(fp);

    this.memoryStore.set(cleanDomain, fp);

    try {
      if (WebsiteFingerprint.db?.readyState === 1) {
        await WebsiteFingerprint.updateOne({ fingerprintId: fp.fingerprintId }, fp);
      }
    } catch (_) {}

    return fp;
  }

  /**
   * Retrieves the best learned locator for a semantic target.
   * Returns TRUSTED strategies first. If only DEPRECATED or STALE exist, returns null to trigger fresh semantic resolution.
   */
  async getRecommendedLocator(domain, semanticTarget) {
    const fp = await this.getFingerprint(domain);
    if (!fp) return null;

    const learned = fp.successfulLocatorStrategies.find(s => s.semanticTarget === semanticTarget);
    if (!learned) return null;

    // Stale locator guard: if deprecated or confidence too low, do not return blindly
    if (learned.tier === 'DEPRECATED' || learned.confidence < 0.40) {
      return null;
    }

    return {
      strategy: learned.strategy,
      selector: learned.selector,
      confidence: learned.confidence,
      tier: learned.tier,
      isTrusted: learned.tier === 'TRUSTED'
    };
  }

  /**
   * Helper to record single action success or failure outcome
   */
  async recordActionOutcome(domain, { semanticTarget, strategy = 'CSS', selector, isSuccess, errorType = null }) {
    if (isSuccess) {
      return this.recordRepeatVisit(domain, {
        isSuccess: true,
        verifiedFields: [{ semanticTarget, strategy, selector }]
      });
    } else {
      return this.recordRepeatVisit(domain, {
        isSuccess: false,
        failedLocators: [{ semanticTarget, selector, errorType }]
      });
    }
  }

  /**
   * Resets local state for testing
   */
  clear() {
    this.memoryStore.clear();
  }
}

export const websiteFingerprintService = new WebsiteFingerprintService();
export default websiteFingerprintService;
