import { chromium } from 'playwright';
import { AutomationJob } from './automation.model.js';
import { AILearning } from '../ai-learning/ai-learning.model.js';
import axios from 'axios';
import { config } from '../config/env.js';
import { internalApi } from '../config/axios.js';
import { admin } from '../auth/firebase.js';
import { Application } from '../tracking/application.model.js';
import { sendNotification } from '../notifications/notifications.service.js';
import { User } from '../users/user.model.js';
import { InterviewState } from '../interview/interview-state.model.js';
import { DocumentProcessingEngine } from '../documents/document.engine.js';

export const startAutomation = async (userId, interviewStateId) => {
    const state = await InterviewState.findById(interviewStateId).populate('workflowId');
    if (!state) throw new Error('InterviewState not found');
    
    const job = new AutomationJob({
        userId,
        interviewStateId,
        workflowId: state.workflowId._id,
        status: 'QUEUED'
    });
    
    await job.save();
    
    internalApi.post(config.pythonApiUrl, {
        intent: 'plan_execution',
        raw_data: {
            jobId: job._id,
            stateId: state._id,
            answers: Object.fromEntries(state.answers || new Map()),
            workflowUrl: state.workflowId.url
        },
        workflow: state.workflowId.schemaDefinition || {}
    }).catch(err => {
        console.error('Failed to trigger python start automation:', err.message);
    });
    
    return job;
};

export const scanUrl = async (url, options = {}) => {
    const maxPages = options.maxPages || 10;
    const maxDepth = options.maxDepth || 2;
    
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
    } catch (error) {
        throw new Error(`BrowserInitializationError: Failed to launch Chromium. ${error.message}`);
    }

    try {
        const parsedStart = new URL(url);
        const baseOrigin = parsedStart.origin;
        const visitedUrls = new Set();
        const queue = [{ url, depth: 0 }];
        const scannedPages = [];
        let landingScreenshot = null;
        let landingTitle = '';

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        while (queue.length > 0 && scannedPages.length < maxPages) {
            const { url: currentUrl, depth } = queue.shift();
            
            let normalizedUrl;
            try {
                const u = new URL(currentUrl);
                u.hash = '';
                normalizedUrl = u.toString();
            } catch (e) {
                continue;
            }

            if (visitedUrls.has(normalizedUrl)) continue;
            visitedUrls.add(normalizedUrl);

            const page = await context.newPage();
            try {
                await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                try {
                    await page.waitForLoadState('networkidle', { timeout: 8000 });
                } catch (e) {
                    // Soft fallback if networkidle times out
                }

                const pageTitle = await page.title();
                const pageHtml = await page.content();
                let screenshotBase64 = null;

                if (scannedPages.length === 0) {
                    landingTitle = pageTitle;
                    const screenshotBuf = await page.screenshot({ fullPage: true });
                    screenshotBase64 = screenshotBuf.toString('base64');
                    landingScreenshot = screenshotBase64;
                }

                scannedPages.push({
                    url: normalizedUrl,
                    title: pageTitle,
                    depth,
                    html: pageHtml,
                    screenshot: screenshotBase64
                });

                // Extract internal links and application CTA options/external portal links
                if (depth < maxDepth && scannedPages.length < maxPages) {
                    const { discoveredLinks, ctaOptions } = await page.evaluate(({ origin, startPath }) => {
                        const links = new Set();
                        const ctas = [];
                        const hasFormInputs = document.querySelectorAll('input:not([type=hidden]), select, textarea').length > 0;
                        const elements = document.querySelectorAll('a[href], form[action], button[onclick], nav a');
                        
                        elements.forEach(el => {
                            let href = el.getAttribute('href') || el.getAttribute('action');
                            let text = (el.textContent || el.getAttribute('title') || '').trim();
                            if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                                try {
                                    const absUrl = new URL(href, window.location.href);
                                    const isSameOrigin = (absUrl.origin === origin);
                                    const isRootPath = absUrl.pathname === '/' || absUrl.pathname === '' || absUrl.pathname === '/index.html' || absUrl.pathname === '/home';
                                    const isCtaKeyword = /apply|register|portal|scholarship|fresh|renewal|epass|buddy4study/i.test(href + ' ' + text);

                                    // Only crawl sub-pages on the exact SAME ORIGIN domain
                                    if (isSameOrigin) {
                                        if (startPath !== '/' && isRootPath && hasFormInputs) {
                                            // Skip crawling back to root home/login page when on a specific form page
                                        } else {
                                            links.add(absUrl.href);
                                        }
                                    }

                                    if (isCtaKeyword && text.length > 2 && text.length < 100) {
                                        ctas.push({
                                            label: text,
                                            url: absUrl.href,
                                            isExternal: !isSameOrigin
                                        });
                                    }
                                } catch (e) {}
                            }
                        });
                        return { discoveredLinks: Array.from(links), ctaOptions: ctas };
                    }, { origin: baseOrigin, startPath: parsedStart.pathname });

                    for (const linkUrl of discoveredLinks) {
                        try {
                            const u = new URL(linkUrl);
                            u.hash = '';
                            if (!visitedUrls.has(u.toString())) {
                                queue.push({ url: u.toString(), depth: depth + 1 });
                            }
                        } catch (e) {}
                    }

                    if (ctaOptions && ctaOptions.length > 0) {
                        scannedPages[scannedPages.length - 1].ctaOptions = ctaOptions;
                    }
                }
            } catch (pageErr) {
                console.warn(`[SiteScanner] Warning: Failed to scan sub-page ${currentUrl}: ${pageErr.message}`);
                if (scannedPages.length === 0) {
                    throw new Error(`ApplicationAnalysisFailed: Failed to navigate and scan URL ${url}. ${pageErr.message}`);
                }
            } finally {
                await page.close().catch(() => {});
            }
        }

        const combinedHtml = scannedPages.map(p => `<!-- Page: ${p.title} (${p.url}) -->\n${p.html}`).join('\n\n');

        return {
            url,
            title: landingTitle || scannedPages[0]?.title || url,
            pagesScanned: scannedPages.length,
            pages: scannedPages,
            html: combinedHtml,
            screenshot: landingScreenshot
        };
    } finally {
        if (browser) await browser.close();
    }
};

