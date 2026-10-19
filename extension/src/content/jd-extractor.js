/**
 * Job Description Extractor Module
 * Extracts job title, company, location, full text, and screening questions.
 * Uses prioritized selectors for major ATS platforms with robust heuristic fallbacks.
 */

import { AtsType } from '../utils/constants.js';

export class JdExtractor {
  static extract(atsType = AtsType.GENERIC) {
    const jobTitle = JdExtractor._extractJobTitle(atsType);
    const companyName = JdExtractor._extractCompanyName(atsType);
    const location = JdExtractor._extractLocation(atsType);
    const rawJobDescription = JdExtractor._extractJobDescription(atsType);
    const applicationQuestions = JdExtractor._extractScreeningQuestions();

    return {
      jobTitle: jobTitle || 'Target Role',
      companyName: companyName || 'Target Company',
      location: location || '',
      rawJobDescription: rawJobDescription || document.body.innerText.substring(0, 5000),
      applicationQuestions,
      extractedAt: new Date().toISOString()
    };
  }

  static _extractJobTitle(atsType) {
    const selectors = [
      // Greenhouse
      '.app-title', '#app-title', 'h1.app-title', '.job-title',
      // Lever
      '.posting-headline h2', '.posting-headline h1',
      // Workday
      '[data-automation-id="jobPostingHeader"]', 'h2[data-automation-id="jobPostingHeader"]',
      // Ashby
      '.ashby-job-posting-heading h1', '[data-testid="job-title"]',
      // Generic fallbacks
      'h1[class*="title" i]', 'h1[class*="job" i]', 'h1[class*="role" i]',
      'h1', 'h2.title'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) {
        const text = el.innerText.trim();
        // Remove extraneous prefix/suffix
        return text.split('\n')[0].trim();
      }
    }

    // Document title fallback
    const docTitle = document.title;
    if (docTitle && docTitle.includes(' - ')) {
      return docTitle.split(' - ')[0].trim();
    }
    if (docTitle && docTitle.includes(' | ')) {
      return docTitle.split(' | ')[0].trim();
    }

    return null;
  }

  static _extractCompanyName(atsType) {
    // 1. Check meta tags
    const metaCompany = document.querySelector('meta[property="og:site_name"], meta[name="company"]');
    if (metaCompany && metaCompany.getAttribute('content')) {
      return metaCompany.getAttribute('content').trim();
    }

    // 2. ATS Specific
    if (atsType === AtsType.GREENHOUSE) {
      const ghCompany = document.querySelector('.company-name, .logo-container img');
      if (ghCompany) {
        return (ghCompany.innerText || ghCompany.getAttribute('alt') || '').replace(/^at\s+/i, '').trim();
      }
      // Often subdomain or path: boards.greenhouse.io/{company}
      const match = window.location.pathname.match(/\/([^/]+)\/jobs/);
      if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }

    if (atsType === AtsType.LEVER) {
      const match = window.location.pathname.match(/\/([^/]+)\/[a-f0-9-]+/);
      if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }

    // 3. Document Title parsing
    const docTitle = document.title;
    if (docTitle && docTitle.includes(' at ')) {
      return docTitle.split(' at ')[1].split(' - ')[0].trim();
    }

    // Fallback: Hostname main label
    const parts = window.location.hostname.split('.');
    if (parts.length >= 2 && !['greenhouse', 'lever', 'workday', 'ashbyhq'].includes(parts[0])) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }

    return null;
  }

  static _extractLocation(atsType) {
    const selectors = [
      '.location', '[class*="location" i]', '.posting-categories .location',
      '[data-automation-id="locations"]', '[data-automation-id="job-location"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) {
        return el.innerText.trim();
      }
    }
    return '';
  }

  static _extractJobDescription(atsType) {
    const containers = [
      // Greenhouse
      '#content', '.job-post', '#job-details',
      // Lever
      '.section-wrapper.page-full-width', '.posting-page .content',
      // Workday
      '[data-automation-id="jobPostingDescription"]',
      // Ashby
      '.ashby-job-posting-content',
      // Generic
      '[class*="job-description" i]', '[id*="job-description" i]',
      'article', 'main'
    ];

    let contentEl = null;
    for (const sel of containers) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.length > 200) {
        contentEl = el;
        break;
      }
    }

    if (!contentEl) {
      contentEl = document.body;
    }

    // Clone element to sanitize
    const clone = contentEl.cloneNode(true);
    // Remove scripts, styles, forms, headers, footers
    const removeSelectors = ['script', 'style', 'noscript', 'form', 'nav', 'header', 'footer', 'button', 'input'];
    clone.querySelectorAll(removeSelectors.join(',')).forEach(el => el.remove());

    return clone.innerText.replace(/\s+/g, ' ').trim();
  }

  static _extractScreeningQuestions() {
    const questions = [];
    const questionContainers = document.querySelectorAll(
      '.field, .application-question, [data-automation-id*="question"], .form-group'
    );

    questionContainers.forEach((container, idx) => {
      const label = container.querySelector('label, .label, legend');
      const input = container.querySelector('input, select, textarea');
      if (label && input) {
        const text = label.innerText.replace(/\*$/, '').trim();
        // Ignore standard contact fields
        const lower = text.toLowerCase();
        if (!lower.includes('first name') && !lower.includes('last name') &&
            !lower.includes('email') && !lower.includes('phone') && !lower.includes('resume')) {
          questions.push({
            id: input.id || input.name || `q_${idx}`,
            questionText: text,
            type: input.tagName.toLowerCase()
          });
        }
      }
    });

    return questions;
  }
}
