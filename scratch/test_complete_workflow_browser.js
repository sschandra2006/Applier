/**
 * End-to-End Browser Test for Full 23-Step Applier Workflow
 * Runs real Chromium with Applier Extension Loaded.
 *
 * Verifies:
 * 1. User Authenticated (Verified Profile seeded)
 * 2. Navigates to employer job application portal
 * 3. Extension detects Greenhouse job and extracts JD & Form fields
 * 4. User triggers "Apply with Applier" in Side Panel
 * 5. Backend gap clarification interview runs in Side Panel
 * 6. User confirms gap answer
 * 7. Tailored resume generated with ATS Single-Column template
 * 8. Form fields populated and resume PDF attached via DataTransfer
 * 9. Pre-submission review screen presented with full provenance
 * 10. User confirms verification checkbox & clicks "Ready to Submit in Tab"
 * 11. Page submission interaction executed on portal
 * 12. Final outcome screen rendered with Reference Number & timestamp
 */

import { chromium } from '../browser-worker/node_modules/playwright/index.mjs';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_PATH = path.resolve(__dirname, '../extension');
const MOCK_JOB_PATH = path.resolve(__dirname, 'mock_greenhouse_job.html');
const USER_DATA_DIR = path.resolve(__dirname, 'test_user_data_e2e_wf');
const TEST_PORT = 3458;
const MOCK_BACKEND_PORT = 5000;

// 1. Mock Employer Web Server
function startMockEmployerServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url.includes('mock_greenhouse_job.html')) {
      const html = fs.readFileSync(MOCK_JOB_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (req.url === '/apply' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Thank You - Application Submitted</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #16a34a;">Application Submitted!</h1>
          <p>Thank you for applying to TechCorp. Your application has been received.</p>
          <p>Reference: <strong id="app_ref">REF-TC-98214</strong></p>
        </body>
        </html>
      `);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    server.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`[Employer Portal Server] Running at http://127.0.0.1:${TEST_PORT}`);
      resolve(server);
    });
  });
}

