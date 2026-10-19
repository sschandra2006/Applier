/**
 * Semantic Field Mapping Engine
 * Applier 2.0 — Phase 8
 *
 * Maps:
 * WebsiteField -> ApplicantKnowledgeGraph -> DocumentEvidence
 * without depending on exact website field names.
 *
 * Utilizes 10 matching signals:
 * 1. label
 * 2. role
 * 3. name
 * 4. placeholder
 * 5. autocomplete
 * 6. nearby text
 * 7. semantic context
 * 8. page context
 * 9. field type
 * 10. known portal knowledge
 *
 * STRICT RULE:
 * Never automatically fill:
 * - AMBIGUOUS
 * - CONFLICT
 * - LOW_CONFIDENCE (< 0.80)
 * - MISSING
 * - REQUIRES_USER
 */

import crypto from 'crypto';
import { validateSemanticFieldMapping } from '../../../shared/validators/index.js';
import { MappingStatus, KnowledgeSourceType } from '../../../shared/enums/index.js';

/**
 * Normalizes text for robust token and regex matching.
 */
function normalizeText(text) {
  if (!text) return '';
  // Remove apostrophes to keep possessives intact ("parent's" -> "parents")
  const noApos = String(text).toLowerCase().replace(/['’]/g, '');
  // Replace remaining punctuation with space
  return noApos.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Canonical Target Field Definitions with Multi-Signal Knowledge
 */
export const SEMANTIC_TARGET_DEFINITIONS = {
  'applicant.fullName': {
    graphPath: 'identity.fullName',
    labelPatterns: [
      /\b(full\s*name|applicant\s*name|candidate\s*name|student\s*name|legal\s*name|your\s*name|name\s*of\s*applicant|name\s*of\s*candidate)\b/i
    ],
    namePatterns: [
      /^(name|fullname|cand_name|appl_name|txt_name|applicant_name|student_name|candidatename)$/i
    ],
    autocompletes: ['name', 'given-name'],
    validTypes: ['text'],
    portalKeywords: ['cand_name', 'appl_name', 'txt_cand_name', 'applicantname', 'candname'],
    contextBoosts: ['personal', 'applicant', 'identity', 'basic'],
    contextPenalties: ['father', 'mother', 'guardian', 'parent', 'college', 'institute']
  },
  'applicant.firstName': {
    graphPath: 'identity.firstName',
    labelPatterns: [/\b(first\s*name|given\s*name|fname)\b/i],
    namePatterns: [/^(fname|firstname|first_name)$/i],
    autocompletes: ['given-name'],
    validTypes: ['text'],
    portalKeywords: ['f_name', 'txt_fname'],
    contextBoosts: ['personal', 'applicant'],
    contextPenalties: ['father', 'mother']
  },
  'applicant.lastName': {
    graphPath: 'identity.lastName',
    labelPatterns: [/\b(last\s*name|surname|family\s*name|lname)\b/i],
    namePatterns: [/^(lname|lastname|last_name|surname)$/i],
    autocompletes: ['family-name'],
    validTypes: ['text'],
    portalKeywords: ['l_name', 'txt_lname'],
    contextBoosts: ['personal', 'applicant'],
    contextPenalties: ['father', 'mother']
  },
  'applicant.dateOfBirth': {
    graphPath: 'identity.dateOfBirth',
    labelPatterns: [/\b(date\s*of\s*birth|dob|birth\s*date|born\s*on)\b/i],
    namePatterns: [/^(dob|dateofbirth|date_of_birth|birth_date|txt_dob)$/i],
    autocompletes: ['bday', 'bday-day', 'bday-month', 'bday-year'],
    validTypes: ['date', 'text'],
    portalKeywords: ['dob', 'dob_d', 'txt_dob', 'birth_dt'],
    contextBoosts: ['personal', 'identity'],
    contextPenalties: []
  },
  'applicant.gender': {
    graphPath: 'identity.gender',
    labelPatterns: [/\b(gender|sex)\b/i],
    namePatterns: [/^(gender|sex|cbo_gender|ddl_gender)$/i],
    autocompletes: ['sex'],
    validTypes: ['select', 'radio', 'text'],
    portalKeywords: ['gender', 'gen', 'cbo_gender'],
    contextBoosts: ['personal', 'identity'],
    contextPenalties: []
  },
  'applicant.email': {
    graphPath: 'contact.email',
    labelPatterns: [/\b(email|e-mail|email\s*address|mail\s*id|e-mail\s*id)\b/i],
    namePatterns: [/^(email|email_id|emailaddress|mail|user_email|txt_email)$/i],
    autocompletes: ['email'],
    validTypes: ['email', 'text'],
    portalKeywords: ['mail_id', 'email_id', 'txt_email'],
    contextBoosts: ['contact', 'communication', 'personal'],
    contextPenalties: []
  },
  'applicant.phone': {
    graphPath: 'contact.phone',
    labelPatterns: [/\b(mobile|phone|contact\s*no|mobile\s*number|phone\s*number|cell\s*no)\b/i],
    namePatterns: [/^(mobile|phone|contact|mob_no|mobile_no|txt_mob|phone_number)$/i],
    autocompletes: ['tel', 'tel-national'],
    validTypes: ['tel', 'text', 'number'],
    portalKeywords: ['mob_no', 'cell_no', 'txt_mob', 'cont_no'],
    contextBoosts: ['contact', 'communication', 'personal'],
    contextPenalties: ['alternate', 'secondary', 'father', 'mother']
  },
  'applicant.alternatePhone': {
    graphPath: 'contact.alternatePhone',
    labelPatterns: [/\b(alternate\s*mobile|alternate\s*phone|secondary\s*mobile|alternative\s*contact)\b/i],
    namePatterns: [/^(alt_mobile|alternate_phone|alt_phone|sec_mobile)$/i],
    autocompletes: ['tel'],
    validTypes: ['tel', 'text', 'number'],
    portalKeywords: ['alt_mob', 'alt_phone'],
    contextBoosts: ['contact', 'alternate', 'secondary'],
    contextPenalties: []
  },
  'applicant.address': {
    graphPath: 'address.street',
    labelPatterns: [/\b(address|street\s*address|residential\s*address|permanent\s*address|correspondence\s*address)\b/i],
    namePatterns: [/^(address|street|addr|perm_addr|comm_addr)$/i],
    autocompletes: ['street-address', 'address-line1'],
    validTypes: ['text', 'textarea'],
    portalKeywords: ['perm_addr', 'addr_line1', 'comm_addr'],
    contextBoosts: ['address', 'residence', 'domicile'],
    contextPenalties: []
  },
  'address.city': {
    graphPath: 'address.city',
    labelPatterns: [/\b(city|town|district)\b/i],
    namePatterns: [/^(city|town|district|txt_city)$/i],
    autocompletes: ['address-level2'],
    validTypes: ['text', 'select'],
    portalKeywords: ['city', 'dist', 'txt_city'],
    contextBoosts: ['address', 'location'],
    contextPenalties: []
  },
  'address.state': {
    graphPath: 'address.state',
    labelPatterns: [/\b(state|province)\b/i],
    namePatterns: [/^(state|province|txt_state|ddl_state)$/i],
    autocompletes: ['address-level1'],
    validTypes: ['select', 'text'],
    portalKeywords: ['state', 'txt_state', 'ddl_state'],
    contextBoosts: ['address', 'location'],
    contextPenalties: []
  },
  'address.pincode': {
    graphPath: 'address.pincode',
    labelPatterns: [/\b(pincode|pin\s*code|zip\s*code|postal\s*code|zip)\b/i],
    namePatterns: [/^(pincode|pin|zip|zipcode|postal_code|txt_pin)$/i],
    autocompletes: ['postal-code'],
    validTypes: ['text', 'number'],
    portalKeywords: ['pincode', 'pin_code', 'txt_pin'],
    contextBoosts: ['address', 'location'],
    contextPenalties: []
  },
  'family.fatherName': {
    graphPath: 'family.fatherName',
    labelPatterns: [/\b(father|parents?|guardians?|father\s*name|parents?\s*name|guardians?\s*name|father\s*or\s*guardian)\b/i],
    namePatterns: [/^(father_name|fname|fat_name|fath_name|parent_name|guardian_name|txt_father)$/i],
    autocompletes: [],
    validTypes: ['text'],
    portalKeywords: ['f_name', 'fat_name', 'fath_name', 'parent_name'],
    contextBoosts: ['family', 'parent', 'guardian', 'father'],
    contextPenalties: ['mother']
  },
  'family.motherName': {
    graphPath: 'family.motherName',
    labelPatterns: [/\b(mother|mother'?s?\s*name|mothers?\s*name)\b/i],
    namePatterns: [/^(mother_name|mot_name|moth_name|txt_mother)$/i],
    autocompletes: [],
    validTypes: ['text'],
    portalKeywords: ['m_name', 'mot_name', 'moth_name'],
    contextBoosts: ['family', 'parent', 'mother'],
    contextPenalties: ['father']
  },
  'family.guardianName': {
    graphPath: 'family.guardianName',
    labelPatterns: [/\b(guardians?|guardian\s*name|guardians?\s*name)\b/i],
    namePatterns: [/^(guardian|guardian_name|guard_name|txt_guardian)$/i],
    autocompletes: [],
    validTypes: ['text'],
    portalKeywords: ['g_name', 'guard_name', 'guardian'],
    contextBoosts: ['guardian'],
    contextPenalties: ['father', 'mother']
  },
  'education.college': {
    graphPath: 'education.college',
    labelPatterns: [/\b(college|institution|institute|university|school|campus)\b/i],
    namePatterns: [/^(college|institute|university|school|inst_name)$/i],
    autocompletes: [],
    validTypes: ['text', 'select'],
    portalKeywords: ['coll_name', 'inst_name', 'univ_name'],
    contextBoosts: ['education', 'academic', 'qualification'],
    contextPenalties: []
  },
  'education.degree': {
    graphPath: 'education.degree',
    labelPatterns: [/\b(degree|course|qualification|branch|program)\b/i],
    namePatterns: [/^(degree|course|qualification|branch)$/i],
    autocompletes: [],
    validTypes: ['select', 'text'],
    portalKeywords: ['degree', 'course_name'],
    contextBoosts: ['education', 'academic'],
    contextPenalties: []
  },
  'education.cgpa': {
    graphPath: 'education.cgpa',
    labelPatterns: [/\b(cgpa|gpa|percentage|marks|aggregate|score)\b/i],
    namePatterns: [/^(cgpa|gpa|percentage|marks|score|tot_cgpa)$/i],
    autocompletes: [],
    validTypes: ['text', 'number'],
    portalKeywords: ['cgpa_marks', 'tot_cgpa', 'perc_marks'],
    contextBoosts: ['education', 'academic'],
    contextPenalties: []
  },
  'financial.annualIncome': {
    graphPath: 'financial.annualIncome',
    labelPatterns: [/\b(annual\s*income|family\s*income|total\s*income|annual\s*family\s*income|income)\b/i],
    namePatterns: [/^(annual_income|family_income|income|ann_inc|fam_inc)$/i],
    autocompletes: [],
    validTypes: ['text', 'number', 'select'],
    portalKeywords: ['ann_inc', 'fam_inc', 'income_rs'],
    contextBoosts: ['income', 'financial', 'family'],
    contextPenalties: []
  },
  'financial.bankAccountNumber': {
    graphPath: 'financial.bankAccountNumber',
    labelPatterns: [/\b(bank\s*account|account\s*number|acc\s*no|bank\s*acc|account\s*num|bank\s*account\s*number)\b/i],
    namePatterns: [/^(account_number|acc_number|acc_num|bank_acc|bank_account|account_no)$/i],
    autocompletes: [],
    validTypes: ['text', 'number'],
    portalKeywords: ['acc_no', 'acc_number', 'bank_acc', 'ac_number'],
    contextBoosts: ['financial', 'bank', 'refund', 'fee'],
    contextPenalties: []
  },
  'identity.aadhaarNumber': {
    graphPath: 'identity.aadhaarNumber',
    labelPatterns: [/\b(aadhaar|aadhar|uid|uidai|unique\s*identity)\b/i],
    namePatterns: [/^(aadhaar|aadhar|uid|aadhaar_no|aadhar_number)$/i],
    autocompletes: [],
    validTypes: ['text', 'number'],
    portalKeywords: ['aadhaar_no', 'uid_no', 'aadhar_num'],
    contextBoosts: ['identity', 'id_proof'],
    contextPenalties: []
  }
};

export class SemanticFieldMappingEngine {
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.80;
  }

  /**
   * Evaluates if a mapping is safe for automated filling.
   * Golden Rule: Never fill AMBIGUOUS, CONFLICT, LOW_CONFIDENCE, MISSING, or REQUIRES_USER.
   */
  isFillable(mapping) {
    if (!mapping) return false;
    if (mapping.status === MappingStatus.AMBIGUOUS) return false;
    if (mapping.status === MappingStatus.CONFLICT) return false;
    if (mapping.status === MappingStatus.MISSING) return false;
    if (mapping.status === MappingStatus.REQUIRES_USER) return false;
    if ((mapping.confidence ?? 0) < this.confidenceThreshold) return false;
    return mapping.status === MappingStatus.MATCHED;
  }

  /**
   * Calculates multi-signal score for a candidate target field.
   */
  scoreCandidate(websiteField, targetKey, targetDef, pageContext = '') {
    const signalsUsed = [];
    let score = 0.0;

    const normLabel = normalizeText(websiteField.label || '');
    const nameRaw = websiteField.name || '';
    const normName = normalizeText(nameRaw);
    const normPlaceholder = normalizeText(websiteField.placeholder || '');
    const autocomplete = String(websiteField.autocomplete || '').trim().toLowerCase();
    const nearbyText = normalizeText(websiteField.nearbyText || '');
    const semanticContext = normalizeText(websiteField.semanticContext || '');
    const fieldType = String(websiteField.type || 'text').toLowerCase();

    // 1. Autocomplete match (+0.35)
    if (autocomplete && autocomplete !== 'off' && autocomplete !== 'none') {
      if (targetDef.autocompletes.includes(autocomplete)) {
        score += 0.35;
        signalsUsed.push('autocomplete');
      }
    }

    // 2. Label match (+0.40)
    for (const pat of targetDef.labelPatterns) {
      if (pat.test(normLabel)) {
        score += 0.40;
        signalsUsed.push('label');
        break;
      }
    }

    // 3. Name match (+0.25)
    for (const pat of targetDef.namePatterns) {
      if (pat.test(normName) || pat.test(nameRaw) || pat.test(nameRaw.replace(/_/g, ''))) {
        score += 0.25;
        signalsUsed.push('name');
        break;
      }
    }

    // 4. Known Portal Knowledge (+0.25)
    for (const kw of targetDef.portalKeywords) {
      if (normName.includes(kw) || normLabel.includes(kw) || nameRaw.toLowerCase().includes(kw)) {
        score += 0.25;
        signalsUsed.push('known_portal_knowledge');
        break;
      }
    }

    // 5. Placeholder match (+0.15)
    for (const pat of targetDef.labelPatterns) {
      if (pat.test(normPlaceholder)) {
        score += 0.15;
        signalsUsed.push('placeholder');
        break;
      }
    }

    // 6. Semantic Context & Nearby Text (+0.20 boost, -0.30 penalty)
    const fullContext = `${semanticContext} ${nearbyText}`;
    for (const cb of targetDef.contextBoosts) {
      if (fullContext.includes(cb)) {
        score += 0.20;
        signalsUsed.push('semantic_context');
        break;
      }
    }

    for (const cp of targetDef.contextPenalties) {
      if (fullContext.includes(cp) || normLabel.includes(cp)) {
        score -= 0.30;
      }
    }

    // 7. Field Type Compatibility Validation
    if (targetDef.validTypes.includes(fieldType)) {
      score += 0.10;
      signalsUsed.push('field_type');
    } else {
      // Severe type mismatch penalty! e.g. "file" for email, or "checkbox" for full name
      score -= 0.60;
    }

    const finalScore = Math.max(0.0, Math.min(1.0, Math.round(score * 100) / 100));
    return { score: finalScore, signalsUsed };
  }

  /**
   * Maps a single WebsiteField to KnowledgeGraph & DocumentEvidence.
   */
  mapField(websiteField, knowledgeGraph = {}, options = {}) {
    const fieldId = websiteField.fieldId || websiteField.name || 'unknown_field';
    const label = websiteField.label || '';
    const fieldType = String(websiteField.type || 'text').toLowerCase();
    const normLabel = normalizeText(label);
    const normName = normalizeText(websiteField.name || '');

    // 0. Interactive Security Fields (CAPTCHA, OTP, Verification)
    if (/\b(captcha|recaptcha|security\s*code)\b/i.test(`${normLabel} ${normName}`)) {
      return {
        websiteFieldId: fieldId,
        applicantField: 'security.captcha',
        candidateValue: null,
        source: KnowledgeSourceType.USER_INPUT || 'NONE',
        confidence: 0.99,
        status: MappingStatus.REQUIRES_USER,
        isFillable: false,
        evidence: null,
        documentId: null,
        signalsUsed: ['label', 'name', 'page_context'],
        matchReason: 'Security CAPTCHA requires human user entry.',
        alternativeMatches: [],
        conflictDetails: null
      };
    }

    if (/\b(otp|one\s*time\s*password|verification\s*code)\b/i.test(`${normLabel} ${normName}`)) {
      return {
        websiteFieldId: fieldId,
        applicantField: 'security.otp',
        candidateValue: null,
        source: 'NONE',
        confidence: 0.99,
        status: MappingStatus.REQUIRES_USER,
        isFillable: false,
        evidence: null,
        documentId: null,
        signalsUsed: ['label', 'name', 'page_context'],
        matchReason: 'Security OTP verification code requires live user entry.',
        alternativeMatches: [],
        conflictDetails: null
      };
    }

    // Check for extreme wrong semantic type upfront
    if (fieldType === 'file' && /\b(email|phone|name|dob)\b/i.test(normLabel)) {
      return {
        websiteFieldId: fieldId,
        applicantField: 'unknown.file_mismatch',
        candidateValue: null,
        source: 'NONE',
        confidence: 0.20,
        status: MappingStatus.REQUIRES_USER,
        isFillable: false,
        evidence: null,
        documentId: null,
        signalsUsed: ['field_type', 'label'],
        matchReason: 'Type mismatch: file input declared for text-like semantic label.',
        alternativeMatches: [],
        conflictDetails: null
      };
    }

    // 1. Score all candidates using 10 signals
    const candidateScores = [];
    for (const [targetKey, targetDef] of Object.entries(SEMANTIC_TARGET_DEFINITIONS)) {
      const { score, signalsUsed } = this.scoreCandidate(websiteField, targetKey, targetDef, options.pageType);
      if (score > 0.30) {
        candidateScores.push({ targetKey, targetDef, score, signalsUsed });
      }
    }

    candidateScores.sort((a, b) => b.score - a.score);

    // 2. Ambiguity Detection (Competing candidates with score difference < 0.15 and non-trivial scores)
    if (candidateScores.length > 1) {
      const secondMatch = candidateScores[1];
      const topMatch = candidateScores[0];
      if (secondMatch.score >= 0.40 && (topMatch.score - secondMatch.score) < 0.15) {
        return {
          websiteFieldId: fieldId,
          applicantField: topMatch.targetKey,
          candidateValue: null,
          source: 'NONE',
          confidence: topMatch.score,
          status: MappingStatus.AMBIGUOUS,
          isFillable: false,
          evidence: null,
          documentId: null,
          signalsUsed: topMatch.signalsUsed,
          matchReason: `Ambiguous signals: competing match between ${topMatch.targetKey} (${topMatch.score}) and ${secondMatch.targetKey} (${secondMatch.score}).`,
          alternativeMatches: [
            { applicantField: topMatch.targetKey, confidence: topMatch.score, reason: 'Candidate 1' },
            { applicantField: secondMatch.targetKey, confidence: secondMatch.score, reason: 'Candidate 2' }
          ],
          conflictDetails: null
        };
      }
    }

    // 3. Low Confidence Detection (< 0.80)
    if (candidateScores.length === 0 || candidateScores[0].score < this.confidenceThreshold) {
      const topCand = candidateScores[0];
      return {
        websiteFieldId: fieldId,
        applicantField: topCand ? topCand.targetKey : 'UNKNOWN_FIELD',
        candidateValue: null,
        source: 'NONE',
        confidence: topCand ? topCand.score : 0.20,
        status: MappingStatus.REQUIRES_USER,
        isFillable: false,
        evidence: null,
        documentId: null,
        signalsUsed: topCand ? topCand.signalsUsed : ['label'],
        matchReason: 'Low confidence mapping: missing distinctive signals.',
        alternativeMatches: [],
        conflictDetails: null
      };
    }

    const topMatch = candidateScores[0];

    // 4. Resolve against Applicant Knowledge Graph & Document Evidence
    const graphPath = topMatch.targetDef.graphPath;
    const [domain, prop] = graphPath.split('.');
    const domainData = knowledgeGraph[domain] || {};
    const node = domainData[prop];

    // Check for active conflict in Knowledge Graph
    const conflicts = knowledgeGraph.conflicts || [];
    const activeConflict = conflicts.find(c => c.path === graphPath && c.status === 'UNRESOLVED');

    if (activeConflict || (node && node.verificationStatus === 'CONFLICT')) {
      const existingVal = activeConflict?.existingValue?.value || node?.value;
      const conflictingVal = activeConflict?.conflictingValue?.value;
      const evidenceStr = activeConflict?.existingValue?.evidence || node?.evidence;

      return {
        websiteFieldId: fieldId,
        applicantField: topMatch.targetKey,
        candidateValue: existingVal,
        source: node?.source || 'DOCUMENT',
        confidence: Math.min(topMatch.score, 0.70),
        status: MappingStatus.CONFLICT,
        isFillable: false,
        evidence: evidenceStr || null,
        documentId: null,
        signalsUsed: topMatch.signalsUsed,
        matchReason: `Unresolved FIELD_CONFLICT detected in Applicant Knowledge Graph for ${graphPath}.`,
        alternativeMatches: [],
        conflictDetails: {
          existingValue: existingVal,
          conflictingValue: conflictingVal,
          reason: 'FIELD_CONFLICT'
        }
      };
    }

    // Check if value is MISSING in Knowledge Graph
    if (!node || node.value === null || node.value === undefined || node.value === '') {
      return {
        websiteFieldId: fieldId,
        applicantField: topMatch.targetKey,
        candidateValue: null,
        source: 'NONE',
        confidence: topMatch.score,
        status: MappingStatus.MISSING,
        isFillable: false,
        evidence: null,
        documentId: null,
        signalsUsed: topMatch.signalsUsed,
        matchReason: `Field identified as ${topMatch.targetKey}, but Applicant Knowledge Graph contains no value.`,
        alternativeMatches: [],
        conflictDetails: null
      };
    }

    // 5. Clean MATCHED candidate!
    const candidateValue = node.value;
    const source = node.source || 'PROFILE';
    const evidence = node.evidence || null;
    const nodeConfidence = node.confidence ?? 0.95;
    const combinedConfidence = Math.round(topMatch.score * nodeConfidence * 100) / 100;

    return {
      websiteFieldId: fieldId,
      applicantField: topMatch.targetKey,
      candidateValue,
      source,
      confidence: combinedConfidence,
      status: MappingStatus.MATCHED,
      isFillable: true,
      evidence,
      documentId: null,
      signalsUsed: topMatch.signalsUsed,
      matchReason: 'High confidence match across multiple signals, verified in Applicant Knowledge Graph.',
      alternativeMatches: [],
      conflictDetails: null
    };
  }

  /**
   * Maps an entire list of WebsiteFields on a page.
   */
  mapPageFields({ websiteFields = [], knowledgeGraph = {}, pageUrl = '', pageType = 'APPLICATION_FORM' }) {
    const mappings = [];
    const stats = {
      totalFields: websiteFields.length,
      matched: 0,
      ambiguous: 0,
      missing: 0,
      conflict: 0,
      requiresUser: 0,
      fillableCount: 0
    };

    for (const field of websiteFields) {
      const mapping = this.mapField(field, knowledgeGraph, { pageType });
      mappings.push(mapping);

      switch (mapping.status) {
        case MappingStatus.MATCHED:
          stats.matched++;
          break;
        case MappingStatus.AMBIGUOUS:
          stats.ambiguous++;
          break;
        case MappingStatus.MISSING:
          stats.missing++;
          break;
        case MappingStatus.CONFLICT:
          stats.conflict++;
          break;
        case MappingStatus.REQUIRES_USER:
          stats.requiresUser++;
          break;
      }

      if (this.isFillable(mapping)) {
        stats.fillableCount++;
      }
    }

    const payload = {
      schemaVersion: '2.0.0',
      mappingId: `map_${crypto.randomUUID()}`,
      pageUrl,
      pageType,
      mappings,
      stats,
      timestamp: new Date().toISOString()
    };

    const validation = validateSemanticFieldMapping(payload);
    if (!validation.valid) {
      const errDetails = validation.errors?.map(e => e.message).join(', ') || 'Schema invalid';
      throw new Error(`SemanticFieldMappingEngine: Canonical validation failed: ${errDetails}`);
    }

    return payload;
  }
}

export const defaultSemanticFieldMappingEngine = new SemanticFieldMappingEngine();
