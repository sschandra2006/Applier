/**
 * Applicant Knowledge Graph Service
 * Applier 2.0 — Phase 6
 *
 * Implements the canonical source of truth for applicant information.
 * Supports:
 * - Multi-source provenance (PROFILE, DOCUMENT, USER_INPUT, PREVIOUS_APPLICATION, SYSTEM_DERIVED)
 * - Strict conflict detection (never silently overwrites differing values)
 * - Conflict resolution and user corrections with audit history
 * - Semantic field mapping and interview optimization:
 *     VERIFIED -> do not ask
 *     CONFIRMATION_REQUIRED -> ask confirmation
 *     CONFLICT -> show conflict
 *     UNKNOWN -> ask user
 */

import crypto from 'crypto';
import { validateApplicantKnowledgeGraph } from '../../../shared/validators/index.js';
import { KnowledgeSourceType, KnowledgeVerificationStatus } from '../../../shared/enums/index.js';
import { ApplicantKnowledgeGraph } from './knowledge-graph.model.js';

// Standard mapping from form / semantic keys to graph paths
const FIELD_PATH_MAPPINGS = {
  // Identity
  fullname: 'identity.fullName',
  applicantfullname: 'identity.fullName',
  name: 'identity.fullName',
  applicantname: 'identity.fullName',
  candidatename: 'identity.fullName',
  firstname: 'identity.firstName',
  lastname: 'identity.lastName',
  dob: 'identity.dateOfBirth',
  dateofbirth: 'identity.dateOfBirth',
  birthdate: 'identity.dateOfBirth',
  gender: 'identity.gender',
  sex: 'identity.gender',
  aadhaar: 'identity.aadhaarNumber',
  aadhaarnumber: 'identity.aadhaarNumber',
  pan: 'identity.panNumber',
  pannumber: 'identity.panNumber',
  passport: 'identity.passportNumber',

  // Contact
  email: 'contact.email',
  emailid: 'contact.email',
  phone: 'contact.phone',
  phonenumber: 'contact.phone',
  mobile: 'contact.phone',
  mobilenumber: 'contact.phone',
  mobilephone: 'contact.phone',
  alternatephone: 'contact.alternatePhone',

  // Address
  address: 'address.street',
  street: 'address.street',
  streetaddress: 'address.street',
  city: 'address.city',
  state: 'address.state',
  pincode: 'address.pincode',
  zipcode: 'address.pincode',
  postalcode: 'address.pincode',
  country: 'address.country',

  // Education
  college: 'education.college',
  collegename: 'education.college',
  institute: 'education.college',
  institutename: 'education.college',
  university: 'education.college',
  degree: 'education.degree',
  course: 'education.degree',
  cgpa: 'education.cgpa',
  gpa: 'education.cgpa',
  percentage: 'education.cgpa',
  tenthmarks: 'education.tenthMarks',
  twelfthmarks: 'education.twelfthMarks',
  passingyear: 'education.passingYear',

  // Family
  fathername: 'family.fatherName',
  fathersname: 'family.fatherName',
  mothername: 'family.motherName',
  mothersname: 'family.motherName',
  guardianname: 'family.guardianName',
  familyincome: 'family.familyAnnualIncome',
  annualfamilyincome: 'family.familyAnnualIncome',

  // Financial
  income: 'financial.annualIncome',
  annualincome: 'financial.annualIncome',
  salary: 'financial.annualIncome',
  bankaccount: 'financial.bankAccountNumber',
  accountnumber: 'financial.bankAccountNumber',
  ifsc: 'financial.bankIfsc',
  bankifsc: 'financial.bankIfsc',
  bankname: 'financial.bankName'
};

/**
 * Normalizes string values for accurate equality comparisons
 */
function normalizeForComparison(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'string') {
    return val
      .trim()
      .toLowerCase()
      .replace(/[\/\-_]/g, '-') // Normalize date separators
      .replace(/\s+/g, ' ');
  }
  return JSON.stringify(val);
}