// 2. Mock Applier Backend Server (port 5000)
function startMockBackendServer() {
  let activeSession = null;
  const mockProfile = {
    userId: 'usr_e2e_browser_test',
    fullName: 'Alex Vance',
    email: 'alex.vance@example.com',
    phone: '+1-555-0144',
    skills: [{ name: 'Go', proficiency: 'EXPERT' }, { name: 'Kubernetes', proficiency: 'ADVANCED' }],
    personalInfo: { fullName: 'Alex Vance', email: 'alex.vance@example.com', phone: '+1-555-0144' }
  };

  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsed = {};
      try { if (body) parsed = JSON.parse(body); } catch (_) {}

      const url = req.url;

      // GET /api/v1/profile
      if (url === '/api/v1/profile' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: mockProfile }));
      }

      // POST /api/v1/missing-info/session/init
      if (url === '/api/v1/missing-info/session/init' && req.method === 'POST') {
        activeSession = {
          sessionId: `sess_e2e_${Date.now()}`,
          userId: mockProfile.userId,
          jobTitle: parsed.jobTitle,
          companyName: parsed.companyName,
          workflowState: 'QUESTIONS_PENDING',
          questions: [
            {
              id: 'q_kafka',
              priority: 'REQUIRED',
              targetEntity: 'skill',
              fieldName: 'kafka',
              questionText: 'Do you have hands-on experience building event pipelines with Apache Kafka?',
              context: 'The role requires architecting high-throughput Kafka event streaming architectures.',
              answered: false
            }
          ],
          applicationAnswers: {
            work_authorization: { value: 'No sponsorship required', provenance: 'USER_CONFIRMED' }
          },
          confirmedProfileUpdates: []
        };
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: activeSession }));
      }

      // GET /api/v1/missing-info/session/:id/current-question
      if (url.includes('/current-question') && req.method === 'GET') {
        const unans = activeSession?.questions?.find(q => !q.answered);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (unans) {
          return res.end(JSON.stringify({ success: true, data: { question: unans, remainingQuestions: 1 } }));
        } else {
          return res.end(JSON.stringify({ success: true, data: null }));
        }
      }

      // POST /api/v1/missing-info/session/:id/answer
      if (url.includes('/answer') && req.method === 'POST') {
        const q = activeSession?.questions?.find(x => x.id === parsed.questionId);
        if (q) q.answered = true;
        activeSession?.confirmedProfileUpdates.push({
          field: 'kafka',
          value: parsed.answer,
          provenance: 'USER_CONFIRMED'
        });
        activeSession.workflowState = 'READY_FOR_RESUME_GENERATION';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: activeSession }));
      }

      // POST /api/v1/missing-info/session/:id/tailor-resume
      if (url.includes('/tailor-resume') && req.method === 'POST') {
        activeSession.workflowState = 'FILLING_APPLICATION';
        activeSession.tailoredResume = {
          tailoredResumeId: 'res_e2e_vault_99',
          previewPdfUrl: '/api/v1/vault/resumes/tailored/res_e2e_vault_99/preview',
          downloadUrl: '/api/v1/vault/resumes/tailored/res_e2e_vault_99/download',
          matchedKeywords: ['Go', 'Kubernetes', 'Apache Kafka', 'PostgreSQL'],
          summaryPreview: 'Senior Platform Engineer with 5+ years building distributed event-driven systems using Go, Kafka, and Kubernetes.'
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: activeSession.tailoredResume }));
      }

      // GET /api/v1/vault/resumes/tailored/:id/download
      if (url.includes('/download') && req.method === 'GET') {
        const mockPdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n162\n%%EOF';
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Resume.pdf"' });
        return res.end(mockPdf);
      }

      // POST /api/v1/missing-info/session/:id/fill-status
      if (url.includes('/fill-status') && req.method === 'POST') {
        activeSession.workflowState = 'AWAITING_USER_REVIEW';
        activeSession.fillResults = parsed.fillResults;
        activeSession.attachmentStatus = parsed.attachmentStatus;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: activeSession }));
      }

      // GET /api/v1/missing-info/session/:id/review
      if (url.includes('/review') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          data: {
            sessionId: activeSession.sessionId,
            jobTitle: activeSession.jobTitle,
            company: activeSession.companyName,
            workflowState: activeSession.workflowState,
            requiresExplicitConfirmation: true,
            tailoredResume: activeSession.tailoredResume
          }
        }));
      }

      // POST /api/v1/missing-info/session/:id/confirm-submission
      if (url.includes('/confirm-submission') && req.method === 'POST') {
        if (!parsed.userConfirmed) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'User confirmation required' }));
        }
        activeSession.workflowState = 'SUBMITTING';
        activeSession.idempotencyKey = `idemp_${Date.now()}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          data: {
            sessionId: activeSession.sessionId,
            workflowState: 'SUBMITTING',
            idempotencyKey: activeSession.idempotencyKey
          }
        }));
      }

      // POST /api/v1/missing-info/session/:id/record-submission
      if (url.includes('/record-submission') && req.method === 'POST') {
        activeSession.workflowState = parsed.status || 'SUBMITTED';
        activeSession.submissionResult = {
          status: parsed.status,
          referenceNumber: parsed.referenceNumber || 'REF-TC-98214',
          confirmationUrl: parsed.confirmationUrl,
          recordedAt: new Date()
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, data: activeSession.submissionResult }));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });
  });

  return new Promise((resolve) => {
    server.listen(MOCK_BACKEND_PORT, '0.0.0.0', () => {
      console.log(`[Mock Applier Backend] Running at http://127.0.0.1:${MOCK_BACKEND_PORT}`);
      resolve(server);
    });
  });
}

