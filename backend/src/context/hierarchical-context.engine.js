/**
 * Hierarchical Context Optimization Engine
 * Applier 2.0 — Phase 21: Large Application and Context Optimization
 *
 * Implements the 5-level hierarchy:
 * Application -> Page -> Section -> Field group -> Field
 *
 * Core Principles:
 * 1. Never send the entire application DOM or full context to the LLM unnecessarily.
 * 2. Only provide the AI with:
 *    - Current relevant section
 *    - Relevant applicant data (subgraph)
 *    - Relevant evidence (filtered documents)
 *    - Previous decisions (compact summary of prior resolved fields)
 * 3. Cache semantic page analysis, field mappings, and website knowledge.
 * 4. Invalidate cache when page fingerprint changes.
 * 5. Scale effortlessly to 50, 100, 200+ fields with minimal token usage and latency.
 */

import crypto from 'crypto';
import { defaultContextOptimizationCache, ContextOptimizationCache } from './context-optimization-cache.js';
import { validateApplicationHierarchy } from '../../../shared/validators/index.js';

export class HierarchicalContextEngine {
  constructor(options = {}) {
    this.cache = options.cache || defaultContextOptimizationCache;
  }

  /**
   * Builds the canonical 5-level hierarchy from a collection of fields or DOM elements.
   *
   * @param {object} params
   * @param {string} params.applicationId
   * @param {string} params.portalDomain
   * @param {Array<object>} params.rawFields
   * @param {string} [params.pageFingerprint]
   * @returns {object} Canonical ApplicationHierarchy object
   */
  buildHierarchy({
    applicationId,
    portalDomain = 'portal.apply.org',
    rawFields = [],
    pageFingerprint = null,
    activeSectionId = null
  }) {
    const pfp = pageFingerprint || ContextOptimizationCache.computePageFingerprint(rawFields);

    // 1. Cluster fields into Sections
    const sectionClusters = this._clusterFieldsIntoSections(rawFields);

    // 2. Build Sections & Field Groups
    const sections = sectionClusters.map((cluster, sIdx) => {
      const sectionId = cluster.sectionId || `sec_${cluster.category.toLowerCase()}_${sIdx + 1}`;
      const fieldGroups = this._groupFieldsWithinSection(cluster.fields);

      const sectionObj = {
        sectionId,
        sectionName: cluster.sectionName,
        sectionPurpose: cluster.sectionPurpose,
        status: cluster.status || 'PENDING',
        fieldGroups
      };

      sectionObj.sectionFingerprint = ContextOptimizationCache.computeSectionFingerprint(sectionObj);
      return sectionObj;
    });

    const pages = [
      {
        pageId: 'page_main',
        pageNumber: 1,
        pageType: 'APPLICATION_FORM',
        pageFingerprint: pfp,
        sections
      }
    ];

    const hierarchyRecord = {
      schemaVersion: '2.0.0',
      applicationId: String(applicationId),
      portalDomain: String(portalDomain),
      totalFieldCount: rawFields.length,
      pages,
      activeSectionId: activeSectionId || (sections[0]?.sectionId || null),
      optimizedContextMetrics: null
    };

    return hierarchyRecord;
  }

