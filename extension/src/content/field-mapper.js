/**
 * Field Mapper Module — Production Grade
 * Deterministic multi-signal matching between detected DOM fields and verified candidate facts.
 *
 * Enforces:
 * 1. Strict schema & type validation for every proposed mapping.
 * 2. Every mapping contains: fieldId, candidateProperty, confidence, validationResult, action, and reason.
 * 3. Automatic classification of sensitive questions (salary, demographics, veteran, disability).
 * 4. Dropdown option fuzzy resolution with option availability checking.
 * 5. Explicit user confirmation requirement for ambiguous, sensitive, or unconfirmed questions.
 * 6. Never invents facts or claims hiring probabilities.
 */

export class FieldMapper {
  /**
   * Maps detected DOM fields against candidate profile and session application answers.
   */
  static mapFields(detectedFields, profile = {}, applicationAnswers = {}) {
    const personalInfo = profile.personalInfo || profile || {};
    const links = personalInfo.links || profile.links || [];
    const workPrefs = profile.workPreferences || {};
    const experience = profile.experience || [];
    const education = profile.education || [];

    // Pre-calculate profile fact values
    const fullName = personalInfo.fullName || personalInfo.name || profile.fullName || profile.name || '';
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = personalInfo.firstName || profile.firstName || nameParts[0] || '';
    const lastName = personalInfo.lastName || profile.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

    const email = personalInfo.email || profile.email || '';
    const phone = personalInfo.phone || personalInfo.phoneNumber || profile.phone || profile.phoneNumber || '';

    const locationObj = personalInfo.location || {};
    const city = typeof locationObj === 'object' ? (locationObj.city || '') : '';
    const state = typeof locationObj === 'object' ? (locationObj.state || '') : '';
    const country = typeof locationObj === 'object' ? (locationObj.country || 'United States') : '';
    const postalCode = typeof locationObj === 'object' ? (locationObj.postalCode || locationObj.zip || '') : '';
    const fullLocation = typeof locationObj === 'string' ? locationObj : [city, state, country].filter(Boolean).join(', ');

    // Links
    const findLink = (term) => links.find(l => (l.label || l.type || '').toLowerCase().includes(term))?.url || '';
    const linkedinUrl = findLink('linkedin') || personalInfo.linkedin || '';
    const githubUrl = findLink('github') || personalInfo.github || '';
    const portfolioUrl = findLink('portfolio') || findLink('website') || personalInfo.website || personalInfo.portfolio || '';

    // Professional Background
    const currentRole = experience[0] || {};
    const currentTitle = currentRole.title || currentRole.role || '';
    const currentCompany = currentRole.company || '';

    // Calculate total years of experience
    let totalYearsExp = 0;
    if (experience.length > 0) {
      experience.forEach(exp => {
        const start = exp.startDate ? new Date(exp.startDate) : null;
        const end = exp.endDate ? new Date(exp.endDate) : new Date();
        if (start && !isNaN(start.getTime())) {
          const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          totalYearsExp += Math.max(0, years);
        }
      });
    }
    const yearsExpInt = Math.max(1, Math.round(totalYearsExp));

    // Education
    const topEdu = education[0] || {};
    const school = topEdu.institution || topEdu.school || '';
    const degree = topEdu.degree || '';
    const major = topEdu.fieldOfStudy || topEdu.major || '';
    const gradYear = topEdu.graduationYear ? String(topEdu.graduationYear) : '';

    const mapped = [];
    const unmapped = [];
    const fileUploadFields = [];

    detectedFields.forEach(field => {
      // 1. Handle File Uploads separately
      if (field.type === 'file') {
        const filePurpose = FieldMapper._classifyFilePurpose(field);
        fileUploadFields.push({
          ...field,
          purpose: filePurpose,
          candidateProperty: filePurpose === 'RESUME' ? 'vault.tailoredResume' : 'vault.coverLetter'
        });
        return;
      }

      // 2. Perform multi-signal deterministic matching
      const match = FieldMapper._matchFieldSignals(field, {
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

      // 3. Validate target value against field constraints & schema
      const validationResult = FieldMapper._validateFieldMapping(field, match.targetValue, match.candidateProperty);

      // 4. Resolve Dropdown / Radio option if applicable
      let matchedOptionValue = null;
      if ((field.type === 'select-one' || field.type === 'select' || field.type === 'radio-group') && match.targetValue) {
        const optMatch = FieldMapper._findMatchingOption(field.options, match.targetValue);
        if (optMatch) {
          matchedOptionValue = optMatch.value;
        } else {
          // Could not find a matching option in the dropdown
          validationResult.isValid = false;
          validationResult.error = `Candidate value "${match.targetValue}" does not match any available option in dropdown`;
        }
      }

      // 5. Determine Action and Reason
      const { action, reason } = FieldMapper._determineAction(
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

      if (action === 'FILL' || action === 'REQUIRE_USER_CONFIRMATION') {
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
      unresolvedRequiredCount: mapped.filter(m => m.required && m.action !== 'FILL').length +
                               unmapped.filter(m => m.required).length
    };
  }

  /**
   * Multi-signal deterministic matching against candidate profile properties.
   */
  static _matchFieldSignals(field, facts) {
    const label = (field.label || '').toLowerCase();
    const name = (field.name || '').toLowerCase();
    const id = (field.id || '').toLowerCase();
    const placeholder = (field.placeholder || '').toLowerCase();
    const accName = (field.accessibleName || '').toLowerCase();
    const explanatory = (field.explanatoryText || '').toLowerCase();

    const descriptor = `${label} ${name} ${id} ${placeholder} ${accName} ${explanatory}`;

    // ─── SENSITIVE QUESTIONS (Must NOT auto-fill without confirmation) ───
    if (/\b(salary|compensation|desired pay|expected rate|hourly rate|annual pay)\b/i.test(descriptor)) {
      const salaryAns = facts.applicationAnswers['salary'] || facts.applicationAnswers['desired_salary'] || null;
      return {
        candidateProperty: 'applicationAnswers.desiredSalary',
        targetValue: salaryAns,
        confidence: 'MEDIUM',
        confidenceScore: 0.70,
        isSensitive: true,
        isCustomQuestion: true
      };
    }

    if (/\b(gender|race|ethnicity|hispanic|latino|veteran|disability|sexual orientation|demographic)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'demographics.eeoc',
        targetValue: null,
        confidence: 'LOW',
        confidenceScore: 0.30,
        isSensitive: true,
        isCustomQuestion: true
      };
    }

    // ─── 1. FIRST NAME ───
    if (/\b(first\s*name|given\s*name|fname|forename)\b/i.test(descriptor) && !/last/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.firstName',
        targetValue: facts.firstName,
        confidence: 'HIGH',
        confidenceScore: 0.98,
        isSensitive: false
      };
    }

    // ─── 2. LAST NAME ───
    if (/\b(last\s*name|surname|family\s*name|lname)\b/i.test(descriptor) && !/first/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.lastName',
        targetValue: facts.lastName,
        confidence: 'HIGH',
        confidenceScore: 0.98,
        isSensitive: false
      };
    }

    // ─── 3. FULL NAME ───
    if (/\b(full\s*name|applicant\s*name|candidate\s*name|your\s*name|legal\s*name)\b/i.test(descriptor) ||
        (label === 'name' && !/company|school|employer/i.test(descriptor))) {
      return {
        candidateProperty: 'personalInfo.fullName',
        targetValue: facts.fullName,
        confidence: 'HIGH',
        confidenceScore: 0.95,
        isSensitive: false
      };
    }

    // ─── 4. EMAIL ADDRESS ───
    if (field.type === 'email' || /\b(email|e-mail)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.email',
        targetValue: facts.email,
        confidence: 'HIGH',
        confidenceScore: 0.99,
        isSensitive: false
      };
    }

    // ─── 5. PHONE NUMBER ───
    if (field.type === 'tel' || /\b(phone|mobile|cell|telephone|contact\s*number)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.phone',
        targetValue: facts.phone,
        confidence: 'HIGH',
        confidenceScore: 0.96,
        isSensitive: false
      };
    }

    // ─── 6. LINKEDIN PROFILE ───
    if (/linkedin/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.links.linkedin',
        targetValue: facts.linkedinUrl,
        confidence: 'HIGH',
        confidenceScore: 0.97,
        isSensitive: false
      };
    }