export const saveAndStartPlan = async (jobId, plan) => {
    const job = await AutomationJob.findById(jobId);
    if (!job) throw new Error(`AutomationJob ${jobId} not found`);

    const steps = plan.steps || [];
    const targetUrl = plan.targetUrl;

    job.executionPlan = steps;
    job.progress.totalSteps = steps.length;
    job.progress.currentStep = 0;
    job.currentStepIndex = 0;
    job.status = 'RUNNING';
    await job.save();

    const state = await InterviewState.findById(job.interviewStateId);
    const answers = state ? Object.fromEntries(state.answers || new Map()) : {};

    // Execute plan asynchronously
    executePlan(jobId, targetUrl, steps, answers, 0).catch(err => {
        console.error(`[AutomationEngine] Execution error for job ${jobId}:`, err);
    });

    return job;
};

/**
 * Robustly select an option in standard HTML selects, Select2, Chosen, or custom dropdowns.
 */
export const selectOptionRobust = async (page, selector, rawValue) => {
    const valueStr = String(rawValue).trim();
    if (!selector || !valueStr) return;

    // 1. Primary Strategy: Standard Playwright selectOption with short timeout (3 seconds)
    try {
        await page.selectOption(selector, valueStr, { timeout: 3000 });
        return;
    } catch (err) {
        // Standard selectOption timed out or failed (likely Select2/hidden/label-value mismatch)
    }

    // 2. Secondary Strategy: DOM Evaluation & Event Dispatch (Handles Select2 & hidden native elements)
    const evaluated = await page.evaluate(({ sel, val }) => {
        const selectEl = document.querySelector(sel);
        if (!selectEl) return { success: false, reason: 'Element not found' };

        if (selectEl.tagName === 'SELECT') {
            const targetNorm = val.toLowerCase();
            let matchedValue = null;

            // Strategy A: Exact option value match
            for (const opt of selectEl.options) {
                if (opt.value === val || opt.value.trim().toLowerCase() === targetNorm) {
                    matchedValue = opt.value;
                    break;
                }
            }

            // Strategy B: Exact option label/text match
            if (matchedValue === null) {
                for (const opt of selectEl.options) {
                    if (opt.textContent.trim().toLowerCase() === targetNorm) {
                        matchedValue = opt.value;
                        break;
                    }
                }
            }

            // Strategy C: Partial label match (contains substring)
            if (matchedValue === null) {
                for (const opt of selectEl.options) {
                    const text = opt.textContent.trim().toLowerCase();
                    if (text.includes(targetNorm) || targetNorm.includes(text)) {
                        matchedValue = opt.value;
                        break;
                    }
                }
            }

            // Strategy D: Fallback to raw val if no option match found
            if (matchedValue === null) {
                matchedValue = val;
            }

            // Set select value
            selectEl.value = matchedValue;

            // Trigger standard browser events
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            selectEl.dispatchEvent(new Event('input', { bubbles: true }));

            // Trigger jQuery / Select2 events if present
            const $ = window.$ || window.jQuery;
            if ($ && $(selectEl)) {
                try {
                    $(selectEl).val(matchedValue).trigger('change').trigger('select2:select');
                } catch (e) {}
            }

            return { 
                success: true, 
                matchedValue, 
                isSelect2: selectEl.classList.contains('select2-hidden-accessible') || selectEl.hasAttribute('data-select2-id') 
            };
        }
        return { success: false, reason: 'Not a SELECT element' };
    }, { sel: selector, val: valueStr }).catch(() => null);

    if (evaluated && evaluated.success) {
        return;
    }

    // 3. Tertiary Strategy: Select2 Custom UI Interaction (Clicking Select2 container)
    try {
        const idClean = selector.replace('#', '');
        const select2Container = page.locator(`.select2-container[data-select2-id*="${idClean}"]`)
            .or(page.locator(`${selector} + .select2-container`))
            .or(page.locator(`.select2-container:has(${selector})`))
            .first();

        if (await select2Container.isVisible().catch(() => false)) {
            await select2Container.click().catch(() => {});
            await page.waitForTimeout(300);

            // Filter via search input if available
            const searchField = page.locator('.select2-search__field').first();
            if (await searchField.isVisible().catch(() => false)) {
                await searchField.fill(valueStr);
                await page.waitForTimeout(300);
            }

            // Click option in Select2 results overlay
            const optionLocator = page.locator(`.select2-results__option:has-text("${valueStr}")`)
                .or(page.locator('.select2-results__option--highlighted'))
                .first();

            if (await optionLocator.isVisible().catch(() => false)) {
                await optionLocator.click();
                return;
            }
        }
    } catch (e) {
        // Soft fallback
    }

    // 4. Quaternary Strategy: Try Playwright selectOption by label or value forcing
    try {
        await page.selectOption(selector, { label: valueStr }, { timeout: 5000 });
    } catch (err) {
        await page.selectOption(selector, { value: valueStr }, { timeout: 5000 }).catch(() => {});
    }
};

