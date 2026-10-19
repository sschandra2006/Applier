/**
 * Applier Side Panel Controller
 * Drives multi-step state machine:
 * Auth -> Job Detected -> Analysis -> Missing Info Interview -> Resume Tailoring -> Form Fill -> Pre-submission Review
 */

import { ExtensionAction, ExtensionWorkflowState } from '../utils/constants.js';
import { ExtensionStorage } from '../utils/storage.js';
import { apiClient } from '../background/api-client.js';

class SidePanelController {
  constructor() {
    this.currentTabId = null;
    this.session = null;
    this.selectedOptionId = null;

    this.dom = {
      userBadge: document.getElementById('user-badge'),
      authView: document.getElementById('auth-view'),
      loginForm: document.getElementById('login-form'),
      loginEmail: document.getElementById('login-email'),
      loginPassword: document.getElementById('login-password'),
      errorBanner: document.getElementById('error-banner'),
      errorMessage: document.getElementById('error-message'),
      errorDismissBtn: document.getElementById('error-dismiss-btn'),

      // Views
      viewIdle: document.getElementById('view-idle'),
      viewJobDetected: document.getElementById('view-job-detected'),
      viewAnalyzing: document.getElementById('view-analyzing'),
      viewQuestions: document.getElementById('view-questions'),
      viewResume: document.getElementById('view-resume'),
      viewAutofill: document.getElementById('view-autofill'),
      viewReview: document.getElementById('view-review'),
      viewOutcome: document.getElementById('view-outcome'),

      // Outcome Elements
      outcomeIcon: document.getElementById('outcome-icon'),
      outcomeTitle: document.getElementById('outcome-title'),
      outcomeSubtitle: document.getElementById('outcome-subtitle'),
      outcomeRef: document.getElementById('outcome-ref'),
      outcomePortal: document.getElementById('outcome-portal'),
      outcomeTime: document.getElementById('outcome-time'),
      outcomeUnknownNotice: document.getElementById('outcome-unknown-notice'),
      btnOutcomeDone: document.getElementById('btn-outcome-done'),

      // Job Elements
      jobTitleDisplay: document.getElementById('job-title-display'),
      jobCompanyDisplay: document.getElementById('job-company-display'),
      jobLocationDisplay: document.getElementById('job-location-display'),
      jobAtsBadge: document.getElementById('job-ats-badge'),
      btnStartApply: document.getElementById('btn-start-apply'),
      btnRefreshStatus: document.getElementById('btn-refresh-status'),

      // Question Elements
      questionPriorityBadge: document.getElementById('question-priority-badge'),
      questionCountBadge: document.getElementById('question-count-badge'),
      questionText: document.getElementById('question-text'),
      questionContext: document.getElementById('question-context'),
      questionOptionsContainer: document.getElementById('question-options-container'),
      questionDetailsContainer: document.getElementById('question-details-container'),
      questionDetailInput: document.getElementById('question-detail-input'),
      btnSubmitAnswer: document.getElementById('btn-submit-answer'),
      btnSkipQuestion: document.getElementById('btn-skip-question'),

      // Resume Elements
      matchedKeywordsList: document.getElementById('matched-keywords-list'),
      templateSelect: document.getElementById('template-select'),
      btnGenerateResume: document.getElementById('btn-generate-resume'),
      resumePreviewBlock: document.getElementById('resume-preview-block'),
      linkPreviewPdf: document.getElementById('link-preview-pdf'),
      resumeSummaryPreview: document.getElementById('resume-summary-preview'),

      // Autofill Elements
      mappedCount: document.getElementById('mapped-count'),
      btnAutofill: document.getElementById('btn-autofill'),
      autofillProgress: document.getElementById('autofill-progress'),
      fillProgressBar: document.getElementById('fill-progress-bar'),
      fillProgressText: document.getElementById('fill-progress-text'),

      // Review Elements
      reviewFieldsList: document.getElementById('review-fields-list'),
      chkConfirmAccurate: document.getElementById('chk-confirm-accurate'),
      btnConfirmSubmit: document.getElementById('btn-confirm-submit'),

      btnResetWorkflow: document.getElementById('btn-reset-workflow')
    };

    this.init();
  }