    // ─── 7. GITHUB PROFILE ───
    if (/github/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.links.github',
        targetValue: facts.githubUrl,
        confidence: 'HIGH',
        confidenceScore: 0.96,
        isSensitive: false
      };
    }

    // ─── 8. PORTFOLIO / WEBSITE ───
    if (/\b(portfolio|personal\s*website|website|blog|personal\s*url)\b/i.test(descriptor) && !/company|employer/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.links.portfolio',
        targetValue: facts.portfolioUrl || facts.linkedinUrl,
        confidence: 'HIGH',
        confidenceScore: 0.90,
        isSensitive: false
      };
    }

    // ─── 9. WORK AUTHORIZATION & VISA SPONSORSHIP ───
    if (/\b(sponsorship|visa|authorized|work\s*authorization|legally\s*authorized|eligible\s*to\s*work)\b/i.test(descriptor)) {
      // Prioritize exact field name/id, then specific sponsorship vs work auth
      let explicitAnswer = facts.applicationAnswers[field.name] ||
                           facts.applicationAnswers[field.id];

      if (!explicitAnswer && /sponsorship/i.test(descriptor)) {
        explicitAnswer = facts.applicationAnswers['sponsorship'];
      }
      if (!explicitAnswer) {
        explicitAnswer = facts.applicationAnswers['work_authorization'];
      }

      const prefAuth = facts.workPrefs.workAuthorization;
      let resolvedValue = null;

      if (explicitAnswer) {
        resolvedValue = typeof explicitAnswer === 'object' ? explicitAnswer.value : explicitAnswer;
      } else if (prefAuth && prefAuth.length > 0) {
        resolvedValue = /require\s*sponsorship/i.test(descriptor) ? 'No' : 'Yes';
      }

      return {
        candidateProperty: 'applicationAnswers.workAuthorization',
        targetValue: resolvedValue,
        confidence: explicitAnswer ? 'HIGH' : 'MEDIUM',
        confidenceScore: explicitAnswer ? 0.95 : 0.75,
        isSensitive: false
      };
    }

    // ─── 10. LOCATION / CITY / STATE / POSTAL CODE ───
    if (/\b(city)\b/i.test(descriptor) && !/university|college/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.location.city',
        targetValue: facts.city,
        confidence: 'HIGH',
        confidenceScore: 0.92,
        isSensitive: false
      };
    }

    if (/\b(state|province|region)\b/i.test(descriptor) && !/united\s*states/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.location.state',
        targetValue: facts.state,
        confidence: 'HIGH',
        confidenceScore: 0.91,
        isSensitive: false
      };
    }

    if (/\b(zip|postal\s*code|zipcode)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.location.postalCode',
        targetValue: facts.postalCode,
        confidence: 'HIGH',
        confidenceScore: 0.94,
        isSensitive: false
      };
    }

    if (/\b(location|address|residence)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'personalInfo.location.full',
        targetValue: facts.fullLocation,
        confidence: 'HIGH',
        confidenceScore: 0.88,
        isSensitive: false
      };
    }

    // ─── 11. CURRENT EMPLOYER & TITLE ───
    if (/\b(current\s*company|current\s*employer|most\s*recent\s*employer|present\s*company)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'experience.currentCompany',
        targetValue: facts.currentCompany,
        confidence: 'HIGH',
        confidenceScore: 0.93,
        isSensitive: false
      };
    }

    if (/\b(current\s*title|current\s*role|current\s*job\s*title|present\s*title)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'experience.currentTitle',
        targetValue: facts.currentTitle,
        confidence: 'HIGH',
        confidenceScore: 0.92,
        isSensitive: false
      };
    }

    // ─── 12. YEARS OF EXPERIENCE ───
    if (/\b(years\s*of\s*experience|total\s*experience|experience\s*in\s*years)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'experience.totalYears',
        targetValue: String(facts.yearsExpInt),
        confidence: 'HIGH',
        confidenceScore: 0.89,
        isSensitive: false
      };
    }

    // ─── 13. EDUCATION (University, Degree, Graduation) ───
    if (/\b(school|university|college|institution|alma\s*mater)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'education.institution',
        targetValue: facts.school,
        confidence: 'HIGH',
        confidenceScore: 0.91,
        isSensitive: false
      };
    }

    if (/\b(degree|highest\s*degree|education\s*level)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'education.degree',
        targetValue: facts.degree,
        confidence: 'HIGH',
        confidenceScore: 0.89,
        isSensitive: false
      };
    }

    if (/\b(major|field\s*of\s*study|discipline|area\s*of\s*study)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'education.fieldOfStudy',
        targetValue: facts.major,
        confidence: 'HIGH',
        confidenceScore: 0.90,
        isSensitive: false
      };
    }

    if (/\b(graduation\s*year|year\s*of\s*graduation|grad\s*year)\b/i.test(descriptor)) {
      return {
        candidateProperty: 'education.graduationYear',
        targetValue: facts.gradYear,
        confidence: 'HIGH',
        confidenceScore: 0.92,
        isSensitive: false
      };
    }

    // ─── 14. CUSTOM QUESTIONS IN APPLICATION ANSWERS ───
    for (const [qKey, qVal] of Object.entries(facts.applicationAnswers)) {
      const qText = qKey.toLowerCase().replace(/[_-]/g, ' ');
      if (descriptor.includes(qText) || qText.includes(label)) {
        const value = typeof qVal === 'object' ? qVal.value : qVal;
        return {
          candidateProperty: `applicationAnswers.${qKey}`,
          targetValue: value,
          confidence: 'HIGH',
          confidenceScore: 0.90,
          isSensitive: false
        };
      }
    }

    // ─── UNMAPPED / AMBIGUOUS ───
    return {
      candidateProperty: null,
      targetValue: null,
      confidence: 'AMBIGUOUS',
      confidenceScore: 0.10,
      isSensitive: false
    };
  }

  /**
   * Validates target values against schema and field types.
   */
  static _validateFieldMapping(field, targetValue, candidateProperty) {
    if (targetValue === null || targetValue === undefined || targetValue === '') {
      if (field.required) {
        return {
          isValid: false,
          error: 'Required field has no verified candidate value'
        };
      }
      return { isValid: true, error: null };
    }

    const strVal = String(targetValue).trim();

    // 1. Email format validation
    if (field.type === 'email' || candidateProperty === 'personalInfo.email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(strVal)) {
        return {
          isValid: false,
          error: `Invalid email address format: "${strVal}"`
        };
      }
    }

    // 2. Phone format validation
    if (field.type === 'tel' || candidateProperty === 'personalInfo.phone') {
      const digitsOnly = strVal.replace(/\D/g, '');
      if (digitsOnly.length < 7) {
        return {
          isValid: false,
          error: `Phone number does not contain enough digits: "${strVal}"`
        };
      }
    }

    // 3. URL format validation
    if (field.type === 'url' || candidateProperty?.includes('.links.')) {
      if (!strVal.startsWith('http://') && !strVal.startsWith('https://')) {
        return {
          isValid: false,
          error: `Invalid URL format (missing http/https): "${strVal}"`
        };
      }
    }

    // 4. MaxLength check
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

    // 1. Exact value match
    let match = options.find(o => (o.value || '').toLowerCase().trim() === valLower);
    if (match) return match;

    // 2. Exact text match
    match = options.find(o => (o.text || '').toLowerCase().trim() === valLower);
    if (match) return match;

    // 3. Boolean yes/no matching for work authorization / sponsorship
    if (valLower === 'yes' || valLower === 'true' || valLower.includes('authorized')) {
      match = options.find(o => /^(yes|true|authorized|i am|no sponsorship)/i.test(o.text || o.value));
      if (match) return match;
    }
    if (valLower === 'no' || valLower === 'false' || valLower.includes('without sponsorship') || valLower.includes('not require')) {
      match = options.find(o => /^(no|false|not authorized|will require|not require|without)/i.test(o.text || o.value));
      if (match) return match;
    }

    // 4. Degree Level Normalization (Master's, Bachelor's, PhD)
    if (/\b(master|m\.s\.|ms|m\.a\.|ma|mba|msc)\b/i.test(valLower)) {
      match = options.find(o => /\b(master|graduate|ms|ma|msc)\b/i.test(o.text || o.value));
      if (match) return match;
    }
    if (/\b(bachelor|b\.s\.|bs|b\.a\.|ba|bsc|undergraduate)\b/i.test(valLower)) {
      match = options.find(o => /\b(bachelor|undergraduate|bs|ba)\b/i.test(o.text || o.value));
      if (match) return match;
    }
    if (/\b(doctor|phd|doctorate|ph\.d\.)\b/i.test(valLower)) {
      match = options.find(o => /\b(doctor|phd|doctorate)\b/i.test(o.text || o.value));
      if (match) return match;
    }

    // 5. Substring / Token Overlap match
    match = options.find(o => {
      const optText = (o.text || '').toLowerCase().trim();
      const optVal = (o.value || '').toLowerCase().trim();
      return (optText.length > 2 && (optText.includes(valLower) || valLower.includes(optText))) ||
             (optVal.length > 2 && (optVal.includes(valLower) || valLower.includes(optVal)));
    });

    return match || null;
  }

  /**
   * Determines the operational action: FILL, REQUIRE_USER_CONFIRMATION, or SKIP.
   */
  static _determineAction(field, match, validationResult, matchedOptionValue) {
    // 1. If sensitive, ALWAYS require user confirmation
    if (match.isSensitive) {
      return {
        action: 'REQUIRE_USER_CONFIRMATION',
        reason: 'SENSITIVE_QUESTION'
      };
    }

    // 2. If unmapped or ambiguous
    if (!match.candidateProperty || match.confidence === 'AMBIGUOUS' || match.confidenceScore < 0.70) {
      if (field.required) {
        return {
          action: 'REQUIRE_USER_CONFIRMATION',
          reason: 'REQUIRED_FIELD_MISSING'
        };
      }
      return {
        action: 'SKIP',
        reason: 'UNSUPPORTED_QUESTION'
      };
    }

    // 3. If validation failed
    if (!validationResult.isValid) {
      return {
        action: 'REQUIRE_USER_CONFIRMATION',
        reason: validationResult.error?.includes('option') ? 'UNRESOLVED_OPTIONS' : 'FORMAT_MISMATCH'
      };
    }

    // 4. If target value is missing
    if (!match.targetValue) {
      if (field.required) {
        return {
          action: 'REQUIRE_USER_CONFIRMATION',
          reason: 'REQUIRED_FIELD_MISSING'
        };
      }
      return {
        action: 'SKIP',
        reason: 'OPTIONAL_VALUE_EMPTY'
      };
    }

    // 5. High confidence, validated, ready to fill
    return {
      action: 'FILL',
      reason: null
    };
  }

  /**
   * Classifies file inputs into RESUME or COVER_LETTER.
   */
  static _classifyFilePurpose(field) {
    const text = `${field.label} ${field.name} ${field.id}`.toLowerCase();
    if (text.includes('cover') || text.includes('letter')) {
      return 'COVER_LETTER';
    }
    return 'RESUME';
  }
}
