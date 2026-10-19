/**
 * Context Optimization Cache Engine
 * Applier 2.0 — Phase 21: Large Application and Context Optimization
 *
 * Provides multi-tiered caching for:
 * 1. Semantic page analysis (keyed by pageFingerprint)
 * 2. Field mappings (keyed by sectionFingerprint)
 * 3. Website knowledge (keyed by domain + structuralHash)
 *
 * Strict Rule:
 * Invalidate cache strictly when the page fingerprint changes.
 */

import crypto from 'crypto';

export class ContextOptimizationCache {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 500;
    this.ttlMs = options.ttlMs || 30 * 60 * 1000; // 30 minutes default

    // In-memory multi-tiered stores
    this.pageAnalysisStore = new Map();
    this.fieldMappingStore = new Map();
    this.websiteKnowledgeStore = new Map();

    // Fingerprint index tracking (domain/page -> active fingerprint)
    this.activeFingerprints = new Map();
  }

  /**
   * Generates a deterministic SHA-256 fingerprint for a page DOM or structure.
   */
  static computePageFingerprint(pageStructure) {
    if (!pageStructure) return 'fp_empty';
    const raw = typeof pageStructure === 'string'
      ? pageStructure
      : JSON.stringify(pageStructure);
    return 'pfp_' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  /**
   * Generates a deterministic SHA-256 fingerprint for a section and its field group.
   */
  static computeSectionFingerprint(section) {
    if (!section) return 'sfp_empty';
    const fieldSignatures = (section.fieldGroups || []).flatMap(g =>
      (g.fields || []).map(f => `${f.name || f.fieldId}:${f.type || 'text'}:${f.label || ''}`)
    );
    const raw = `${section.sectionName || ''}|${fieldSignatures.join(';')}`;
    return 'sfp_' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  /**
   * Verifies if a page fingerprint has changed, invalidating stale cache if mutated.
   *
   * @param {string} pageKey Unique page identifier (e.g. domain + urlPath)
   * @param {string} currentFingerprint Live computed fingerprint
   * @returns {{ changed: boolean, previousFingerprint: string|null }}
   */
  checkAndInvalidateOnDrift(pageKey, currentFingerprint) {
    const previous = this.activeFingerprints.get(pageKey);
    if (!previous) {
      this.activeFingerprints.set(pageKey, currentFingerprint);
      return { changed: false, previousFingerprint: null };
    }

    if (previous !== currentFingerprint) {
      // Fingerprint drifted! Invalidate all cached data tied to previous fingerprint
      this.invalidatePage(previous);
      this.activeFingerprints.set(pageKey, currentFingerprint);
      return { changed: true, previousFingerprint: previous };
    }

    return { changed: false, previousFingerprint: previous };
  }

  // ─────────────────────────────────────────────────────────────
  // 1. SEMANTIC PAGE ANALYSIS CACHE
  // ─────────────────────────────────────────────────────────────

  getPageAnalysis(pageFingerprint) {
    const entry = this.pageAnalysisStore.get(pageFingerprint);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.pageAnalysisStore.delete(pageFingerprint);
      return null;
    }
    return entry.data;
  }

  setPageAnalysis(pageFingerprint, analysisData) {
    this._evictOldestIfNeeded(this.pageAnalysisStore);
    this.pageAnalysisStore.set(pageFingerprint, {
      data: JSON.parse(JSON.stringify(analysisData)),
      timestamp: Date.now()
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. FIELD MAPPINGS CACHE (BY SECTION FINGERPRINT)
  // ─────────────────────────────────────────────────────────────

  getFieldMappings(sectionFingerprint) {
    const entry = this.fieldMappingStore.get(sectionFingerprint);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.fieldMappingStore.delete(sectionFingerprint);
      return null;
    }
    return entry.mappings;
  }

  setFieldMappings(sectionFingerprint, mappings) {
    this._evictOldestIfNeeded(this.fieldMappingStore);
    this.fieldMappingStore.set(sectionFingerprint, {
      mappings: JSON.parse(JSON.stringify(mappings)),
      timestamp: Date.now()
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. WEBSITE KNOWLEDGE CACHE
  // ─────────────────────────────────────────────────────────────

  getWebsiteKnowledge(domainKey) {
    const entry = this.websiteKnowledgeStore.get(domainKey);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.websiteKnowledgeStore.delete(domainKey);
      return null;
    }
    return entry.knowledge;
  }

  setWebsiteKnowledge(domainKey, knowledge) {
    this._evictOldestIfNeeded(this.websiteKnowledgeStore);
    this.websiteKnowledgeStore.set(domainKey, {
      knowledge: JSON.parse(JSON.stringify(knowledge)),
      timestamp: Date.now()
    });
  }

  // ─────────────────────────────────────────────────────────────
  // INVALIDATION UTILITIES
  // ─────────────────────────────────────────────────────────────

  /**
   * Explicitly invalidates all cache entries tied to a page fingerprint.
   */
  invalidatePage(pageFingerprint) {
    this.pageAnalysisStore.delete(pageFingerprint);

    // Invalidate any field mapping entries associated with this page fingerprint prefix
    for (const key of this.fieldMappingStore.keys()) {
      if (key.includes(pageFingerprint)) {
        this.fieldMappingStore.delete(key);
      }
    }
  }

  /**
   * Clears all cache stores.
   */
  clear() {
    this.pageAnalysisStore.clear();
    this.fieldMappingStore.clear();
    this.websiteKnowledgeStore.clear();
    this.activeFingerprints.clear();
  }

  _evictOldestIfNeeded(store) {
    if (store.size >= this.maxEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey) store.delete(oldestKey);
    }
  }
}

export const defaultContextOptimizationCache = new ContextOptimizationCache();
export default defaultContextOptimizationCache;