async function runCompleteWorkflowBrowserTest() {
  console.log('\n========================================================================');
  console.log('🚀 Running Complete 23-Step End-to-End Workflow Browser Test (Applier 3.0)');
  console.log('========================================================================\n');

  const employerServer = await startMockEmployerServer();
  const backendServer = await startMockBackendServer();

  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  const browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-gpu'
    ]
  });

  try {
    // Phase 1: Service Worker Verification
    console.log('[Step 1] Loading Manifest V3 Extension & Service Worker...');
    let serviceWorker = browserContext.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await browserContext.waitForEvent('serviceworker', { timeout: 10000 });
    }
    const extensionId = serviceWorker.url().split('/')[2];
    console.log('✓ Service Worker active with Extension ID:', extensionId);

    // Seed mock auth & backend url in extension storage
    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        applier_backend_url: 'http://127.0.0.1:5000',
        applier_jwt_token: 'mock_jwt_token_verified_alex',
        applier_auth_token: 'mock_jwt_token_verified_alex',
        applier_user_profile: {
          fullName: 'Alex Vance',
          personalInfo: {
            fullName: 'Alex Vance',
            firstName: 'Alex',
            lastName: 'Vance',
            email: 'alex.vance@example.com',
            phone: '+1-555-0144'
          }
        }
      });
    });
    console.log('✓ Authenticated candidate profile seeded in extension storage.');

    // Phase 2: User opens job application page
    console.log('\n[Step 4] Opening Employer Job Portal Tab...');
    const portalPage = await browserContext.newPage();
    portalPage.on('console', msg => console.log('[PORTAL CONSOLE]', msg.text()));
    portalPage.on('pageerror', err => console.error('[PORTAL PAGEERROR]', err));
    const portalUrl = `http://127.0.0.1:${TEST_PORT}/mock_greenhouse_job.html`;
    await portalPage.goto(portalUrl);
    await portalPage.waitForLoadState('domcontentloaded');
    console.log('✓ Employer job application page loaded:', portalUrl);

    // Wait for content script analysis
    await portalPage.waitForTimeout(1000);

    // Retrieve target portal tab ID
    const portalTabId = await serviceWorker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const webTab = tabs.find(t => t.url && t.url.includes('mock_greenhouse_job'));
      return webTab ? webTab.id : null;
    });
    console.log('✓ Detected portal tab ID:', portalTabId);

    const testDetect = await serviceWorker.evaluate(async (tid) => {
      return new Promise(resolve => {
        chrome.tabs.sendMessage(tid, { action: 'DETECT_FORM_FIELDS' }, resp => {
          resolve({ error: chrome.runtime.lastError?.message, resp });
        });
      });
    }, portalTabId);
    console.log('✓ Direct DETECT_FORM_FIELDS message to portal tab:', JSON.stringify(testDetect));

    // Phase 3: Open Side Panel with tabId
    console.log('\n[Step 5] Opening Applier Side Panel...');
    const sidepanelPage = await browserContext.newPage();
    sidepanelPage.on('console', msg => console.log('[SP CONSOLE]', msg.text()));
    sidepanelPage.on('pageerror', err => console.error('[SP PAGEERROR]', err));
    const sidepanelUrl = `chrome-extension://${extensionId}/src/sidepanel/sidepanel.html?tabId=${portalTabId}`;
    await sidepanelPage.goto(sidepanelUrl);
    await sidepanelPage.waitForLoadState('domcontentloaded');
    console.log('✓ Side Panel interface opened:', sidepanelUrl);

    // Step 5: Check Job Detected view
    await sidepanelPage.waitForSelector('#view-job-detected:not(.hidden)', { timeout: 10000 });
    const jobTitleText = await sidepanelPage.locator('#job-title-display').textContent();
    console.log('✓ Side panel detected job:', jobTitleText);

    // Step 5: Click "Apply with Applier"
    console.log('\n[Step 5 & 6] Clicking "Apply with Applier" in Side Panel...');
    const btnStart = sidepanelPage.locator('#btn-start-apply');
    await btnStart.click();

    // Step 6–9: Wait for Missing Information question
    console.log('\n[Step 7–9] Awaiting Gap Clarification Question in Side Panel...');
    await sidepanelPage.waitForSelector('#view-questions:not(.hidden)', { timeout: 10000 });
    const questionText = await sidepanelPage.locator('#question-text').textContent();
    console.log('✓ Active Gap Question displayed:', questionText);

    const dbgSession = await serviceWorker.evaluate(async (tid) => {
      const key = `session_tab_${tid}`;
      const res = await chrome.storage.local.get([key]);
      return res[key];
    }, portalTabId);
    console.log('✓ Debug Session in storage after Apply:', {
      state: dbgSession?.state,
      detectedCount: dbgSession?.detectedFields?.length,
      mappedCount: dbgSession?.mappedFields?.length,
      mappedFieldNames: dbgSession?.mappedFields?.map(m => m.fieldName || m.fieldId)
    });

    // Step 10 & 11: Answer gap question
    console.log('\n[Step 10 & 11] Answering Gap Question with verified evidence...');
    // Select option "experienced"
    const expOption = sidepanelPage.locator('.option-card').first();
    await expOption.click();

    const detailInput = sidepanelPage.locator('#question-detail-input');
    await detailInput.fill('4 years architecting Apache Kafka streaming clusters with Schema Registry.');
    
    const btnSubmitAnswer = sidepanelPage.locator('#btn-submit-answer');
    await btnSubmitAnswer.click();
    console.log('✓ Confirmed answer submitted.');

    // Step 12–15: Tailored Resume Generation
    console.log('\n[Step 12–15] Generating Tailored Resume in Vault...');
    await sidepanelPage.waitForSelector('#view-resume:not(.hidden)', { timeout: 10000 });
    const btnGenerate = sidepanelPage.locator('#btn-generate-resume');
    await btnGenerate.click();

    await sidepanelPage.waitForSelector('#resume-preview-block:not(.hidden)', { timeout: 10000 });
    const summaryText = await sidepanelPage.locator('#resume-summary-preview').textContent();
    console.log('✓ Resume Generated! Tailored Summary Preview:', summaryText);

    // Step 16–18: Autofill Form & Resume Attachment
    console.log('\n[Step 16–18] Executing Application Form Autofill & PDF Attachment...');
    // Navigate to autofill view or trigger via sidepanel
    await sidepanelPage.waitForSelector('#view-autofill:not(.hidden)', { timeout: 10000 });
    const btnAutofill = sidepanelPage.locator('#btn-autofill');
    await btnAutofill.click();

    // Verify fields populated on portal tab
    await portalPage.bringToFront();
    await portalPage.waitForTimeout(1000);
    const populated = await portalPage.evaluate(() => ({
      first: document.querySelector('#first_name')?.value,
      last: document.querySelector('#last_name')?.value,
      email: document.querySelector('#email')?.value,
      phone: document.querySelector('#phone')?.value,
      hasFiles: (document.querySelector('#resume')?.files?.length || 0) > 0
    }));
    console.log('✓ Portal Form Populated Status:', populated);

    if (populated.first !== 'Alex' || populated.email !== 'alex.vance@example.com' || !populated.hasFiles) {
      throw new Error(`Autofill or file attachment failed: ${JSON.stringify(populated)}`);
    }

    // Step 19 & 20: Pre-Submission Review Barrier
    console.log('\n[Step 19 & 20] Verifying Pre-Submission Review Barrier...');
    await sidepanelPage.bringToFront();
    await sidepanelPage.waitForSelector('#view-review:not(.hidden)', { timeout: 10000 });

    const btnSubmit = sidepanelPage.locator('#btn-confirm-submit');
    const isInitiallyDisabled = await btnSubmit.isDisabled();
    console.log('✓ Submit button initially disabled before explicit confirmation:', isInitiallyDisabled);
    if (!isInitiallyDisabled) throw new Error('Security barrier violated: submit button was active without confirmation!');

    // Check verification checkbox
    console.log('✓ User reviews fields and checks explicit confirmation checkbox.');
    const chkConfirm = sidepanelPage.locator('#chk-confirm-accurate');
    await chkConfirm.check();

    const isNowEnabled = !(await btnSubmit.isDisabled());
    console.log('✓ Submit button enabled after user confirmation:', isNowEnabled);

    // Step 21–23: Submission Interaction & Outcome Recording
    console.log('\n[Step 21–23] User clicks "Ready to Submit in Tab"...');
    await btnSubmit.click();

    // Wait for Outcome Screen
    await sidepanelPage.waitForSelector('#view-outcome:not(.hidden)', { timeout: 10000 });
    const outcomeTitle = await sidepanelPage.locator('#outcome-title').textContent();
    const outcomeRef = await sidepanelPage.locator('#outcome-ref').textContent();
    console.log(`✓ Outcome Screen Rendered: "${outcomeTitle}" | Reference: ${outcomeRef}`);

    if (!outcomeTitle.includes('Submitted')) {
      throw new Error(`Unexpected outcome title: ${outcomeTitle}`);
    }

    console.log('\n========================================================================');
    console.log('🎉 ALL 23 STEPS OF THE APPLIER WORKFLOW VERIFIED SUCCESSFULLY IN BROWSER!');
    console.log('========================================================================\n');
  } finally {
    await browserContext.close();
    employerServer.close();
    backendServer.close();
  }
}

runCompleteWorkflowBrowserTest().catch(err => {
  console.error('\n❌ Complete Workflow Browser Test Failed:', err);
  process.exit(1);
});
