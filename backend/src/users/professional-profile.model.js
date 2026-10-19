/**
 * Canonical Professional Profile Mongoose Model
 * Authoritative source of truth for the user's career profile.
 * Implements field-level provenance, versioning, verification status, and audit history.
 */

import mongoose from 'mongoose';
import {
  ProvenanceSource,
  ProfileVerificationStatus
} from '../../../shared/src/index.js';

const provenanceSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: Object.values(ProvenanceSource),
    default: ProvenanceSource.RESUME_PARSED
  },
  status: {
    type: String,
    enum: Object.values(ProfileVerificationStatus),
    default: ProfileVerificationStatus.UNVERIFIED
  },
  sourceDocumentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MasterResume',
    default: null
  },
  confidence: {
    type: Number,
    min: 0.0,
    max: 1.0,
    default: 1.0
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const highlightSchema = new mongoose.Schema({
  text: { type: String, required: true },
  skillsReferenced: [{ type: String }],
  provenance: { type: provenanceSchema, default: () => ({}) }
}, { _id: false });

const workExperienceSchema = new mongoose.Schema({
  id: { type: String, required: true },
  company: { type: String, required: true },
  title: { type: String, required: true },
  location: { type: String, default: '' },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: 'Present' },
  isCurrent: { type: Boolean, default: false },
  highlights: [highlightSchema],
  provenance: { type: provenanceSchema, default: () => ({}) }
}, { _id: false });

const educationSchema = new mongoose.Schema({
  id: { type: String, required: true },
  institution: { type: String, required: true },
  degree: { type: String, required: true },
  fieldOfStudy: { type: String, default: '' },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  gpa: { type: String, default: '' },
  honors: [{ type: String }],
  provenance: { type: provenanceSchema, default: () => ({}) }
}, { _id: false });

const skillItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  category: { type: String, default: 'Technical' },
  name: { type: String, required: true },
  yearsOfExperience: { type: Number, default: null },
  provenance: { type: provenanceSchema, default: () => ({}) }
}, { _id: false });

const projectSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  technologies: [{ type: String }],
  url: { type: String, default: '' },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  highlights: [{ type: String }],
  provenance: { type: provenanceSchema, default: () => ({}) }
}, { _id: false });

const certificationSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  issuingOrganization: { type: String, default: '' },
  issueDate: { type: String, default: '' },
  expirationDate: { type: String, default: '' },
  credentialId: { type: String, default: '' },
  credentialUrl: { type: String, default: '' },
  provenance: { type: provenanceSchema, default: () => ({}) }
}, { _id: false });

const achievementSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: String, default: '' },
  provenance: { type: provenanceSchema, default: () => ({}) }
}, { _id: false });

const auditLogSchema = new mongoose.Schema({
  version: { type: Number, required: true },
  changedAt: { type: Date, default: Date.now },
  changedBy: { type: String, default: 'USER' },
  changeType: {
    type: String,
    enum: ['RESUME_UPLOAD', 'USER_EDIT', 'USER_VERIFY', 'FIELD_ADD', 'FIELD_DELETE'],
    required: true
  },
  summary: { type: String, required: true }
}, { _id: false });

const professionalProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  version: {
    type: Number,
    default: 1,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastVerifiedAt: {
    type: Date,
    default: null
  },
  personalInfo: {
    fullName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    location: {
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
      postalCode: { type: String, default: '' }
    },
    links: [{
      label: { type: String, default: 'Link' },
      url: { type: String, required: true }
    }],
    provenance: { type: provenanceSchema, default: () => ({}) }
  },
  professionalSummary: {
    text: { type: String, default: '' },
    provenance: { type: provenanceSchema, default: () => ({}) }
  },
  skills: [skillItemSchema],
  experience: [workExperienceSchema],
  education: [educationSchema],
  projects: [projectSchema],
  certifications: [certificationSchema],
  achievements: [achievementSchema],
  workPreferences: {
    workAuthorization: [{ type: String }],
    noticePeriodDays: { type: Number, default: 0 },
    targetSalary: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' }
    },
    remotePreference: {
      type: String,
      enum: ['REMOTE_ONLY', 'HYBRID', 'ONSITE', 'FLEXIBLE'],
      default: 'FLEXIBLE'
    }
  },
  auditLog: [auditLogSchema]
}, {
  timestamps: true
});

/**
 * Increments profile version and appends to audit log.
 */
professionalProfileSchema.methods.incrementVersion = function(changeType, summary, changedBy = 'USER') {
  this.version = (this.version || 1) + 1;
  this.auditLog.push({
    version: this.version,
    changedAt: new Date(),
    changedBy,
    changeType,
    summary
  });
};

