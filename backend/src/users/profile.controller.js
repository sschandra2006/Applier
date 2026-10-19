/**
 * Canonical Professional Profile Controller
 * Provides CRUD, verification locking, and field provenance updates for the user profile.
 */

import { ProfessionalProfile } from './professional-profile.model.js';
import { User } from './user.model.js';
import {
  ProvenanceSource,
  ProfileVerificationStatus
} from '../../../shared/src/index.js';

export const getProfessionalProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    let profile = await ProfessionalProfile.findOne({ userId });

    if (!profile) {
      const user = await User.findById(userId);
      profile = await ProfessionalProfile.create({
        userId,
        version: 1,
        isVerified: false,
        personalInfo: {
          fullName: '',
          email: user?.email || '',
          phone: '',
          location: {},
          links: []
        }
      });
    }

    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfessionalProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    let profile = await ProfessionalProfile.findOne({ userId });

    if (!profile) {
      profile = new ProfessionalProfile({ userId });
    }

    const updates = req.body;
    const now = new Date();

    // 1. Personal Info
    if (updates.personalInfo) {
      profile.personalInfo = {
        ...profile.personalInfo.toObject(),
        ...updates.personalInfo,
        provenance: {
          source: ProvenanceSource.USER_EDITED,
          status: updates.personalInfo.isVerified ? ProfileVerificationStatus.VERIFIED : ProfileVerificationStatus.UNVERIFIED,
          updatedAt: now
        }
      };
    }

    // 2. Professional Summary
    if (updates.professionalSummary) {
      profile.professionalSummary = {
        text: typeof updates.professionalSummary === 'string' ? updates.professionalSummary : updates.professionalSummary.text,
        provenance: {
          source: ProvenanceSource.USER_EDITED,
          status: ProfileVerificationStatus.UNVERIFIED,
          updatedAt: now
        }
      };
    }

    // 3. Collections (experience, education, skills, projects, certifications, achievements)
    if (Array.isArray(updates.experience)) {
      profile.experience = updates.experience.map(exp => ({
        ...exp,
        provenance: exp.provenance || {
          source: ProvenanceSource.USER_EDITED,
          status: ProfileVerificationStatus.UNVERIFIED,
          updatedAt: now
        }
      }));
    }

    if (Array.isArray(updates.education)) {
      profile.education = updates.education.map(edu => ({
        ...edu,
        provenance: edu.provenance || {
          source: ProvenanceSource.USER_EDITED,
          status: ProfileVerificationStatus.UNVERIFIED,
          updatedAt: now
        }
      }));
    }

    if (Array.isArray(updates.skills)) {
      profile.skills = updates.skills.map(sk => ({
        ...sk,
        provenance: sk.provenance || {
          source: ProvenanceSource.USER_EDITED,
          status: ProfileVerificationStatus.UNVERIFIED,
          updatedAt: now
        }
      }));
    }

    if (Array.isArray(updates.projects)) {
      profile.projects = updates.projects.map(proj => ({
        ...proj,
        provenance: proj.provenance || {
          source: ProvenanceSource.USER_EDITED,
          status: ProfileVerificationStatus.UNVERIFIED,
          updatedAt: now
        }
      }));
    }

    if (Array.isArray(updates.certifications)) {
      profile.certifications = updates.certifications.map(cert => ({
        ...cert,
        provenance: cert.provenance || {
          source: ProvenanceSource.USER_EDITED,
          status: ProfileVerificationStatus.UNVERIFIED,
          updatedAt: now
        }
      }));
    }

    if (Array.isArray(updates.achievements)) {
      profile.achievements = updates.achievements.map(ach => ({
        ...ach,
        provenance: ach.provenance || {
          source: ProvenanceSource.USER_EDITED,
          status: ProfileVerificationStatus.UNVERIFIED,
          updatedAt: now
        }
      }));
    }

    if (updates.workPreferences) {
      profile.workPreferences = {
        ...profile.workPreferences.toObject(),
        ...updates.workPreferences
      };
    }

    profile.incrementVersion('USER_EDIT', updates.summary || 'User updated profile details');
    await profile.save();

    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
};