export class ApplicantKnowledgeGraphService {
  /**
   * Initializes a new, empty in-memory knowledge graph conforming to the canonical schema.
   */
  createEmptyGraph({ userId, applicantId } = {}) {
    const now = new Date().toISOString();
    return {
      schemaVersion: '2.0.0',
      applicantId: applicantId || `app_${crypto.randomUUID()}`,
      userId: String(userId || `usr_${crypto.randomUUID()}`),
      identity: {},
      contact: {},
      address: {},
      education: {},
      family: {},
      financial: {},
      preferences: {},
      documents: {},
      conflicts: [],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        totalFields: 0,
        verifiedFields: 0,
        conflictCount: 0
      }
    };
  }

  /**
   * Translates a semantic key or form field ID into domain path (e.g. 'dob' -> 'identity.dateOfBirth')
   */
  resolvePath(fieldKey) {
    if (!fieldKey) return null;
    if (typeof fieldKey === 'string' && fieldKey.includes('.')) {
      let [domain, field] = fieldKey.split('.');
      if (domain === 'applicant') domain = 'identity';
      const validDomains = ['identity', 'contact', 'address', 'education', 'family', 'financial', 'preferences', 'documents'];
      if (validDomains.includes(domain)) {
        return `${domain}.${field}`;
      }
    }
    const clean = String(fieldKey).toLowerCase().replace(/[^a-z0-9]/g, '');
    return FIELD_PATH_MAPPINGS[clean] || null;
  }

  /**
   * Recomputes metadata counts and validates graph against canonical schema.
   */
  recomputeMetadata(graph) {
    const domains = ['identity', 'contact', 'address', 'education', 'family', 'financial', 'preferences', 'documents'];
    let total = 0;
    let verified = 0;

    for (const d of domains) {
      const branch = graph[d] || {};
      for (const node of Object.values(branch)) {
        total++;
        if (node.verificationStatus === KnowledgeVerificationStatus.VERIFIED) {
          verified++;
        }
      }
    }

    const unresolvedConflicts = (graph.conflicts || []).filter(c => c.status === 'UNRESOLVED').length;

    graph.metadata = {
      ...(graph.metadata || {}),
      version: (graph.metadata?.version || 1) + 1,
      updatedAt: new Date().toISOString(),
      totalFields: total,
      verifiedFields: verified,
      conflictCount: unresolvedConflicts
    };

    const validation = validateApplicantKnowledgeGraph(graph);
    if (!validation.valid) {
      const errs = validation.errors?.map(e => e.message).join(', ') || 'Schema invalid';
      throw new Error(`ApplicantKnowledgeGraphService: Canonical validation failed: ${errs}`);
    }

    return graph;
  }

  /**
   * Core Ingestion Method.
   *
   * Ingests a single value into the graph under a given path.
   * Strict Rules:
   * 1. If path is new: ingest cleanly with appropriate verification status.
   * 2. If path exists and values match: reinforce confidence, update evidence.
   * 3. If path exists and values DIFFER:
   *    - If source is USER_INPUT (user correction): override, archive old to history, resolve any active conflict.
   *    - If source is NOT USER_INPUT: NEVER silently overwrite! Flag as FIELD_CONFLICT and require resolution.
   */
  ingestValue(graph, {
    path,
    value,
    source = KnowledgeSourceType.PROFILE,
    confidence = 0.85,
    evidence,
    updatedAt
  }) {
    if (!path || !path.includes('.')) {
      throw new Error(`ApplicantKnowledgeGraphService: Invalid path "${path}". Must be in form "domain.field"`);
    }

    if (value === null || value === undefined || value === '') {
      return { status: 'IGNORED_EMPTY', path, node: null };
    }

    const [domain, fieldKey] = path.split('.');
    if (!graph[domain]) {
      graph[domain] = {};
    }

    const now = updatedAt || new Date().toISOString();
    const existingNode = graph[domain][fieldKey];

    // Case 1: First time ingesting this field
    if (!existingNode) {
      let verificationStatus = KnowledgeVerificationStatus.UNVERIFIED;
      if (source === KnowledgeSourceType.USER_INPUT || (confidence >= 0.85 && source === KnowledgeSourceType.DOCUMENT)) {
        verificationStatus = KnowledgeVerificationStatus.VERIFIED;
      } else if (confidence >= 0.85) {
        verificationStatus = KnowledgeVerificationStatus.VERIFIED;
      } else {
        verificationStatus = KnowledgeVerificationStatus.CONFIRMATION_REQUIRED;
      }

      const newNode = {
        value,
        source,
        confidence: Math.round(confidence * 100) / 100,
        verificationStatus,
        updatedAt: now,
        evidence: evidence || undefined,
        history: []
      };

      graph[domain][fieldKey] = newNode;
      this.recomputeMetadata(graph);
      return { status: 'INGESTED', path, node: newNode, conflict: null };
    }

    const isMatching = normalizeForComparison(existingNode.value) === normalizeForComparison(value);

    // Case 2: Explicit USER_INPUT (confirmation, override, or conflict resolution)
    if (source === KnowledgeSourceType.USER_INPUT) {
      const hasConflict = Array.isArray(graph.conflicts) && graph.conflicts.some(c => c.path === path && c.status === 'UNRESOLVED');
      if (!isMatching || hasConflict) {
        existingNode.history = existingNode.history || [];
        existingNode.history.push({
          value: existingNode.value,
          source: existingNode.source,
          confidence: existingNode.confidence,
          timestamp: existingNode.updatedAt,
          reason: hasConflict ? 'Conflict resolved by user' : 'User manual correction/resolution'
        });
      }

      existingNode.value = value;
      existingNode.source = KnowledgeSourceType.USER_INPUT;
      existingNode.confidence = 1.0;
      existingNode.verificationStatus = KnowledgeVerificationStatus.VERIFIED;
      existingNode.updatedAt = now;
      existingNode.evidence = evidence || 'User directly provided/confirmed during interaction';

      // Auto-resolve any unresolved conflicts on this path
      let resolvedConflict = null;
      if (Array.isArray(graph.conflicts)) {
        for (const c of graph.conflicts) {
          if (c.path === path && c.status === 'UNRESOLVED') {
            c.status = 'RESOLVED';
            c.resolvedAt = now;
            c.resolution = {
              selectedSource: KnowledgeSourceType.USER_INPUT,
              selectedValue: value,
              resolvedBy: 'USER'
            };
            resolvedConflict = c;
          }
        }
      }

      this.recomputeMetadata(graph);
      return { status: 'USER_CORRECTION', path, node: existingNode, conflict: resolvedConflict };
    }

    // Case 3: Matching non-user values -> Reinforce existing value
    if (isMatching) {
      existingNode.confidence = Math.max(existingNode.confidence, Math.round(confidence * 100) / 100);
      existingNode.updatedAt = now;
      if (evidence && !existingNode.evidence?.includes(evidence)) {
        existingNode.evidence = existingNode.evidence ? `${existingNode.evidence}; ${evidence}` : evidence;
      }
      if (source === KnowledgeSourceType.DOCUMENT && existingNode.confidence >= 0.85) {
        existingNode.verificationStatus = KnowledgeVerificationStatus.VERIFIED;
      }
      this.recomputeMetadata(graph);
      return { status: 'REINFORCED', path, node: existingNode, conflict: null };
    }

    // Case 4: Non-user differing sources -> DO NOT OVERWRITE! Register FIELD_CONFLICT
    const conflictId = `conf_${crypto.randomUUID()}`;
    const conflict = {
      conflictId,
      path,
      existingValue: {
        value: existingNode.value,
        source: existingNode.source,
        evidence: existingNode.evidence,
        confidence: existingNode.confidence
      },
      conflictingValue: {
        value,
        source,
        evidence,
        confidence
      },
      status: 'UNRESOLVED',
      reason: 'FIELD_CONFLICT',
      detectedAt: now
    };

    // Mark current node status as CONFLICT
    existingNode.verificationStatus = KnowledgeVerificationStatus.CONFLICT;
    graph.conflicts = graph.conflicts || [];
    graph.conflicts.push(conflict);

    this.recomputeMetadata(graph);
    return { status: 'CONFLICT_DETECTED', path, node: existingNode, conflict };
  }

  /**
   * Safely imports and migrates an existing User Profile into the Knowledge Graph.
   * Guarantees:
   * - No existing fields deleted
   * - Non-destructive translation
   */
  importProfile(graph, profile) {
    if (!profile) return graph;

    // Full name synthesis if available
    let fullName = profile.fullName;
    if (!fullName && (profile.firstName || profile.lastName)) {
      fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
    }
    if (fullName) {
      this.ingestValue(graph, {
        path: 'identity.fullName',
        value: fullName,
        source: KnowledgeSourceType.PROFILE,
        confidence: 0.90,
        evidence: 'Imported from User Profile record'
      });
    }

    if (profile.firstName) {
      this.ingestValue(graph, {
        path: 'identity.firstName',
        value: profile.firstName,
        source: KnowledgeSourceType.PROFILE,
        confidence: 0.90,
        evidence: 'Imported from User Profile record'
      });
    }
    if (profile.lastName) {
      this.ingestValue(graph, {
        path: 'identity.lastName',
        value: profile.lastName,
        source: KnowledgeSourceType.PROFILE,
        confidence: 0.90,
        evidence: 'Imported from User Profile record'
      });
    }

    // Date of Birth
    if (profile.dateOfBirth) {
      const dobStr = profile.dateOfBirth instanceof Date
        ? profile.dateOfBirth.toISOString().split('T')[0]
        : String(profile.dateOfBirth);
      this.ingestValue(graph, {
        path: 'identity.dateOfBirth',
        value: dobStr,
        source: KnowledgeSourceType.PROFILE,
        confidence: 0.90,
        evidence: 'Imported from User Profile record'
      });
    }

    // Phone & Email
    if (profile.phone) {
      this.ingestValue(graph, {
        path: 'contact.phone',
        value: profile.phone,
        source: KnowledgeSourceType.PROFILE,
        confidence: 0.90,
        evidence: 'Imported from User Profile phone'
      });
    }
    if (profile.email) {
      this.ingestValue(graph, {
        path: 'contact.email',
        value: profile.email,
        source: KnowledgeSourceType.PROFILE,
        confidence: 1.0,
        evidence: 'Primary account email'
      });
    }

    // Address
    if (profile.address) {
      const addr = profile.address;
      if (addr.street) {
        this.ingestValue(graph, {
          path: 'address.street',
          value: addr.street,
          source: KnowledgeSourceType.PROFILE,
          confidence: 0.85
        });
      }
      if (addr.city) {
        this.ingestValue(graph, {
          path: 'address.city',
          value: addr.city,
          source: KnowledgeSourceType.PROFILE,
          confidence: 0.85
        });
      }
      if (addr.state) {
        this.ingestValue(graph, {
          path: 'address.state',
          value: addr.state,
          source: KnowledgeSourceType.PROFILE,
          confidence: 0.85
        });
      }
      if (addr.zipCode || addr.pincode) {
        this.ingestValue(graph, {
          path: 'address.pincode',
          value: addr.zipCode || addr.pincode,
          source: KnowledgeSourceType.PROFILE,
          confidence: 0.85
        });
      }
      if (addr.country) {
        this.ingestValue(graph, {
          path: 'address.country',
          value: addr.country,
          source: KnowledgeSourceType.PROFILE,
          confidence: 0.85
        });
      }
    }

    return graph;
  }

  /**
   * Imports document evidence from vault / processed documents into the knowledge graph.
   * Document-first principle: Ingests all extracted fields from documents.
   */
  importDocumentEvidence(graph, documents = []) {
    if (!graph || !Array.isArray(documents)) return graph;

    for (const doc of documents) {
      if (!doc) continue;
      const docId = doc._id ? String(doc._id) : (doc.id ? String(doc.id) : 'doc');
      const docName = doc.fileName || doc.type || 'Document';
      const extracted = doc.extractedData instanceof Map
        ? Object.fromEntries(doc.extractedData)
        : (doc.extractedData || {});

      for (const [key, item] of Object.entries(extracted)) {
        if (item === null || item === undefined) continue;
        let value = item;
        let confidence = 0.90;
        let evidenceText = `${docName} (id: ${docId})`;

        if (typeof item === 'object' && item !== null) {
          value = item.normalizedValue ?? item.extractedValue ?? item.value;
          if (item.confidence !== undefined) confidence = Number(item.confidence);
          if (item.evidence) evidenceText = item.evidence;
        }

        if (value === null || value === undefined || value === '') continue;

        const path = this.resolvePath(key);
        if (!path) continue;

        this.ingestValue(graph, {
          path,
          value,
          source: KnowledgeSourceType.DOCUMENT,
          confidence,
          evidence: evidenceText
        });
      }
    }

    return graph;
  }

  /**
   * Imports previous application answers into the knowledge graph.
   * Document-first principle: Ingests answers from prior submitted applications.
   */
  importPreviousApplications(graph, previousApplications = []) {
    if (!graph || !Array.isArray(previousApplications)) return graph;

    for (const app of previousApplications) {
      if (!app) continue;
      const appId = app._id ? String(app._id) : (app.id ? String(app.id) : 'prev_app');
      const answers = app.answers instanceof Map
        ? Object.fromEntries(app.answers)
        : (app.answers || {});

      for (const [key, value] of Object.entries(answers)) {
        if (value === null || value === undefined || value === '') continue;
        const path = this.resolvePath(key);
        if (!path) continue;

        this.ingestValue(graph, {
          path,
          value,
          source: KnowledgeSourceType.PREVIOUS_APPLICATION,
          confidence: 0.90,
          evidence: `Imported from prior application (${appId})`
        });
      }
    }

    return graph;
  }

  /**
   * Resolves an open FIELD_CONFLICT with the user's chosen value.
   */
  resolveConflict(graph, conflictId, { selectedSource, selectedValue, resolvedBy = 'USER' }) {
    const conflict = (graph.conflicts || []).find(c => c.conflictId === conflictId && c.status === 'UNRESOLVED');
    if (!conflict) {
      throw new Error(`ApplicantKnowledgeGraphService: Unresolved conflict "${conflictId}" not found`);
    }

    conflict.status = 'RESOLVED';
    conflict.resolvedAt = new Date().toISOString();
    conflict.resolution = {
      selectedSource: selectedSource || KnowledgeSourceType.USER_INPUT,
      selectedValue,
      resolvedBy
    };

    const [domain, fieldKey] = conflict.path.split('.');
    const node = graph[domain]?.[fieldKey];
    if (node) {
      node.value = selectedValue;
      node.source = selectedSource || KnowledgeSourceType.USER_INPUT;
      node.confidence = 1.0;
      node.verificationStatus = KnowledgeVerificationStatus.VERIFIED;
      node.updatedAt = new Date().toISOString();
      node.evidence = `Conflict resolved by ${resolvedBy}`;
    }

    this.recomputeMetadata(graph);
    return { conflict, node };
  }

  /**
   * Returns true if the graph contains any UNRESOLVED conflicts.
   */
  hasActiveConflicts(graph) {
    if (!graph || !Array.isArray(graph.conflicts)) return false;
    return graph.conflicts.some(c => c.status === 'UNRESOLVED');
  }

  /**
   * Resolves a conflict by field path.
   */
  resolveFieldConflict(graph, { path, resolvedValue, resolvedSource, evidence, resolvedBy = 'USER' }) {
    const conflict = (graph.conflicts || []).find(c => c.path === path && c.status === 'UNRESOLVED');
    if (conflict) {
      return this.resolveConflict(graph, conflict.conflictId, {
        selectedSource: resolvedSource,
        selectedValue: resolvedValue,
        resolvedBy
      });
    }

    const [domain, fieldKey] = path.split('.');
    if (graph[domain]?.[fieldKey]) {
      const node = graph[domain][fieldKey];
      node.value = resolvedValue;
      node.source = resolvedSource || KnowledgeSourceType.USER_INPUT;
      node.confidence = 1.0;
      node.verificationStatus = KnowledgeVerificationStatus.VERIFIED;
      node.updatedAt = new Date().toISOString();
      if (evidence) node.evidence = evidence;
      this.recomputeMetadata(graph);
      return { conflict: null, node };
    }
    return null;
  }

  /**
   * Inspects the knowledge status of a specific field (by form fieldId or path).
   */
  getFieldStatus(graph, fieldKeyOrPath) {
    let path = fieldKeyOrPath.includes('.') ? this.resolvePath(fieldKeyOrPath) || fieldKeyOrPath : this.resolvePath(fieldKeyOrPath);
    if (!path || !path.includes('.')) {
      return { status: 'UNKNOWN', path: null, node: null, conflict: null };
    }

    const [domain, fieldKey] = path.split('.');
    const node = graph[domain]?.[fieldKey];

    if (!node || node.value === null || node.value === undefined || node.value === '') {
      return { status: 'UNKNOWN', path, node: null, conflict: null };
    }

    // Check if an unresolved conflict exists for this path
    const activeConflict = (graph.conflicts || []).find(c => c.path === path && c.status === 'UNRESOLVED');
    if (activeConflict || node.verificationStatus === KnowledgeVerificationStatus.CONFLICT) {
      return {
        status: KnowledgeVerificationStatus.CONFLICT,
        path,
        node,
        conflict: activeConflict || null
      };
    }

    // Decision Matrix Rule 1 & 2: verified OR high confidence (>= 0.85) -> VERIFIED (skip)
    if (node.verificationStatus === KnowledgeVerificationStatus.VERIFIED || node.confidence >= 0.85) {
      return {
        status: KnowledgeVerificationStatus.VERIFIED,
        path,
        node,
        conflict: null
      };
    }

    // Decision Matrix Rule 3: known + uncertain (< 0.85 confidence) -> CONFIRMATION_REQUIRED
    return {
      status: KnowledgeVerificationStatus.CONFIRMATION_REQUIRED,
      path,
      node,
      conflict: null
    };
  }

  /**
   * Partitions interview pending fields according to Knowledge Graph state:
   * - VERIFIED -> Skipped from questions (pre-populated in answers)
   * - CONFIRMATION_REQUIRED -> Posed as confirmation
   * - CONFLICT -> Posed as conflict resolution
   * - UNKNOWN -> Posed as standard question
   */
  partitionInterviewFields(graph, pendingFields) {
    const skippedFields = {};
    const confirmationFields = {};
    const conflictFields = {};
    const unknownFields = [];

    for (const fieldId of pendingFields) {
      const evaluation = this.getFieldStatus(graph, fieldId);

      switch (evaluation.status) {
        case KnowledgeVerificationStatus.VERIFIED:
          skippedFields[fieldId] = {
            value: evaluation.node.value,
            path: evaluation.path,
            confidence: evaluation.node.confidence,
            source: evaluation.node.source
          };
          break;

        case KnowledgeVerificationStatus.CONFIRMATION_REQUIRED:
          confirmationFields[fieldId] = {
            value: evaluation.node.value,
            path: evaluation.path,
            confidence: evaluation.node.confidence,
            source: evaluation.node.source
          };
          unknownFields.push(fieldId);
          break;

        case KnowledgeVerificationStatus.CONFLICT:
          conflictFields[fieldId] = {
            conflictId: evaluation.conflict?.conflictId,
            existingValue: evaluation.conflict?.existingValue?.value,
            conflictingValue: evaluation.conflict?.conflictingValue?.value,
            path: evaluation.path
          };
          unknownFields.push(fieldId);
          break;

        default:
          unknownFields.push(fieldId);
          break;
      }
    }

    return {
      skippedFields,
      confirmationFields,
      conflictFields,
      remainingPendingFields: unknownFields
    };
  }
}

export const defaultKnowledgeGraphService = new ApplicantKnowledgeGraphService();
export default defaultKnowledgeGraphService;