/**
 * Idempotent merge of extracted resume data.
 * Crucial Rule: NEVER silently overwrite fields that have status === 'VERIFIED'.
 */
professionalProfileSchema.methods.mergeExtractedResume = function(extractedData, masterResumeId) {
  const isExistingVerified = this.isVerified;

  // 1. Personal Info
  if (extractedData.fullName && (!this.personalInfo.fullName || this.personalInfo.provenance?.status !== ProfileVerificationStatus.VERIFIED)) {
    this.personalInfo.fullName = extractedData.fullName;
    this.personalInfo.provenance = {
      source: ProvenanceSource.RESUME_PARSED,
      status: ProfileVerificationStatus.UNVERIFIED,
      sourceDocumentId: masterResumeId,
      confidence: extractedData.confidence || 0.9,
      updatedAt: new Date()
    };
  }
  if (extractedData.email && (!this.personalInfo.email || this.personalInfo.provenance?.status !== ProfileVerificationStatus.VERIFIED)) {
    this.personalInfo.email = extractedData.email;
  }
  if (extractedData.phone && (!this.personalInfo.phone || this.personalInfo.provenance?.status !== ProfileVerificationStatus.VERIFIED)) {
    this.personalInfo.phone = extractedData.phone;
  }
  if (extractedData.location && typeof extractedData.location === 'object') {
    if (this.personalInfo.provenance?.status !== ProfileVerificationStatus.VERIFIED) {
      this.personalInfo.location = {
        city: extractedData.location.city || '',
        state: extractedData.location.state || '',
        country: extractedData.location.country || '',
        postalCode: extractedData.location.postalCode || ''
      };
    }
  }

  // Links
  if (Array.isArray(extractedData.links) && extractedData.links.length > 0) {
    const existingUrls = new Set(this.personalInfo.links.map(l => l.url.toLowerCase()));
    for (const link of extractedData.links) {
      if (link.url && !existingUrls.has(link.url.toLowerCase())) {
        this.personalInfo.links.push({
          label: link.label || 'Link',
          url: link.url
        });
        existingUrls.add(link.url.toLowerCase());
      }
    }
  }

  // Professional Summary
  if (extractedData.professionalSummary && (!this.professionalSummary.text || this.professionalSummary.provenance?.status !== ProfileVerificationStatus.VERIFIED)) {
    this.professionalSummary = {
      text: extractedData.professionalSummary,
      provenance: {
        source: ProvenanceSource.RESUME_PARSED,
        status: ProfileVerificationStatus.UNVERIFIED,
        sourceDocumentId: masterResumeId,
        confidence: extractedData.confidence || 0.9,
        updatedAt: new Date()
      }
    };
  }

  // 2. Experience
  if (Array.isArray(extractedData.experience) && extractedData.experience.length > 0) {
    const existingCompanies = new Set(this.experience.map(e => `${e.company.toLowerCase()}|${e.title.toLowerCase()}`));
    for (const exp of extractedData.experience) {
      const key = `${(exp.company || '').toLowerCase()}|${(exp.title || '').toLowerCase()}`;
      if (!existingCompanies.has(key)) {
        this.experience.push({
          id: exp.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          company: exp.company,
          title: exp.title,
          location: exp.location || '',
          startDate: exp.startDate || '',
          endDate: exp.endDate || 'Present',
          isCurrent: exp.isCurrent || false,
          highlights: (exp.highlights || []).map(h => ({
            text: typeof h === 'string' ? h : h.text,
            skillsReferenced: h.skillsReferenced || [],
            provenance: {
              source: ProvenanceSource.RESUME_PARSED,
              status: ProfileVerificationStatus.UNVERIFIED,
              sourceDocumentId: masterResumeId,
              confidence: extractedData.confidence || 0.9,
              updatedAt: new Date()
            }
          })),
          provenance: {
            source: ProvenanceSource.RESUME_PARSED,
            status: ProfileVerificationStatus.UNVERIFIED,
            sourceDocumentId: masterResumeId,
            confidence: extractedData.confidence || 0.9,
            updatedAt: new Date()
          }
        });
        existingCompanies.add(key);
      }
    }
  }

  // 3. Education
  if (Array.isArray(extractedData.education) && extractedData.education.length > 0) {
    const existingEdu = new Set(this.education.map(e => `${e.institution.toLowerCase()}|${e.degree.toLowerCase()}`));
    for (const edu of extractedData.education) {
      const key = `${(edu.institution || '').toLowerCase()}|${(edu.degree || '').toLowerCase()}`;
      if (!existingEdu.has(key)) {
        this.education.push({
          id: edu.id || `edu_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          institution: edu.institution,
          degree: edu.degree,
          fieldOfStudy: edu.fieldOfStudy || '',
          startDate: edu.startDate || '',
          endDate: edu.endDate || '',
          gpa: edu.gpa || '',
          honors: edu.honors || [],
          provenance: {
            source: ProvenanceSource.RESUME_PARSED,
            status: ProfileVerificationStatus.UNVERIFIED,
            sourceDocumentId: masterResumeId,
            confidence: extractedData.confidence || 0.9,
            updatedAt: new Date()
          }
        });
        existingEdu.add(key);
      }
    }
  }

  // 4. Skills (Deduplicate by lowercase name)
  if (Array.isArray(extractedData.skills) && extractedData.skills.length > 0) {
    const existingSkillNames = new Set(this.skills.map(s => s.name.toLowerCase()));
    for (const sk of extractedData.skills) {
      const name = (sk.name || '').trim();
      if (name && !existingSkillNames.has(name.toLowerCase())) {
        this.skills.push({
          id: `skill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          category: sk.category || 'Technical',
          name: name,
          yearsOfExperience: sk.yearsOfExperience || null,
          provenance: {
            source: ProvenanceSource.RESUME_PARSED,
            status: ProfileVerificationStatus.UNVERIFIED,
            sourceDocumentId: masterResumeId,
            confidence: extractedData.confidence || 0.9,
            updatedAt: new Date()
          }
        });
        existingSkillNames.add(name.toLowerCase());
      }
    }
  }

  // 5. Projects
  if (Array.isArray(extractedData.projects) && extractedData.projects.length > 0) {
    const existingProjectTitles = new Set(this.projects.map(p => p.title.toLowerCase()));
    for (const proj of extractedData.projects) {
      const title = (proj.title || '').trim();
      if (title && !existingProjectTitles.has(title.toLowerCase())) {
        this.projects.push({
          id: proj.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: title,
          description: proj.description || '',
          technologies: proj.technologies || [],
          url: proj.url || '',
          startDate: proj.startDate || '',
          endDate: proj.endDate || '',
          highlights: proj.highlights || [],
          provenance: {
            source: ProvenanceSource.RESUME_PARSED,
            status: ProfileVerificationStatus.UNVERIFIED,
            sourceDocumentId: masterResumeId,
            confidence: extractedData.confidence || 0.9,
            updatedAt: new Date()
          }
        });
        existingProjectTitles.add(title.toLowerCase());
      }
    }
  }

  // 6. Certifications
  if (Array.isArray(extractedData.certifications) && extractedData.certifications.length > 0) {
    const existingCerts = new Set(this.certifications.map(c => c.name.toLowerCase()));
    for (const cert of extractedData.certifications) {
      const name = (cert.name || '').trim();
      if (name && !existingCerts.has(name.toLowerCase())) {
        this.certifications.push({
          id: cert.id || `cert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: name,
          issuingOrganization: cert.issuingOrganization || '',
          issueDate: cert.issueDate || '',
          expirationDate: cert.expirationDate || '',
          credentialId: cert.credentialId || '',
          credentialUrl: cert.credentialUrl || '',
          provenance: {
            source: ProvenanceSource.RESUME_PARSED,
            status: ProfileVerificationStatus.UNVERIFIED,
            sourceDocumentId: masterResumeId,
            confidence: extractedData.confidence || 0.9,
            updatedAt: new Date()
          }
        });
        existingCerts.add(name.toLowerCase());
      }
    }
  }

  // 7. Achievements
  if (Array.isArray(extractedData.achievements) && extractedData.achievements.length > 0) {
    const existingAchs = new Set(this.achievements.map(a => a.title.toLowerCase()));
    for (const ach of extractedData.achievements) {
      const title = (ach.title || '').trim();
      if (title && !existingAchs.has(title.toLowerCase())) {
        this.achievements.push({
          id: ach.id || `ach_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: title,
          description: ach.description || '',
          date: ach.date || '',
          provenance: {
            source: ProvenanceSource.RESUME_PARSED,
            status: ProfileVerificationStatus.UNVERIFIED,
            sourceDocumentId: masterResumeId,
            confidence: extractedData.confidence || 0.9,
            updatedAt: new Date()
          }
        });
        existingAchs.add(title.toLowerCase());
      }
    }
  }

  this.incrementVersion('RESUME_UPLOAD', `Ingested resume data from document ${masterResumeId}`);
};

export const ProfessionalProfile = mongoose.model('ProfessionalProfile', professionalProfileSchema);
export default ProfessionalProfile;
