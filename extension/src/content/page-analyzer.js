/**
 * Page Analyzer Module
 * Inspects the current page DOM and URL to determine if a job application is open,
 * identifying known ATS portals (Greenhouse, Lever, Workday, Ashby, etc.) or generic forms.
 */

import { AtsType } from '../utils/constants.js';

export class PageAnalyzer {
  static analyze() {
    const url = window.location.href;
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();

    // 1. Detect ATS from Hostname / URL / DOM
    let detectedAts = AtsType.GENERIC;

    if (hostname.includes('greenhouse.io') || url.includes('greenhouse') || url.includes('gh_jid=') || document.querySelector('#application_form')) {
      detectedAts = AtsType.GREENHOUSE;
    } else if (hostname.includes('lever.co') || url.includes('lever.co')) {
      detectedAts = AtsType.LEVER;
    } else if (hostname.includes('myworkdayjobs.com') || hostname.includes('workday.com')) {
      detectedAts = AtsType.WORKDAY;
    } else if (hostname.includes('ashbyhq.com') || url.includes('ashbyhq.com')) {
      detectedAts = AtsType.ASHBY;
    } else if (hostname.includes('taleo.net')) {
      detectedAts = AtsType.TALEO;
    } else if (hostname.includes('bamboohr.com')) {
      detectedAts = AtsType.BAMBOOHR;
    }

    // 2. Check for Application Form Elements in DOM
    const hasApplicationForm = PageAnalyzer._hasApplicationForm(detectedAts);
    const hasJobDescription = PageAnalyzer._hasJobDescription(detectedAts);

    const isJobPage = (detectedAts !== AtsType.GENERIC && (hasApplicationForm || hasJobDescription)) ||
                      (hasApplicationForm && hasJobDescription);

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
    // Specific ATS markers
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

    // Generic heuristic checks
    const hasFileInput = !!document.querySelector('input[type="file"]');
    const hasNameOrEmail = !!document.querySelector(
      'input[name*="email" i], input[id*="email" i], input[name*="first_name" i], input[id*="first_name" i]'
    );
    const hasSubmitOrApply = !!document.querySelector(
      'button[type="submit"], input[type="submit"], [id*="submit" i]'
    );

    return (hasFileInput && hasNameOrEmail) || (hasNameOrEmail && hasSubmitOrApply);
  }

  static _hasJobDescription(atsType) {
    if (atsType === AtsType.GREENHOUSE && document.querySelector('#content, .app-body, .job-post')) {
      return true;
    }
    if (atsType === AtsType.LEVER && document.querySelector('.posting-headline, .section-wrapper')) {
      return true;
    }
    if (atsType === AtsType.WORKDAY && document.querySelector('[data-automation-id="jobPostingDescription"], [data-automation-id="job-posting-details"]')) {
      return true;
    }
    if (atsType === AtsType.ASHBY && document.querySelector('.ashby-job-posting-content, [class*="jobDescription"]')) {
      return true;
    }

    // Generic job post containers
    return !!document.querySelector(
      '[class*="job-description" i], [id*="job-description" i], [class*="job_description" i], [class*="posting-description" i], #content, article, main'
    );
  }
}