export const verifyProfessionalProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const profile = await ProfessionalProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found.' });
    }

    const now = new Date();

    // Mark Personal Info Verified
    if (profile.personalInfo) {
      profile.personalInfo.provenance = {
        source: profile.personalInfo.provenance?.source || ProvenanceSource.USER_CONFIRMED,
        status: ProfileVerificationStatus.VERIFIED,
        verifiedAt: now,
        updatedAt: now,
        confidence: 1.0
      };
    }

    // Mark All Experiences Verified
    profile.experience.forEach(exp => {
      exp.provenance = {
        source: exp.provenance?.source || ProvenanceSource.USER_CONFIRMED,
        status: ProfileVerificationStatus.VERIFIED,
        verifiedAt: now,
        updatedAt: now,
        confidence: 1.0
      };
      (exp.highlights || []).forEach(h => {
        h.provenance = {
          source: h.provenance?.source || ProvenanceSource.USER_CONFIRMED,
          status: ProfileVerificationStatus.VERIFIED,
          verifiedAt: now,
          updatedAt: now,
          confidence: 1.0
        };
      });
    });

    // Mark Education Verified
    profile.education.forEach(edu => {
      edu.provenance = {
        source: edu.provenance?.source || ProvenanceSource.USER_CONFIRMED,
        status: ProfileVerificationStatus.VERIFIED,
        verifiedAt: now,
        updatedAt: now,
        confidence: 1.0
      };
    });

    // Mark Skills Verified
    profile.skills.forEach(sk => {
      sk.provenance = {
        source: sk.provenance?.source || ProvenanceSource.USER_CONFIRMED,
        status: ProfileVerificationStatus.VERIFIED,
        verifiedAt: now,
        updatedAt: now,
        confidence: 1.0
      };
    });

    // Mark Projects Verified
    profile.projects.forEach(proj => {
      proj.provenance = {
        source: proj.provenance?.source || ProvenanceSource.USER_CONFIRMED,
        status: ProfileVerificationStatus.VERIFIED,
        verifiedAt: now,
        updatedAt: now,
        confidence: 1.0
      };
    });

    // Mark Certifications Verified
    profile.certifications.forEach(cert => {
      cert.provenance = {
        source: cert.provenance?.source || ProvenanceSource.USER_CONFIRMED,
        status: ProfileVerificationStatus.VERIFIED,
        verifiedAt: now,
        updatedAt: now,
        confidence: 1.0
      };
    });

    // Mark Achievements Verified
    profile.achievements.forEach(ach => {
      ach.provenance = {
        source: ach.provenance?.source || ProvenanceSource.USER_CONFIRMED,
        status: ProfileVerificationStatus.VERIFIED,
        verifiedAt: now,
        updatedAt: now,
        confidence: 1.0
      };
    });

    profile.isVerified = true;
    profile.lastVerifiedAt = now;
    profile.incrementVersion('USER_VERIFY', 'User verified and locked profile for resume tailoring');

    await profile.save();

    res.status(200).json({
      success: true,
      data: {
        isVerified: true,
        version: profile.version,
        lastVerifiedAt: profile.lastVerifiedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProfileItem = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { section, itemId } = req.params;

    const profile = await ProfessionalProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found.' });
    }

    const validSections = ['experience', 'education', 'skills', 'projects', 'certifications', 'achievements'];
    if (!validSections.includes(section)) {
      return res.status(400).json({ success: false, error: `Invalid section: ${section}` });
    }

    profile[section] = profile[section].filter(item => item.id !== itemId);
    profile.incrementVersion('FIELD_DELETE', `Deleted item ${itemId} from ${section}`);
    await profile.save();

    res.status(200).json({
      success: true,
      data: { section, itemId, remainingCount: profile[section].length }
    });
  } catch (error) {
    next(error);
  }
};