export const executePlan = async (jobId, targetUrl, steps, answers, startFromIndex = 0) => {
    const job = await AutomationJob.findById(jobId);
    if (!job) return;
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        await updateJobStatus(jobId, 'RUNNING', `Starting execution from step ${startFromIndex + 1}/${steps.length}`);
        
        for (let i = startFromIndex; i < steps.length; i++) {
            const step = steps[i];
            
            // Persist step index
            await AutomationJob.findByIdAndUpdate(jobId, {
                currentStepIndex: i,
                'progress.currentStep': i + 1,
                'progress.totalSteps': steps.length
            });

            await updateJobStatus(jobId, 'RUNNING', `Step ${i + 1}/${steps.length}: ${step.description || step.type}`);
            
            if (step.type === 'navigate') {
                await page.goto(step.url || targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                try {
                    await page.waitForLoadState('networkidle', { timeout: 10000 });
                } catch (e) {
                    // Soft fallback
                }
            } else if (step.type === 'fill') {
                const value = answers[step.field] || step.value;
                if (value && step.selector) {
                    try {
                        await page.fill(step.selector, String(value), { timeout: 10000 });
                    } catch (err) {
                        // Fallback: set value directly in DOM
                        await page.evaluate(({ sel, val }) => {
                            const el = document.querySelector(sel);
                            if (el) {
                                el.value = val;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }, { sel: step.selector, val: String(value) }).catch(() => {});
                    }
                }
            } else if (step.type === 'click') {
                if (step.selector) {
                    try {
                        await page.click(step.selector, { timeout: 10000 });
                    } catch (err) {
                        // Fallback: click via DOM evaluate
                        await page.evaluate((sel) => {
                            const el = document.querySelector(sel);
                            if (el) el.click();
                        }, step.selector).catch(() => {});
                    }
                }
            } else if (step.type === 'select') {
                const value = answers[step.field] || step.value;
                if (value && step.selector) {
                    await selectOptionRobust(page, step.selector, String(value));
                }
            } else if (step.type === 'upload') {
                const documentUrl = answers[step.field];
                if (documentUrl && step.selector) {
                    await updateJobStatus(jobId, 'RUNNING', `Preparing document upload for field: ${step.field}...`);
                    
                    const docResponse = await fetch(documentUrl);
                    if (!docResponse.ok) throw new Error(`Failed to download document from ${documentUrl}`);
                    
                    const arrayBuffer = await docResponse.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const mimeType = docResponse.headers.get('content-type') || 'application/octet-stream';
                    
                    const constraints = step.constraints || {}; 
                    const processedDoc = await DocumentProcessingEngine.prepareDocument(buffer, mimeType, constraints);
                    const tempFilePath = await DocumentProcessingEngine.writeToTempFile(processedDoc.buffer, processedDoc.extension);
                    
                    await updateJobStatus(jobId, 'RUNNING', `Uploading document for field: ${step.field}`);
                    await page.setInputFiles(step.selector, tempFilePath);
                }
            } else if (step.type === 'pause') {
                const pauseReason = step.pauseReason || 'OTP';
                const pauseStatus = pauseReason === 'CAPTCHA' ? 'PAUSED_CAPTCHA' : 'PAUSED_OTP';
                const fieldName = step.field || step.selector || 'verification';

                // Capture CAPTCHA image so the user can see it in the frontend
                let captchaImageBase64 = null;
                if (pauseReason === 'CAPTCHA' && step.captchaSelector) {
                    try {
                        const captchaEl = await page.$(step.captchaSelector);
                        if (captchaEl) {
                            const buf = await captchaEl.screenshot();
                            captchaImageBase64 = buf.toString('base64');
                        } else {
                            // Fall back to full-page screenshot
                            const buf = await page.screenshot({ fullPage: false });
                            captchaImageBase64 = buf.toString('base64');
                        }
                    } catch (_) {
                        const buf = await page.screenshot({ fullPage: false });
                        captchaImageBase64 = buf.toString('base64');
                    }
                }

                let pageScreenshotBase64 = null;
                try {
                    const pBuf = await page.screenshot({ fullPage: false });
                    pageScreenshotBase64 = pBuf.toString('base64');
                } catch (_) {}

                // Persist pause context so resume knows where to continue and what image to show
                await AutomationJob.findByIdAndUpdate(jobId, {
                    status: pauseStatus,
                    pauseContext: {
                        fieldName,
                        pauseReason,
                        captchaImageBase64,
                        pageScreenshotBase64,
                        stepIndex: i,
                        resumeFromIndex: i + 1,  // next step to run after user provides input
                    }
                });

                await updateJobStatus(jobId, pauseStatus,
                    `Paused: ${pauseReason} required for field "${fieldName}". Please provide the code in the chat.`,
                    { 
                        ...(captchaImageBase64 ? { captchaImageBase64 } : {}),
                        ...(pageScreenshotBase64 ? { base64Receipt: pageScreenshotBase64 } : {})
                    }
                );
                
                // Wait for user input by polling the job status (timeout 5 mins)
                let answered = false;
                let pollCount = 0;
                while (!answered && pollCount < 60) {
                    await page.waitForTimeout(5000);
                    const currentJob = await AutomationJob.findById(jobId);
                    if (currentJob && currentJob.status === 'RUNNING') {
                        answered = true;
                        // Reload answers so the next step (fill) gets the newly provided value
                        const currentState = await InterviewState.findById(job.interviewStateId);
                        if (currentState && currentState.answers) {
                            Object.assign(answers, Object.fromEntries(currentState.answers));
                        }
                        break;
                    }
                    pollCount++;
                }

                if (!answered) {
                    throw new Error(`Timeout waiting for user input for ${pauseReason}`);
                }
                
                // User answered, continue to the next step
                continue;
            } else if (step.type === 'screenshot') {
                const screenshotBuf = await page.screenshot({ fullPage: true });
                const base64Screenshot = screenshotBuf.toString('base64');
                await updateJobStatus(jobId, 'RUNNING', 'Captured application page state', { base64Receipt: base64Screenshot });
            }

            const waitTime = step.waitAfterMs || 500;
            await page.waitForTimeout(waitTime);
        }
        
        await updateJobStatus(jobId, 'COMPLETED', 'Execution finished successfully!');
    } catch (error) {
        await logJobError(jobId, error.message);
    } finally {
        await browser.close();
    }
};

export const resumePlan = async (jobId, userInput = {}) => {
    const job = await AutomationJob.findById(jobId);
    if (!job) throw new Error(`AutomationJob ${jobId} not found`);

    const state = await InterviewState.findById(job.interviewStateId);
    if (state && state.answers) {
        // Merge OTP/captcha input into answers under the paused field name
        const pausedField = job.pauseContext?.fieldName;
        for (const [key, value] of Object.entries(userInput)) {
            if (value) state.answers.set(key, value);
        }
        // Also store under the exact paused field name so the fill step finds it
        if (pausedField && (userInput.otp || userInput.captcha)) {
            state.answers.set(pausedField, userInput.otp || userInput.captcha);
        }
        state.markModified('answers');
        await state.save();
    }

    const answers = state ? Object.fromEntries(state.answers || new Map()) : {};
    const steps = job.executionPlan || [];

    const pauseCtx = job.pauseContext || {};
    const resumeIndex = pauseCtx.resumeFromIndex ?? ((job.currentStepIndex || 0) + 1);

    // Update job status back to RUNNING. The polling loop in executePlan will detect this and continue.
    await updateJobStatus(jobId, 'RUNNING', `User provided input, resuming execution...`);

    return job;
};

export const updateJobStatus = async (jobId, status, message, additionalData = {}) => {
  const job = await AutomationJob.findByIdAndUpdate(jobId, {
    status,
    $push: { 
        logs: { 
            level: status === 'FAILED' ? 'ERROR' : 'INFO', 
            message,
            additionalData 
        } 
    }
  }, { returnDocument: 'after' });
  return job;
};

export const logJobError = async (jobId, message) => {
  const job = await AutomationJob.findByIdAndUpdate(jobId, {
    status: 'FAILED',
    errorDetails: message,
    $push: { logs: { level: 'ERROR', message } }
  }, { returnDocument: 'after' });
  
  try {
     const response = await internalApi.post(config.pythonApiUrl, {
        intent: 'recover_error',
        raw_data: { logs: job.logs.map(l => l.message), message, targetUrl: "unknown" }
     });
     
     if (response.data && response.data.success) {
         console.log("AI Recovered Insight:", response.data.data);
     }
  } catch (err) {
      console.error("Failed to call AI Orchestrator for recovery", err.message);
  }
};
