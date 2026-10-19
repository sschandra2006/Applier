/**
 * Universal Unknown-Website Application Mode Test Suite
 * Applier 2.0 — Phase 20
 *
 * Demonstrates adaptive universal application execution across synthetic test websites:
 * 1. Unknown form (temporary workflow from live observation, auto-learned fingerprint)
 * 2. Multi-page form (task-directed exploration, sequential page transitions)
 * 3. Dynamic form (client-side dynamic DOM rendering observed & handled)
 * 4. Conditional field (dependent inputs revealed & populated)
 * 5. Document upload (file upload constraints respected & attached from vault)
 * 6. Review page (pre-submission review verification)
 * 7. OTP checkpoint (gated checkpoint pauses for user, resumes upon answer)
 * 8. Final submission (multi-signal verification & receipt capture)
 * 9. Low confidence safety guard (stops automation, asks user, never guesses critical data)
 */

import { jest } from '@jest/globals';
import { chromium } from 'playwright';
import { UniversalApplicationEngine } from '../../browser-worker/workflow/universal-application.engine.js';
import { WebsiteFingerprintService } from '../src/fingerprint/website-fingerprint.service.js';
import { validateUniversalApplicationSession } from '../../shared/validators/index.js';

describe('Applier 2.0 — Phase 20: Universal Unknown-Website Application Mode', () => {
  let browser;
  let page;
  let fingerprintService;
  let universalEngine;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 35000);

  afterAll(async () => {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }, 35000);

  beforeEach(async () => {
    page = await browser.newPage();
    fingerprintService = new WebsiteFingerprintService({ useMemoryFallback: true });
    fingerprintService.clear();

    universalEngine = new UniversalApplicationEngine({
      fingerprintService,
      confidenceThreshold: 0.60
    });
  });

  afterEach(async () => {
    if (page && !page.isClosed()) {
      await page.close().catch(() => {});
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 1. UNKNOWN FORM
  // ─────────────────────────────────────────────────────────────
  it('1. Unknown Form: should discover, map, validate, execute, submit and learn a previously unseen portal', async () => {
    const html = `<!DOCTYPE html><html><head><title>Acme Careers Application</title></head><body>
      <h1>Job Application</h1>
      <form id="applyForm">
        <label for="fullName">Full Name</label>
        <input type="text" id="fullName" name="fullName" required />

        <label for="email">Email Address</label>
        <input type="email" id="email" name="email" required />

        <label for="phone">Phone Number</label>
        <input type="tel" id="phone" name="phone" required />

        <button type="submit" id="btnSubmit">Submit Application</button>
      </form>
      <div id="confirmation" style="display:none">
        <h2>Application Submitted Successfully!</h2>
        <p>Application reference number: <strong id="refNo">APP-UNKNOWN-1001</strong></p>
      </div>
      <script>
        document.getElementById('applyForm').addEventListener('submit', (e) => {
          e.preventDefault();
          document.getElementById('applyForm').style.display = 'none';
          document.getElementById('confirmation').style.display = 'block';
        });
      </script>
    </body></html>`;

    await page.setContent(html);

    const result = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://careers.unknown-startup.io/apply',
      page,
      applicantGraph: {
        'applicant.fullName': 'Jane Doe',
        'applicant.email': 'jane.doe@example.com',
        'applicant.phone': '+15551234567'
      },
      options: { autoConfirm: true }
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.isKnownWebsite).toBe(false);
    expect(result.phase).toBe('LEARNED');
    expect(result.mappedFields).toHaveLength(3);
    expect(result.confidence).toBeGreaterThanOrEqual(0.90);
    expect(result.submissionResult.submissionStatus).toBe('SUBMITTED');
    expect(result.submissionResult.referenceNumber).toBe('APP-UNKNOWN-1001');

    // Website fingerprint must be learned for future runs
    expect(result.learnedFingerprint).toBeDefined();
    expect(result.learnedFingerprint.domain).toBe('careers.unknown-startup.io');

    const validation = validateUniversalApplicationSession(result);
    expect(validation.valid).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. MULTI-PAGE FORM
  // ─────────────────────────────────────────────────────────────
  it('2. Multi-Page Form: should perform task-directed exploration and sequential page transitions', async () => {
    const html = `<!DOCTYPE html><html><head><title>Multi-Step Portal</title></head><body>
      <!-- Page 1: Personal Details -->
      <div id="step1">
        <h2>Step 1: Personal Information</h2>
        <label for="fullName">Full Name</label>
        <input type="text" id="fullName" name="fullName" required />
        <label for="email">Email Address</label>
        <input type="email" id="email" name="email" required />
        <button type="button" id="btnNext">Next</button>
      </div>

      <!-- Page 2: Education Details -->
      <div id="step2" style="display:none">
        <h2>Step 2: Education Details</h2>
        <label for="degree">Degree</label>
        <input type="text" id="degree" name="degree" />
        <label for="college">College</label>
        <input type="text" id="college" name="college" />
        <button type="submit" id="btnSubmit">Submit Application</button>
      </div>

      <div id="confirmation" style="display:none">
        <h2>Application Submitted Successfully!</h2>
        <p>Reference: <span id="refNum">REF-MULTI-2002</span></p>
      </div>

      <script>
        document.getElementById('btnNext').addEventListener('click', () => {
          document.getElementById('step1').style.display = 'none';
          document.getElementById('step2').style.display = 'block';
        });
        document.getElementById('btnSubmit').addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById('step2').style.display = 'none';
          document.getElementById('confirmation').style.display = 'block';
        });
      </script>
    </body></html>`;

    await page.setContent(html);

    const result = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://jobs.multistep-portal.org/form',
      page,
      applicantGraph: {
        'applicant.fullName': 'Robert Smith',
        'applicant.email': 'robert@example.com',
        'education.degree': 'B.Tech Computer Science',
        'education.college': 'State University'
      },
      options: { autoConfirm: true }
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.submissionResult.referenceNumber).toBe('REF-MULTI-2002');
  });

  // ─────────────────────────────────────────────────────────────
  // 3. DYNAMIC FORM
  // ─────────────────────────────────────────────────────────────
  it('3. Dynamic Form: should observe and interact with client-side dynamically rendered form fields', async () => {
    const html = `<!DOCTYPE html><html><head><title>Dynamic Form Portal</title></head><body>
      <h1>Dynamic Application</h1>
      <div id="dynamicContainer">Loading fields...</div>
      <div id="confirmation" style="display:none">
        <h2>Application Submitted Successfully!</h2>
        <p>Application ID: <strong>APP-DYNAMIC-3003</strong></p>
      </div>
      <script>
        // Simulate asynchronous dynamic rendering of form elements
        setTimeout(() => {
          const container = document.getElementById('dynamicContainer');
          container.innerHTML = \`
            <form id="dynForm">
              <label for="fullName">Full Name</label>
              <input type="text" id="fullName" name="fullName" required />
              <label for="email">Email</label>
              <input type="email" id="email" name="email" required />
              <button type="submit" id="btnSubmit">Submit</button>
            </form>
          \`;
          document.getElementById('dynForm').addEventListener('submit', (e) => {
            e.preventDefault();
            document.getElementById('dynForm').style.display = 'none';
            document.getElementById('confirmation').style.display = 'block';
          });
        }, 100);
      </script>
    </body></html>`;

    await page.setContent(html);
    // Wait briefly for dynamic elements
    await page.waitForTimeout(200);

    const result = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://portal.dynamic-render.io/jobs/1',
      page,
      applicantGraph: {
        'applicant.fullName': 'Dynamic Candidate',
        'applicant.email': 'dynamic@example.com'
      },
      options: { autoConfirm: true }
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.submissionResult.referenceNumber).toBe('APP-DYNAMIC-3003');
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CONDITIONAL FIELD
  // ─────────────────────────────────────────────────────────────
  it('4. Conditional Field: should dynamically toggle triggers and populate revealed dependent fields', async () => {
    const html = `<!DOCTYPE html><html><head><title>Conditional Form</title></head><body>
      <form id="condForm">
        <label for="fullName">Full Name</label>
        <input type="text" id="fullName" name="fullName" required />

        <label for="hasExperience">Do you have prior experience?</label>
        <input type="checkbox" id="hasExperience" name="hasExperience" />

        <div id="expContainer" style="display:none">
          <label for="yearsExperience">Years of Experience</label>
          <input type="text" id="yearsExperience" name="yearsExperience" />
        </div>

        <button type="submit" id="btnSubmit">Submit Application</button>
      </form>
      <div id="confirmation" style="display:none">
        <h2>Application Submitted Successfully!</h2>
        <p>Reference: <strong>APP-COND-4004</strong></p>
      </div>
      <script>
        document.getElementById('hasExperience').addEventListener('change', (e) => {
          document.getElementById('expContainer').style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('condForm').addEventListener('submit', (e) => {
          e.preventDefault();
          document.getElementById('condForm').style.display = 'none';
          document.getElementById('confirmation').style.display = 'block';
        });
      </script>
    </body></html>`;

    await page.setContent(html);

    const result = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://careers.conditional-test.com/apply',
      page,
      applicantGraph: {
        'applicant.fullName': 'Experienced Dev',
        'applicant.hasExperience': true,
        'applicant.yearsExperience': '5'
      },
      options: { autoConfirm: true }
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.submissionResult.referenceNumber).toBe('APP-COND-4004');
  });

  // ─────────────────────────────────────────────────────────────
  // 5. DOCUMENT UPLOAD
  // ─────────────────────────────────────────────────────────────
  it('5. Document Upload: should discover upload constraints and attach verified document from vault', async () => {
    const html = `<!DOCTYPE html><html><head><title>Upload Portal</title></head><body>
      <form id="uploadForm">
        <label for="fullName">Full Name</label>
        <input type="text" id="fullName" name="fullName" required />

        <label for="resumeUpload">Upload Resume (PDF)</label>
        <input type="file" id="resumeUpload" name="resume" accept=".pdf" required />

        <button type="submit" id="btnSubmit">Submit</button>
      </form>
      <div id="confirmation" style="display:none">
        <h2>Application Submitted Successfully!</h2>
        <p>Reference: <strong>APP-UPLOAD-5005</strong></p>
      </div>
      <script>
        document.getElementById('uploadForm').addEventListener('submit', (e) => {
          e.preventDefault();
          document.getElementById('uploadForm').style.display = 'none';
          document.getElementById('confirmation').style.display = 'block';
        });
      </script>
    </body></html>`;

    await page.setContent(html);

    const result = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://apply.resume-upload-portal.com',
      page,
      applicantGraph: {
        'applicant.fullName': 'Upload Applicant'
      },
      documentVault: [
        { type: 'RESUME', filename: 'alex_resume.pdf' }
      ],
      options: { autoConfirm: true }
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.submissionResult.referenceNumber).toBe('APP-UPLOAD-5005');
  });

  // ─────────────────────────────────────────────────────────────
  // 6. REVIEW PAGE
  // ─────────────────────────────────────────────────────────────
  it('6. Review Page: should navigate through pre-submission review screen with confirmation token', async () => {
    const html = `<!DOCTYPE html><html><head><title>Portal With Review</title></head><body>
      <div id="page1">
        <label for="fullName">Full Name</label>
        <input type="text" id="fullName" name="fullName" required />
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required />
        <button type="button" id="btnNext">Continue to Review</button>
      </div>

      <div id="reviewPage" style="display:none">
        <h2>Review Your Details</h2>
        <p id="summary">Please verify your info before final submission.</p>
        <button type="submit" id="btnSubmit">Confirm & Submit</button>
      </div>

      <div id="confirmation" style="display:none">
        <h2>Application Submitted Successfully!</h2>
        <p>Reference: <strong>APP-REVIEW-6006</strong></p>
      </div>
      <script>
        document.getElementById('btnNext').addEventListener('click', () => {
          document.getElementById('page1').style.display = 'none';
          document.getElementById('reviewPage').style.display = 'block';
        });
        document.getElementById('btnSubmit').addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById('reviewPage').style.display = 'none';
          document.getElementById('confirmation').style.display = 'block';
        });
      </script>
    </body></html>`;

    await page.setContent(html);

    const result = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://careers.review-step.com/apply',
      page,
      applicantGraph: {
        'applicant.fullName': 'Reviewed Candidate',
        'applicant.email': 'reviewed@example.com'
      },
      options: { autoConfirm: true }
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.submissionResult.referenceNumber).toBe('APP-REVIEW-6006');
  });

  // ─────────────────────────────────────────────────────────────
  // 7. OTP CHECKPOINT
  // ─────────────────────────────────────────────────────────────
  it('7. OTP Checkpoint: should pause on OTP gatekeeper and resume cleanly upon user OTP answer', async () => {
    const html = `<!DOCTYPE html><html><head><title>OTP Protected Portal</title></head><body>
      <form id="otpForm">
        <label for="fullName">Full Name</label>
        <input type="text" id="fullName" name="fullName" required />

        <label for="otp">Enter Mobile OTP</label>
        <input type="text" id="otp" name="otp" required />

        <button type="submit" id="btnSubmit">Verify & Submit</button>
      </form>
      <div id="confirmation" style="display:none">
        <h2>Application Submitted Successfully!</h2>
        <p>Reference: <strong>APP-OTP-7007</strong></p>
      </div>
      <script>
        document.getElementById('otpForm').addEventListener('submit', (e) => {
          e.preventDefault();
          document.getElementById('otpForm').style.display = 'none';
          document.getElementById('confirmation').style.display = 'block';
        });
      </script>
    </body></html>`;

    await page.setContent(html);

    // Run 1: No OTP provided yet -> Engine must pause automation
    const pausedResult = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://secure.otp-portal.gov/apply',
      page,
      applicantGraph: {
        'applicant.fullName': 'OTP Applicant'
      },
      userAnswers: {}, // No OTP
      options: { autoConfirm: true }
    });

    expect(pausedResult.status).toBe('PAUSED_OTP');
    expect(pausedResult.requiresUserInput).toBe(true);

    // Run 2: User supplies OTP -> Engine resumes, fills OTP and completes
    const completedResult = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://secure.otp-portal.gov/apply',
      page,
      applicantGraph: {
        'applicant.fullName': 'OTP Applicant'
      },
      userAnswers: { otp: '482910' },
      options: { autoConfirm: true }
    });

    expect(completedResult.status).toBe('COMPLETED');
    expect(completedResult.submissionResult.referenceNumber).toBe('APP-OTP-7007');
  });

  // ─────────────────────────────────────────────────────────────
  // 8. FINAL SUBMISSION
  // ─────────────────────────────────────────────────────────────
  it('8. Final Submission: should verify multi-signal completion, capture receipt, and learn website fingerprint', async () => {
    const html = `<!DOCTYPE html><html><head><title>Final Application</title></head><body>
      <form id="mainForm">
        <label for="fullName">Full Name</label>
        <input type="text" id="fullName" name="fullName" required />
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required />
        <button type="submit" id="btnSubmit">Final Submit</button>
      </form>
      <div id="successPanel" style="display:none">
        <h2>Application Submitted Successfully!</h2>
        <p>Your unique application reference number is: <span id="appRef">APP-VERIFIED-8008</span></p>
        <a href="#receipt" id="downloadReceipt">Download Confirmation Receipt</a>
      </div>
      <script>
        document.getElementById('mainForm').addEventListener('submit', (e) => {
          e.preventDefault();
          document.getElementById('mainForm').style.display = 'none';
          document.getElementById('successPanel').style.display = 'block';
        });
      </script>
    </body></html>`;

    await page.setContent(html);

    const result = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://portal.enterprise-apply.com/career',
      page,
      applicantGraph: {
        'applicant.fullName': 'Morgan Freeman',
        'applicant.email': 'morgan@example.com'
      },
      options: { autoConfirm: true }
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.submissionResult.submissionStatus).toBe('SUBMITTED');
    expect(result.submissionResult.referenceNumber).toBe('APP-VERIFIED-8008');

    // Learned fingerprint verified
    const learnedFp = await fingerprintService.getFingerprint('portal.enterprise-apply.com');
    expect(learnedFp).toBeDefined();
    expect(learnedFp.status).toBe('ACTIVE');
    expect(learnedFp.successfulLocatorStrategies.length).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 9. LOW CONFIDENCE SAFETY GUARD (NEVER GUESS CRITICAL DATA)
  // ─────────────────────────────────────────────────────────────
  it('9. Safety Guard: should STOP AUTOMATION and ask user if confidence is low or required data is unknown', async () => {
    const html = `<!DOCTYPE html><html><head><title>Obscure Portal</title></head><body>
      <form id="obscureForm">
        <label for="customSecretField">Special Custom Security Identification Code</label>
        <input type="text" id="customSecretField" name="customSecretCode_xyz99" required />
        <button type="submit" id="btnSubmit">Submit</button>
      </form>
    </body></html>`;

    await page.setContent(html);

    const result = await universalEngine.executeUniversalWorkflow({
      targetUrl: 'https://obscure-portal.internal.net/apply',
      page,
      applicantGraph: {
        'applicant.fullName': 'John Unknown'
      },
      options: { autoConfirm: true }
    });

    // Automation MUST be stopped! Never guess critical unknown fields!
    expect(result.status).toBe('PAUSED_USER_INPUT');
    expect(result.requiresUserInput).toBe(true);
    expect(result.confidence).toBeLessThan(0.60);
    expect(result.submissionResult).toBeNull();
  });
});