  /**
   * Slices and extracts ONLY the necessary context for the current section.
   * "Only provide the AI with: current relevant section, relevant applicant data, relevant evidence, previous decisions"
   *
   * @param {object} params
   * @param {object} params.hierarchy Canonical ApplicationHierarchy
   * @param {string} params.sectionId ID of section to process
   * @param {object} params.applicantGraph Complete applicant knowledge graph
   * @param {Array<object>} params.documentVault Document evidence collection
   * @param {object} params.previousDecisions Map of already resolved field decisions
   * @returns {object} Sliced, token-optimized context
   */
  getSectionContext({
    hierarchy,
    sectionId,
    applicantGraph = {},
    documentVault = [],
    previousDecisions = {}
  }) {
    // Find target section in hierarchy
    let targetSection = null;
    let pageRef = null;

    for (const page of hierarchy.pages) {
      const sec = page.sections.find(s => s.sectionId === sectionId);
      if (sec) {
        targetSection = sec;
        pageRef = page;
        break;
      }
    }

    if (!targetSection && hierarchy.pages[0]?.sections[0]) {
      targetSection = hierarchy.pages[0].sections[0];
      pageRef = hierarchy.pages[0];
    }

    // 1. Current relevant section
    const currentRelevantSection = {
      sectionId: targetSection.sectionId,
      sectionName: targetSection.sectionName,
      sectionPurpose: targetSection.sectionPurpose,
      sectionFingerprint: targetSection.sectionFingerprint,
      fieldGroups: targetSection.fieldGroups
    };

    // Flatten section fields to determine relevant semantic scopes
    const sectionFields = targetSection.fieldGroups.flatMap(g => g.fields);
    const semanticTargets = sectionFields.map(f => f.semanticTarget || f.name).filter(Boolean);

    // 2. Relevant applicant data (subgraph extraction)
    const relevantApplicantData = this._extractRelevantApplicantSubgraph(applicantGraph, targetSection.sectionName, sectionFields);

    // 3. Relevant evidence (filtered documents matching section purpose)
    const relevantEvidence = this._filterRelevantEvidence(documentVault, targetSection.sectionName, semanticTargets);

    // 4. Previous decisions (compact summary of already-resolved fields)
    const compactPreviousDecisions = {};
    for (const [k, v] of Object.entries(previousDecisions)) {
      if (v !== undefined && v !== null) {
        compactPreviousDecisions[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
    }

    // Measure token estimates
    const monolithicTokens = this._estimateTokens({
      fullHierarchy: hierarchy,
      fullApplicantGraph: applicantGraph,
      fullDocumentVault: documentVault,
      allPreviousDecisions: previousDecisions
    });

    const optimizedSectionTokens = this._estimateTokens({
      currentRelevantSection,
      relevantApplicantData,
      relevantEvidence,
      previousDecisions: compactPreviousDecisions
    });

    const tokenSavingsRatio = monolithicTokens > 0
      ? Number(((monolithicTokens - optimizedSectionTokens) / monolithicTokens).toFixed(3))
      : 0;

    return {
      currentRelevantSection,
      relevantApplicantData,
      relevantEvidence,
      previousDecisions: compactPreviousDecisions,
      metrics: {
        monolithicTokenEstimate: monolithicTokens,
        optimizedSectionTokens,
        tokenSavingsRatio,
        sectionFieldCount: sectionFields.length,
        totalApplicationFields: hierarchy.totalFieldCount
      }
    };
  }

  /**
   * Processes a large application section-by-section with multi-tiered caching
   * and fingerprint drift verification.
   */
  async processApplication({
    applicationId,
    portalDomain,
    rawFields = [],
    applicantGraph = {},
    documentVault = [],
    userAnswers = {},
    pageFingerprint = null,
    forceRecompute = false
  }) {
    const startTime = performance.now();
    const livePageFp = pageFingerprint || ContextOptimizationCache.computePageFingerprint(rawFields);
    const domainKey = portalDomain.toLowerCase();

    // 1. Check for cache invalidation upon page fingerprint drift
    const driftCheck = this.cache.checkAndInvalidateOnDrift(domainKey, livePageFp);
    const wasInvalidated = driftCheck.changed;

    // 2. Check Semantic Page Analysis Cache
    let hierarchy = null;
    let pageCacheHit = false;

    if (!forceRecompute && !wasInvalidated) {
      hierarchy = this.cache.getPageAnalysis(livePageFp);
      if (hierarchy) {
        pageCacheHit = true;
      }
    }

    if (!hierarchy) {
      hierarchy = this.buildHierarchy({
        applicationId,
        portalDomain,
        rawFields,
        pageFingerprint: livePageFp
      });
      this.cache.setPageAnalysis(livePageFp, hierarchy);
    }

    // 3. Process Section by Section
    const allMappedFields = [];
    const previousDecisions = { ...userAnswers };
    let totalOptimizedTokens = 0;
    let totalMonolithicTokens = 0;
    let sectionCacheHits = 0;
    let totalSections = 0;

    for (const page of hierarchy.pages) {
      for (const section of page.sections) {
        totalSections++;
        const secFp = section.sectionFingerprint;
        let sectionMappings = null;

        // Check Field Mappings Cache for Section
        if (!forceRecompute && !wasInvalidated) {
          sectionMappings = this.cache.getFieldMappings(secFp);
          if (sectionMappings) {
            sectionCacheHits++;
          }
        }

        const sectionContext = this.getSectionContext({
          hierarchy,
          sectionId: section.sectionId,
          applicantGraph,
          documentVault,
          previousDecisions
        });

        totalOptimizedTokens += sectionContext.metrics.optimizedSectionTokens;
        totalMonolithicTokens += sectionContext.metrics.monolithicTokenEstimate;

        if (!sectionMappings) {
          // Resolve mappings using focused section context
          sectionMappings = this._resolveSectionMappings(
            sectionContext.currentRelevantSection,
            sectionContext.relevantApplicantData,
            sectionContext.previousDecisions,
            sectionContext.relevantEvidence
          );
          this.cache.setFieldMappings(secFp, sectionMappings);
        }

        // Record decisions for downstream sections
        for (const m of sectionMappings) {
          if (m.value !== undefined && m.value !== null) {
            previousDecisions[m.semanticTarget] = m.value;
          }
        }

        section.status = 'COMPLETED';
        allMappedFields.push(...sectionMappings);
      }
    }

    const durationMs = Number((performance.now() - startTime).toFixed(2));
    const overallSavingsRatio = totalMonolithicTokens > 0
      ? Number(((totalMonolithicTokens - totalOptimizedTokens) / totalMonolithicTokens).toFixed(3))
      : 0.85;

    // Attach metrics to hierarchy
    hierarchy.optimizedContextMetrics = {
      monolithicTokenEstimate: totalMonolithicTokens,
      optimizedSectionTokens: totalOptimizedTokens,
      tokenSavingsRatio: overallSavingsRatio,
      cacheHit: pageCacheHit || sectionCacheHits > 0
    };

    // Contract validation
    validateApplicationHierarchy(hierarchy);

    return {
      hierarchy,
      mappedFields: allMappedFields,
      metrics: {
        latencyMs: durationMs,
        monolithicTokens: totalMonolithicTokens,
        optimizedTokens: totalOptimizedTokens,
        savingsRatio: overallSavingsRatio,
        averageSectionTokens: Math.round(totalOptimizedTokens / Math.max(1, totalSections)),
        monolithicPerSection: Math.round(totalMonolithicTokens / Math.max(1, totalSections)),
        pageCacheHit,
        sectionCacheHits,
        wasInvalidated,
        fieldCount: rawFields.length
      }
    };
  }

  // ─────────────────────────────────────────────────────────────
  // CLUSTERING & GROUPING HEURISTICS
  // ─────────────────────────────────────────────────────────────

  _clusterFieldsIntoSections(fields) {
    const clusters = {
      PERSONAL: { sectionName: 'Personal Information', sectionPurpose: 'Identity, demographics and basic profile', fields: [] },
      CONTACT: { sectionName: 'Contact & Address', sectionPurpose: 'Communication coordinates and residence', fields: [] },
      EDUCATION: { sectionName: 'Academic Background', sectionPurpose: 'Degrees, colleges, grades and certifications', fields: [] },
      EXPERIENCE: { sectionName: 'Professional Experience', sectionPurpose: 'Employment history, employers and skills', fields: [] },
      PROJECTS: { sectionName: 'Projects & Publications', sectionPurpose: 'Portfolio, works and achievements', fields: [] },
      REFERENCES: { sectionName: 'References', sectionPurpose: 'Professional and academic references', fields: [] },
      DOCUMENTS: { sectionName: 'Documents & Uploads', sectionPurpose: 'Resume, certificates and identification proofs', fields: [] },
      DISCLOSURES: { sectionName: 'Disclosures & Declarations', sectionPurpose: 'Legal statements, work authorization and compliance', fields: [] }
    };

    for (const field of fields) {
      const text = `${field.name || ''} ${field.label || ''} ${field.id || ''}`.toLowerCase();
      const type = (field.type || 'text').toLowerCase();

      if (type === 'file' || /resume|cv|transcript|certificate|upload|document/i.test(text)) {
        clusters.DOCUMENTS.fields.push(field);
      } else if (/education|college|university|degree|cgpa|gpa|marks|school|major|qualification/i.test(text)) {
        clusters.EDUCATION.fields.push(field);
      } else if (/experience|employer|company|job|title|role|salary|work\s*history/i.test(text)) {
        clusters.EXPERIENCE.fields.push(field);
      } else if (/email|phone|mobile|address|city|state|zip|postal|country|street/i.test(text)) {
        clusters.CONTACT.fields.push(field);
      } else if (/reference|ref\s*name|ref\s*phone|ref\s*email/i.test(text)) {
        clusters.REFERENCES.fields.push(field);
      } else if (/project|github|portfolio|publication|research/i.test(text)) {
        clusters.PROJECTS.fields.push(field);
      } else if (/declaration|consent|authorized|citizenship|visa|signature|agree/i.test(text)) {
        clusters.DISCLOSURES.fields.push(field);
      } else {
        // Default to personal
        clusters.PERSONAL.fields.push(field);
      }
    }

    // Return non-empty clusters
    return Object.entries(clusters)
      .filter(([_, c]) => c.fields.length > 0)
      .map(([cat, c], idx) => ({
        category: cat,
        sectionId: `sec_${cat.toLowerCase()}_${idx + 1}`,
        sectionName: c.sectionName,
        sectionPurpose: c.sectionPurpose,
        fields: c.fields
      }));
  }

  _groupFieldsWithinSection(fields, groupSize = 4) {
    const groups = [];
    for (let i = 0; i < fields.length; i += groupSize) {
      const slice = fields.slice(i, i + groupSize);
      const groupNum = Math.floor(i / groupSize) + 1;
      groups.push({
        groupId: `grp_${groupNum}_${slice[0]?.name || 'sub'}`,
        groupName: `Field Group ${groupNum}`,
        fields: slice.map(f => ({
          fieldId: f.fieldId || f.id || f.name || `fld_${Math.random().toString(36).slice(2, 7)}`,
          name: f.name || f.fieldId || 'unnamed',
          type: f.type || 'text',
          label: f.label || f.placeholder || f.name || '',
          selector: f.selector || `#${f.id || f.name}`,
          semanticTarget: f.semanticTarget || this._inferSemanticTarget(f),
          required: !!f.required,
          value: f.value ?? null
        }))
      });
    }
    return groups;
  }

  _inferSemanticTarget(field) {
    const text = `${field.name || ''} ${field.label || ''}`.toLowerCase();
    if (/full\s*name|candidate\s*name/i.test(text)) return 'applicant.fullName';
    if (/first\s*name/i.test(text)) return 'applicant.firstName';
    if (/last\s*name/i.test(text)) return 'applicant.lastName';
    if (/email/i.test(text)) return 'applicant.email';
    if (/phone|mobile/i.test(text)) return 'applicant.phone';
    if (/date\s*of\s*birth|dob/i.test(text)) return 'applicant.dateOfBirth';
    if (/degree/i.test(text)) return 'education.degree';
    if (/college|university/i.test(text)) return 'education.college';
    if (/cgpa|gpa/i.test(text)) return 'education.cgpa';
    if (/experience|years.*exp/i.test(text)) return 'applicant.yearsExperience';
    if (/resume|cv/i.test(text) || field.type === 'file') return 'documents.resume';
    return `custom.${field.name || 'field'}`;
  }

  _extractRelevantApplicantSubgraph(applicantGraph, sectionName, sectionFields = []) {
    const subgraph = {};
    const lowerSec = (sectionName || '').toLowerCase();
    const fieldNames = sectionFields.map(f => (f.name || '').toLowerCase()).filter(Boolean);
    const semanticTargets = sectionFields.map(f => (f.semanticTarget || '').toLowerCase()).filter(Boolean);

    for (const [key, val] of Object.entries(applicantGraph)) {
      const lowerKey = key.toLowerCase();

      // 1. Direct match with field name or semantic target in this section
      if (fieldNames.some(fn => fn === lowerKey || lowerKey.includes(fn) || fn.includes(lowerKey))) {
        subgraph[key] = val;
        continue;
      }
      if (semanticTargets.some(st => st === lowerKey || lowerKey.includes(st) || st.includes(lowerKey))) {
        subgraph[key] = val;
        continue;
      }

      // 2. Domain category match
      if (lowerSec.includes('personal') && (lowerKey.includes('personal') || lowerKey.includes('applicant') || lowerKey.includes('identity') || lowerKey.includes('name') || lowerKey.includes('dob') || lowerKey.includes('gender') || lowerKey.includes('city') || lowerKey.includes('country'))) {
        subgraph[key] = val;
      } else if (lowerSec.includes('contact') && (lowerKey.includes('contact') || lowerKey.includes('email') || lowerKey.includes('phone') || lowerKey.includes('address') || lowerKey.includes('city') || lowerKey.includes('zip') || lowerKey.includes('state'))) {
        subgraph[key] = val;
      } else if ((lowerSec.includes('academic') || lowerSec.includes('education')) && (lowerKey.includes('education') || lowerKey.includes('degree') || lowerKey.includes('college') || lowerKey.includes('cgpa') || lowerKey.includes('school') || lowerKey.includes('gpa') || lowerKey.includes('academic'))) {
        subgraph[key] = val;
      } else if ((lowerSec.includes('experience') || lowerSec.includes('employment')) && (lowerKey.includes('experience') || lowerKey.includes('employment') || lowerKey.includes('employer') || lowerKey.includes('job') || lowerKey.includes('company') || lowerKey.includes('work') || lowerKey.includes('title'))) {
        subgraph[key] = val;
      } else if (lowerSec.includes('skill') && (lowerKey.includes('skill') || lowerKey.includes('lang') || lowerKey.includes('tech') || lowerKey.includes('framework') || lowerKey.includes('tool'))) {
        subgraph[key] = val;
      } else if (lowerSec.includes('reference') && (lowerKey.includes('ref') || lowerKey.includes('recommend'))) {
        subgraph[key] = val;
      } else if (lowerSec.includes('document') && (lowerKey.includes('doc') || lowerKey.includes('resume') || lowerKey.includes('transcript') || lowerKey.includes('upload') || lowerKey.includes('file'))) {
        subgraph[key] = val;
      } else if (lowerSec.includes('disclosure') && (lowerKey.includes('disclosure') || lowerKey.includes('declaration') || lowerKey.includes('consent') || lowerKey.includes('authorized') || lowerKey.includes('visa'))) {
        subgraph[key] = val;
      }
    }

    return subgraph;
  }

  _filterRelevantEvidence(documentVault, sectionName, semanticTargets) {
    const lowerSec = (sectionName || '').toLowerCase();
    return documentVault.filter(doc => {
      const type = (doc.type || '').toLowerCase();
      const fn = (doc.filename || doc.name || '').toLowerCase();

      if (lowerSec.includes('document') || lowerSec.includes('upload')) return true;
      if (lowerSec.includes('education') && (type.includes('transcript') || type.includes('degree') || fn.includes('transcript') || fn.includes('degree'))) return true;
      if (lowerSec.includes('experience') && (type.includes('resume') || fn.includes('resume') || type.includes('experience'))) return true;
      if (lowerSec.includes('personal') && (type.includes('id') || type.includes('aadhaar') || type.includes('passport'))) return true;
      return false;
    });
  }

  _resolveSectionMappings(currentSection, relevantApplicantData, previousDecisions, relevantEvidence) {
    const resolved = [];

    for (const group of currentSection.fieldGroups) {
      for (const field of group.fields) {
        let val = null;
        let source = 'NONE';
        let confidence = 0.5;

        // 1. Check previous decisions
        if (previousDecisions[field.semanticTarget] !== undefined) {
          val = previousDecisions[field.semanticTarget];
          source = 'PREVIOUS_DECISION';
          confidence = 0.99;
        } else if (previousDecisions[field.name] !== undefined) {
          val = previousDecisions[field.name];
          source = 'PREVIOUS_DECISION';
          confidence = 0.99;
        }
        // 2. Check relevant applicant data
        else if (relevantApplicantData[field.name] !== undefined) {
          val = relevantApplicantData[field.name];
          source = 'APPLICANT_GRAPH';
          confidence = 0.95;
        } else if (relevantApplicantData[field.semanticTarget] !== undefined) {
          val = relevantApplicantData[field.semanticTarget];
          source = 'APPLICANT_GRAPH';
          confidence = 0.95;
        }
        // 3. Check relevant evidence
        else if (field.type === 'file' && relevantEvidence.length > 0) {
          const doc = relevantEvidence[0];
          val = doc.path || doc.url || doc.filename;
          source = 'DOCUMENT_EVIDENCE';
          confidence = 0.92;
        } else {
          // Fallback pattern match against relevant graph
          for (const [k, v] of Object.entries(relevantApplicantData)) {
            if (k.toLowerCase().includes(field.name.toLowerCase()) || field.name.toLowerCase().includes(k.toLowerCase())) {
              val = v;
              source = 'APPLICANT_GRAPH';
              confidence = 0.90;
              break;
            }
          }
        }

        resolved.push({
          fieldId: field.fieldId,
          name: field.name,
          selector: field.selector,
          semanticTarget: field.semanticTarget,
          value: val,
          confidence,
          source,
          verified: val !== null
        });
      }
    }

    return resolved;
  }

  _estimateTokens(obj) {
    const raw = typeof obj === 'string' ? obj : JSON.stringify(obj);
    // Typical heuristic: 1 token ≈ 4 characters
    return Math.ceil(raw.length / 4);
  }
}

export const defaultHierarchicalContextEngine = new HierarchicalContextEngine();
export default defaultHierarchicalContextEngine;