  async init() {
    this._bindEvents();
    await this._checkAuth();
    await this._loadActiveTabSession();

    // Listen to tab switches to update state
    chrome.tabs.onActivated.addListener(() => this._loadActiveTabSession());
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (tabId === this.currentTabId && changeInfo.status === 'complete') {
        this._loadActiveTabSession();
      }
    });
  }

  _bindEvents() {
    this.dom.errorDismissBtn.addEventListener('click', () => this._hideError());

    this.dom.userBadge.addEventListener('click', () => {
      this.dom.authView.classList.toggle('hidden');
    });

    this.dom.loginForm.addEventListener('submit', (e) => this._handleLogin(e));

    this.dom.btnRefreshStatus.addEventListener('click', () => this._loadActiveTabSession());

    this.dom.btnStartApply.addEventListener('click', () => this._startApply());

    this.dom.btnSubmitAnswer.addEventListener('click', () => this._submitAnswer());

    this.dom.btnSkipQuestion.addEventListener('click', () => this._skipQuestion());

    this.dom.btnGenerateResume.addEventListener('click', () => this._generateResume());

    this.dom.btnAutofill.addEventListener('click', () => this._autofillForm());

    this.dom.chkConfirmAccurate.addEventListener('change', (e) => {
      this.dom.btnConfirmSubmit.disabled = !e.target.checked;
    });

    this.dom.btnConfirmSubmit.addEventListener('click', () => this._confirmAndSubmit());
    this.dom.btnOutcomeDone.addEventListener('click', () => {
      this._renderView(ExtensionWorkflowState.IDLE);
    });

    this.dom.btnResetWorkflow.addEventListener('click', () => this._resetWorkflow());
  }

  async _checkAuth() {
    const token = await ExtensionStorage.getAuthToken();
    const profile = await ExtensionStorage.getUserProfile();

    if (token) {
      const name = profile?.personalInfo?.fullName || 'Verified User';
      this.dom.userBadge.textContent = name;
      this.dom.userBadge.className = 'badge badge-success';
      this.dom.authView.classList.add('hidden');
    } else {
      this.dom.userBadge.textContent = 'Sign In';
      this.dom.userBadge.className = 'badge badge-unauth';
    }
  }

  async _handleLogin(e) {
    e.preventDefault();
    const email = this.dom.loginEmail.value.trim();
    const password = this.dom.loginPassword.value;

    try {
      this._hideError();
      await apiClient.login(email, password);
      await apiClient.getProfile().catch(() => null);
      await this._checkAuth();
      await this._loadActiveTabSession();
    } catch (err) {
      this._showError(err.message || 'Login failed.');
    }
  }

  async _loadActiveTabId() {
    const urlParams = new URLSearchParams(window.location.search);
    const forcedTabId = urlParams.get('tabId');
    if (forcedTabId) {
      this.currentTabId = parseInt(forcedTabId, 10);
      return this.currentTabId;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    // If current tab is the extension page itself, target the web tab
    if (tabs[0]?.url?.startsWith('chrome-extension://')) {
      const allTabs = await chrome.tabs.query({});
      const target = allTabs.find(t => t.url && t.url.startsWith('http'));
      if (target) {
        this.currentTabId = target.id;
        return this.currentTabId;
      }
    }
    this.currentTabId = tabs[0]?.id || null;
    return this.currentTabId;
  }

  async _loadActiveTabSession() {
    const tabId = await this._loadActiveTabId();
    if (!tabId) return;

    // Check session state first to protect outcome screens during confirmation redirects
    chrome.runtime.sendMessage({ action: 'GET_SESSION_STATE', payload: { tabId } }, (sessionResp) => {
      const session = sessionResp?.data;
      if (session && (session.state === ExtensionWorkflowState.SUBMITTED || session.state === ExtensionWorkflowState.SUBMISSION_STATUS_UNKNOWN)) {
        this.session = session;
        this._renderSessionState(this.session);
        return;
      }

      // Check with content script on active tab
      chrome.tabs.sendMessage(tabId, { action: ExtensionAction.CHECK_PAGE_STATUS }, async (resp) => {
        if (chrome.runtime.lastError || !resp?.data?.isJobPage) {
          if (!session || session.state === ExtensionWorkflowState.IDLE) {
            this._renderView(ExtensionWorkflowState.IDLE);
          }
          return;
        }

        if (session) {
          this.session = session;
          this._renderSessionState(this.session, resp.data);
        }
      });
    });
  }

  _renderSessionState(session, pageContext) {
    if (!session || session.state === ExtensionWorkflowState.IDLE || (session.state === ExtensionWorkflowState.JOB_DETECTED && !session.jobDetails)) {
      if (pageContext?.isJobPage) {
        // Extract preview info
        chrome.tabs.sendMessage(this.currentTabId, { action: ExtensionAction.EXTRACT_JOB_DETAILS }, (jdResp) => {
          if (jdResp?.data) {
            this.dom.jobTitleDisplay.textContent = jdResp.data.jobTitle || 'Job Application';
            this.dom.jobCompanyDisplay.textContent = jdResp.data.companyName || '';
            this.dom.jobLocationDisplay.textContent = jdResp.data.location || '';
            this.dom.jobAtsBadge.textContent = pageContext.atsType || 'Generic';
            this._renderView(ExtensionWorkflowState.JOB_DETECTED);
          }
        });
      } else {
        this._renderView(ExtensionWorkflowState.IDLE);
      }
      return;
    }

    if (session.error) {
      this._showError(session.error);
    }

    switch (session.state) {
      case ExtensionWorkflowState.JOB_DETECTED:
        if (session.jobDetails) {
          this.dom.jobTitleDisplay.textContent = session.jobDetails.jobTitle || 'Job Application';
          this.dom.jobCompanyDisplay.textContent = session.jobDetails.companyName || '';
          this.dom.jobLocationDisplay.textContent = session.jobDetails.location || '';
          this.dom.jobAtsBadge.textContent = pageContext?.atsType || 'Job Portal';
        }
        this._renderView(ExtensionWorkflowState.JOB_DETECTED);
        break;

      case ExtensionWorkflowState.ANALYZING:
        this._renderView(ExtensionWorkflowState.ANALYZING);
        break;

      case ExtensionWorkflowState.QUESTIONS_PENDING:
        this._renderQuestionCard(session.currentQuestion, session.remainingQuestions);
        this._renderView(ExtensionWorkflowState.QUESTIONS_PENDING);
        break;

      case ExtensionWorkflowState.RESUME_READY:
      case ExtensionWorkflowState.GENERATING_RESUME:
        this._renderView(ExtensionWorkflowState.RESUME_READY);
        this._renderResumeSection(session);
        break;

      case ExtensionWorkflowState.AUTOFILLING_FORM:
      case ExtensionWorkflowState.FORM_FILLED:
        this._renderView(ExtensionWorkflowState.AUTOFILLING_FORM);
        this._renderAutofillSection(session);
        break;

      case ExtensionWorkflowState.REVIEW_BARRIER:
        this._renderReviewBarrier(session);
        this._renderView(ExtensionWorkflowState.REVIEW_BARRIER);
        break;

      case ExtensionWorkflowState.SUBMITTING:
        this.dom.btnConfirmSubmit.disabled = true;
        this.dom.btnConfirmSubmit.textContent = 'Submitting Application...';
        this._renderView(ExtensionWorkflowState.REVIEW_BARRIER);
        break;

      case ExtensionWorkflowState.SUBMITTED:
      case ExtensionWorkflowState.SUBMISSION_STATUS_UNKNOWN:
        this._renderOutcomeSection(session);
        this._renderView(session.state);
        break;

      case ExtensionWorkflowState.ERROR:
        this._showError(session.error || 'An error occurred during application processing.');
        this._renderView(ExtensionWorkflowState.JOB_DETECTED);
        break;

      default:
        this._renderView(ExtensionWorkflowState.IDLE);
    }
  }

  _renderView(viewName) {
    const views = [
      this.dom.viewIdle,
      this.dom.viewJobDetected,
      this.dom.viewAnalyzing,
      this.dom.viewQuestions,
      this.dom.viewResume,
      this.dom.viewAutofill,
      this.dom.viewReview,
      this.dom.viewOutcome
    ];
    views.forEach(v => v.classList.add('hidden'));

    switch (viewName) {
      case ExtensionWorkflowState.IDLE:
        this.dom.viewIdle.classList.remove('hidden');
        break;
      case ExtensionWorkflowState.JOB_DETECTED:
        this.dom.viewJobDetected.classList.remove('hidden');
        break;
      case ExtensionWorkflowState.ANALYZING:
        this.dom.viewAnalyzing.classList.remove('hidden');
        break;
      case ExtensionWorkflowState.QUESTIONS_PENDING:
        this.dom.viewQuestions.classList.remove('hidden');
        break;
      case ExtensionWorkflowState.RESUME_READY:
      case ExtensionWorkflowState.GENERATING_RESUME:
        this.dom.viewResume.classList.remove('hidden');
        break;
      case ExtensionWorkflowState.AUTOFILLING_FORM:
        this.dom.viewAutofill.classList.remove('hidden');
        break;
      case ExtensionWorkflowState.REVIEW_BARRIER:
        this.dom.viewReview.classList.remove('hidden');
        break;
      case ExtensionWorkflowState.SUBMITTED:
      case ExtensionWorkflowState.SUBMISSION_STATUS_UNKNOWN:
        this.dom.viewOutcome.classList.remove('hidden');
        break;
    }
  }

  async _startApply() {
    this._hideError();
    this._renderView(ExtensionWorkflowState.ANALYZING);

    chrome.runtime.sendMessage({
      action: ExtensionAction.START_APPLICATION_FLOW,
      payload: { tabId: this.currentTabId }
    }, (resp) => {
      if (resp?.success && resp.data) {
        this.session = resp.data;
        this._renderSessionState(this.session);
      } else {
        this._showError(resp?.error || 'Failed to start application flow.');
        this._renderView(ExtensionWorkflowState.JOB_DETECTED);
      }
    });
  }

  _renderQuestionCard(question, remaining) {
    if (!question) {
      this._renderView(ExtensionWorkflowState.RESUME_READY);
      return;
    }

    this.dom.questionPriorityBadge.textContent = question.category || 'REQUIRED';
    this.dom.questionPriorityBadge.className = `badge ${question.category === 'REQUIRED' ? 'badge-required' : 'badge-portal'}`;
    this.dom.questionCountBadge.textContent = remaining > 0 ? `${remaining} remaining` : 'Last question';

    this.dom.questionText.textContent = question.questionText || '';
    this.dom.questionContext.textContent = question.contextExplanation || '';

    // Render interactive options
    this.dom.questionOptionsContainer.textContent = '';
    this.selectedOptionId = null;
    this.dom.questionDetailsContainer.classList.add('hidden');

    const options = question.options || [
      { id: 'experienced', label: 'Yes, I have experience with this' },
      { id: 'familiar', label: 'Basic conceptual familiarity only' },
      { id: 'none', label: 'No experience' }
    ];

    options.forEach(opt => {
      const card = document.createElement('div');
      card.className = 'option-card';
      card.dataset.id = opt.id;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'q_opt';
      radio.value = opt.id;

      const span = document.createElement('span');
      span.textContent = opt.label;

      card.appendChild(radio);
      card.appendChild(span);

      card.addEventListener('click', () => {
        document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        radio.checked = true;
        this.selectedOptionId = opt.id;

        if (opt.id === 'experienced' || opt.requiresDetails) {
          this.dom.questionDetailsContainer.classList.remove('hidden');
        } else {
          this.dom.questionDetailsContainer.classList.add('hidden');
        }
      });

      this.dom.questionOptionsContainer.appendChild(card);
    });

    // Skip visibility
    this.dom.btnSkipQuestion.style.display = question.category === 'REQUIRED' ? 'none' : 'inline-block';
  }

  async _submitAnswer() {
    if (!this.selectedOptionId) {
      this._showError('Please select an option to proceed.');
      return;
    }

    const currentQ = this.session?.currentQuestion;
    if (!currentQ) return;

    const details = this.dom.questionDetailInput.value.trim();
    const isDeclined = this.selectedOptionId === 'none';

    this.dom.btnSubmitAnswer.disabled = true;

    chrome.runtime.sendMessage({
      action: ExtensionAction.SUBMIT_GAP_ANSWER,
      payload: {
        tabId: this.currentTabId,
        questionId: currentQ.id,
        answer: {
          level: this.selectedOptionId,
          details: details || null
        },
        targetEntity: currentQ.targetEntity,
        isDeclined
      }
    }, (resp) => {
      this.dom.btnSubmitAnswer.disabled = false;
      this.dom.questionDetailInput.value = '';
      if (resp?.success && resp.data) {
        this.session = resp.data;
        this._renderSessionState(this.session);
      } else {
        this._showError(resp?.error || 'Failed to submit answer.');
      }
    });
  }

  async _skipQuestion() {
    const currentQ = this.session?.currentQuestion;
    if (!currentQ) return;

    chrome.runtime.sendMessage({
      action: ExtensionAction.SKIP_GAP_QUESTION,
      payload: {
        tabId: this.currentTabId,
        questionId: currentQ.id
      }
    }, (resp) => {
      if (resp?.success && resp.data) {
        this.session = resp.data;
        this._renderSessionState(this.session);
      }
    });
  }

  _renderResumeSection(session) {
    const keywords = session.tailoredResume?.matchedKeywords || session.jobDetails?.matchedKeywords || [];
    this.dom.matchedKeywordsList.textContent = '';
    keywords.forEach(kw => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = kw;
      this.dom.matchedKeywordsList.appendChild(tag);
    });

    if (session.tailoredResume?.tailoredResumeId) {
      this.dom.resumePreviewBlock.classList.remove('hidden');
      this.dom.resumeSummaryPreview.textContent = session.tailoredResume.summaryPreview || '';
      const previewUrl = `http://localhost:5000/api/v1/vault/resumes/tailored/${session.tailoredResume.tailoredResumeId}/preview`;
      this.dom.linkPreviewPdf.href = previewUrl;
      this.dom.btnGenerateResume.textContent = 'Re-generate Resume';

      // Show proceed to autofill button if resume is ready
      this._renderAutofillSection(session);
      this.dom.viewAutofill.classList.remove('hidden');
    } else {
      this.dom.resumePreviewBlock.classList.add('hidden');
      this.dom.btnGenerateResume.textContent = 'Generate Tailored PDF';
    }
  }

  async _generateResume() {
    const templateId = this.dom.templateSelect.value;
    this.dom.btnGenerateResume.disabled = true;
    this.dom.btnGenerateResume.textContent = 'Compiling PDF...';

    chrome.runtime.sendMessage({
      action: ExtensionAction.GENERATE_TAILORED_RESUME,
      payload: {
        tabId: this.currentTabId,
        templateId
      }
    }, (resp) => {
      this.dom.btnGenerateResume.disabled = false;
      if (resp?.success && resp.data) {
        this.session = resp.data;
        this._renderSessionState(this.session);
      } else {
        this._showError(resp?.error || 'Failed to generate tailored resume.');
      }
    });
  }

  _renderAutofillSection(session) {
    const mapped = session.mappedFields || [];
    this.dom.mappedCount.textContent = mapped.length;
    this.dom.btnAutofill.disabled = mapped.length === 0;
  }

  async _autofillForm() {
    this.dom.btnAutofill.disabled = true;
    this.dom.autofillProgress.classList.remove('hidden');

    chrome.runtime.sendMessage({
      action: ExtensionAction.AUTOFILL_APPLICATION,
      payload: { tabId: this.currentTabId }
    }, (resp) => {
      this.dom.btnAutofill.disabled = false;
      this.dom.autofillProgress.classList.add('hidden');
      if (resp?.success && resp.data) {
        this.session = resp.data;
        this._renderSessionState(this.session);
      } else {
        this._showError(resp?.error || 'Failed to fill application form.');
      }
    });
  }

  _renderReviewBarrier(session) {
    const fields = session.mappedFields || [];
    this.dom.reviewFieldsList.textContent = '';

    fields.forEach(f => {
      const row = document.createElement('div');
      row.className = 'review-field-row';

      const label = document.createElement('span');
      label.className = 'review-field-label';
      label.textContent = f.label || f.name;

      const val = document.createElement('span');
      val.className = 'review-field-value';
      val.textContent = String(f.targetValue);

      row.appendChild(label);
      row.appendChild(val);
      this.dom.reviewFieldsList.appendChild(row);
    });

    if (session.attachResult?.success) {
      const resumeRow = document.createElement('div');
      resumeRow.className = 'review-field-row';
      resumeRow.innerHTML = '<span class="review-field-label">Attached Resume</span><span class="review-field-value">✓ PDF Attached</span>';
      this.dom.reviewFieldsList.appendChild(resumeRow);
    }
  }

  _confirmAndSubmit() {
    if (!this.dom.chkConfirmAccurate.checked) {
      alert('Please check the confirmation box to verify review.');
      return;
    }

    this.dom.btnConfirmSubmit.disabled = true;
    this.dom.btnConfirmSubmit.textContent = 'Submitting Application...';

    chrome.runtime.sendMessage({
      action: ExtensionAction.CONFIRM_AND_SUBMIT,
      payload: {
        tabId: this.currentTabId,
        userConfirmed: true
      }
    }, (resp) => {
      console.log('[SidePanel] CONFIRM_AND_SUBMIT response:', JSON.stringify(resp));
      this.dom.btnConfirmSubmit.textContent = 'Ready to Submit in Tab';
      this.dom.btnConfirmSubmit.disabled = false;

      if (resp?.success && resp.data) {
        this.session = resp.data;
        this._renderSessionState(this.session);
      } else {
        console.error('[SidePanel] CONFIRM_AND_SUBMIT failed:', resp?.error);
        this._showError(resp?.error || 'Submission failed. Please check tab.');
      }
    });
  }

  _renderOutcomeSection(session) {
    const outcome = session.submissionOutcome || {};
    const isUnknown = session.state === ExtensionWorkflowState.SUBMISSION_STATUS_UNKNOWN;

    if (isUnknown) {
      this.dom.outcomeIcon.textContent = '⚠️';
      this.dom.outcomeTitle.textContent = 'Submission Status Ambiguous';
      this.dom.outcomeSubtitle.textContent = 'Your submission request could not be conclusively verified.';
      this.dom.outcomeUnknownNotice.classList.remove('hidden');
    } else {
      this.dom.outcomeIcon.textContent = '🎉';
      this.dom.outcomeTitle.textContent = 'Application Submitted!';
      this.dom.outcomeSubtitle.textContent = 'Your application has been confirmed and recorded in your Vault tracker.';
      this.dom.outcomeUnknownNotice.classList.add('hidden');
    }

    this.dom.outcomeRef.textContent = outcome.referenceNumber || session.idempotencyKey || 'N/A';
    this.dom.outcomePortal.textContent = session.jobDetails?.atsType || 'Job Portal';
    this.dom.outcomeTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async _resetWorkflow() {
    if (confirm('Reset application workflow for this tab?')) {
      chrome.runtime.sendMessage({
        action: 'RESET_SESSION_STATE',
        payload: { tabId: this.currentTabId }
      }, (resp) => {
        this.session = resp?.data || null;
        this._loadActiveTabSession();
      });
    }
  }

  _showError(msg) {
    this.dom.errorMessage.textContent = msg;
    this.dom.errorBanner.classList.remove('hidden');
  }

  _hideError() {
    this.dom.errorBanner.classList.add('hidden');
  }
}

// Launch
new SidePanelController();
