import { InterviewState } from './interview-state.model.js';
import { Workflow } from '../workflow/workflow.model.js';
import { Conversation } from '../chat/conversation.model.js';
import { Message } from '../chat/message.model.js';
import { Document } from '../documents/document.model.js';
import { internalApi } from '../config/axios.js';
import { config } from '../config/env.js';

const PYTHON_API_URL = config.pythonApiUrl;

export const startInterview = async (userId, workflowId) => {
  const workflow = await Workflow.findById(workflowId);
  if (!workflow) throw new Error('Workflow not found');
  
  // Flatten all fields to find pending ones - filter out internal, pause (CAPTCHA/OTP), hidden, duplicate, and PAN number fields
  const pendingFields = [];
  const seenLabels = new Set();
  let globalStepIdx = 0;

  workflow.schemaDefinition?.pages?.forEach(page => {
    page.steps?.forEach(step => {
      const stepType = (step.type || '').toLowerCase();
      const stepId = step.id
        || step.selector?.replace(/^#/, '').replace(/[^a-z0-9_]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
        || step.label?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
        || `field_${globalStepIdx + 1}`;
      
      const stepLabel = (step.label || stepId).toLowerCase().trim();
      // Normalize label for deduplication: e.g. "firstname", "middlename", "lastname", "dateofbirth"
      const normLabel = stepLabel.replace(/[^a-z0-9]/g, '');

      const isIgnored = stepType === 'pause' || stepType === 'hidden' || stepType === 'button'
        || /captcha|recaptcha|token_number|uniquekey|saltkey|ivkey|utm|email_id1|^dob$|rvPanNum|consent|terms|declaration|disclaimer|agree|language|lang_select|translate|accessibility|fontsize|theme|cookie/i.test(stepId)
        || /captcha|token|pan number|consent|terms|condition|declaration|disclaimer|agree|select language|translation|accessibility|cookie/i.test(stepLabel);

      if (stepId && !isIgnored && !pendingFields.includes(stepId) && !seenLabels.has(normLabel)) {
        seenLabels.add(normLabel);
        pendingFields.push(stepId);
      }
      globalStepIdx++;
    });
  });
  
  const state = await InterviewState.create({
    userId,
    workflowId,
    pendingFields,
    currentField: pendingFields[0] || null,
    status: 'IN_PROGRESS'
  });
  
  // Create Conversation for history
  const conversation = await Conversation.create({
    userId,
    title: `Interview: ${workflow.name}`,
    metadata: { interviewStateId: state._id }
  });
  
  // Generate first question
  const { reply } = await processUserMessage(conversation._id, userId, "Hi, I'd like to start this application.");
  
  return { state, conversation, firstMessage: reply };
};


export const processUserMessage = async (conversationId, userId, content) => {
  const conversation = await Conversation.findOne({ _id: conversationId, userId });
  if (!conversation) throw new Error('Conversation not found');
  
  const stateId = conversation.metadata?.interviewStateId;
  if (!stateId) throw new Error('No active interview state linked to this conversation');
  
  const state = await InterviewState.findById(stateId).populate('workflowId');
  if (state.status === 'COMPLETED') {
    const completedMsg = await Message.create({
      conversationId,
      sender: 'AI',
      content: "Your interview is already complete and ready for submission! You can proceed to execute your application."
    });
    return { state, reply: completedMsg };
  }

  // Extract field metadata from scanned site workflow definition
  // Use a GLOBAL step index across all pages (matches startInterview derivation)
  const fieldDetails = {};
  if (state.workflowId?.schemaDefinition?.pages) {
    let globalIdx = 0;
    state.workflowId.schemaDefinition.pages.forEach(page => {
      page.steps?.forEach(step => {
        const stepId = step.id
          || step.selector?.replace(/^#/, '').replace(/[^a-z0-9_]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
          || step.label?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
          || `field_${globalIdx + 1}`;
        if (stepId) {
          let rawL = step.label || stepId;
          // Universal Dynamic Label Cleaner: Works for ANY website (strips DOM clutter, technical warnings, asterisks, hash notes)
          let cleanedL = String(rawL)
            .replace(/#.*$/gi, '')
            .replace(/\*.*$/gi, '')
            .replace(/[\*#:]+$/g, '')
            .trim();

          if (!cleanedL || cleanedL.length < 2) {
            cleanedL = stepId
              .replace(/([A-Z])/g, ' $1')
              .replace(/[^a-zA-Z0-9]+/g, ' ')
              .trim()
              .replace(/\b\w/g, l => l.toUpperCase());
          }

          fieldDetails[stepId] = {
            label: cleanedL,
            type: step.type || 'text',
            required: step.required || false,
            options: step.options,
            page_title: page.title,
            validation: step.validation
          };
        }
        globalIdx++;
      });
    });
  }

  // 1. Save user message
  await Message.create({ conversationId, sender: 'USER', content });
  
  // 1.5 Get Document Vault context for smart reuse
  const documents = await Document.find({ userId });
  const vaultContext = documents.map(doc => ({
      id: doc._id,
      type: doc.type,
      name: doc.fileName
  }));
  
  // 2. Prepare payload for Python AI
  const safeAnswers = state.answers instanceof Map
    ? Object.fromEntries(state.answers)
    : (state.answers ? (state.answers.toJSON ? state.answers.toJSON() : state.answers) : {});

  const appOptions = state.workflowId?.schemaDefinition?.metadata?.applicationOptions || [];
  const selectedOption = safeAnswers.selectedOption || safeAnswers.application_option || safeAnswers.option || null;

  const payload = {
    state: {
      answers: safeAnswers,
      pendingFields: state.pendingFields || [],
      completedFields: state.completedFields || [],
      currentField: state.currentField || (state.pendingFields || [])[0] || null, // active field name for AI
      currentStep: state.currentStep,
      fieldDetails: fieldDetails,
      applicationOptions: appOptions,
      selectedOption: selectedOption,
      availableDocuments: vaultContext
    },
    lastUserMessage: content
  };
  
  // 3. Call Python AI via internalApi
  let aiOutput;
  try {
    const res = await internalApi.post(config.pythonApiUrl, {
      intent: 'continue_interview',
      ...payload
    });
    aiOutput = res.data?.data || res.data;
  } catch (error) {
    console.error(`[InterviewService] AI Service failed:`, error.message);
    throw new Error(`AI Service failed: ${error.message}`);
  }
  
  // 4. Update Node State with Fuzzy Field Matching & Fallback
  const normalizeKey = k => (k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let extractedCount = 0;

  if (aiOutput && aiOutput.extracted_data && !aiOutput.requiresClarification) {
    for (const [key, value] of Object.entries(aiOutput.extracted_data)) {
      if (!value) continue;
      const normKey = normalizeKey(key);
      const matchedField = state.pendingFields.find(f => normalizeKey(f) === normKey) || key;

      if (state.answers && typeof state.answers.set === 'function') {
        state.answers.set(matchedField, value);
      } else {
        if (!state.answers) state.answers = new Map();
        state.answers.set(matchedField, value);
      }
      if (!state.completedFields.includes(matchedField)) {
        state.completedFields.push(matchedField);
      }
      state.pendingFields = state.pendingFields.filter(f => f !== matchedField && normalizeKey(f) !== normKey);
      if (state.confidenceScores && typeof state.confidenceScores.set === 'function') {
        state.confidenceScores.set(matchedField, aiOutput.confidence || 0.85);
      }
    }
  }

  // Active Field Safety Fallback: If LLM returned empty extracted_data when user provided a direct answer, save to active currentField
  if (extractedCount === 0 && content && content.trim() && state.currentField && state.pendingFields.includes(state.currentField)) {
    const isGreeting = /^(hi|hello|hey|start|scan and apply)/i.test(content.trim());
    if (!isGreeting) {
      const activeField = state.currentField;
      const val = content.trim();
      if (!state.answers) state.answers = new Map();
      if (typeof state.answers.set === 'function') {
        state.answers.set(activeField, val);
      } else {
        state.answers[activeField] = val;
      }
      if (!state.completedFields.includes(activeField)) {
        state.completedFields.push(activeField);
      }
      state.pendingFields = state.pendingFields.filter(f => f !== activeField);
      state.currentField = state.pendingFields[0] || null;
      extractedCount = 1;
      console.log(`[InterviewService] Active Field Fallback saved answer for ${activeField}: "${val}"`);
    }
  }

  // Extract the AI's response content, supporting both 'message' and 'question' schemas
  let aiResponseContent = aiOutput.message || aiOutput.question || "Thank you! All required details have been collected.";
  
  // Universal Filter: Exclude non-interactive, pause (CAPTCHA/OTP), hidden, button, consent, terms, language, and security token fields across all websites
  state.pendingFields = (state.pendingFields || []).filter(f => {
    const info = fieldDetails[f] || {};
    const fType = (info.type || '').toLowerCase();
    const fLabel = (info.label || f).toLowerCase();
    const isIgnored = fType === 'pause' || fType === 'hidden' || fType === 'button'
      || /captcha|recaptcha|token_number|uniquekey|saltkey|ivkey|utm|consent|terms|declaration|disclaimer|agree|language|lang_select|translate|accessibility|fontsize|theme|cookie/i.test(f)
      || /captcha|token|consent|terms|condition|declaration|disclaimer|agree|select language|translation|accessibility|cookie/i.test(fLabel);
    return !isIgnored;
  });

  // Update currentField to next pending after answers are recorded
  state.currentField = state.pendingFields[0] || null;

  // Ensure AI response content is ALWAYS 100% in sync with state.currentField
  if (state.status !== 'COMPLETED' && state.currentField && fieldDetails[state.currentField]) {
    const targetInfo = fieldDetails[state.currentField];
    let syncedQuestion = targetInfo.label || state.currentField;
    const targetOptions = targetInfo.options;
    if (targetOptions) {
      let optionList = [];
      if (Array.isArray(targetOptions)) {
        optionList = targetOptions.map(o => (typeof o === 'object' ? (o.label || o.text || o.value) : o)).filter(l => l && !String(l).includes('Please Select') && l !== 'none');
      } else if (typeof targetOptions === 'object') {
        optionList = Object.values(targetOptions).filter(l => l && !String(l).includes('Please Select') && l !== 'none');
      }
      if (optionList.length > 0) {
        syncedQuestion += ` (Choices: ${optionList.slice(0, 10).join(', ')})`;
      }
    }
    aiResponseContent = syncedQuestion;
  }

  if (state.pendingFields.length === 0 && (state.completedFields.length > 0 || safeAnswers && Object.keys(safeAnswers).length > 0)) {
    state.status = 'COMPLETED';
    
    // Build Markdown Summary Review Table of all collected answers
    let summaryRows = [];
    for (const [k, v] of Object.entries(safeAnswers)) {
      if (!v || k === 'selectedOption' || k === 'option' || k === 'application_type') continue;
      const info = fieldDetails[k] || {};
      const label = info.label || k.replace(/([A-Z])/g, ' $1').replace(/[^a-zA-Z0-9]+/g, ' ').trim();
      summaryRows.push(`| **${label}** | \`${v}\` |`);
    }

    let summaryTable = '';
    if (summaryRows.length > 0) {
      summaryTable = `### 📋 Application Summary Review\n\n| Field | Collected Information |\n| :--- | :--- |\n${summaryRows.join('\n')}\n\n`;
    }

    aiResponseContent = `${summaryTable}✅ **All information has been collected!** Please review your details above. If everything looks correct, click **"🚀 Submit Application"** to launch live execution.`;
  }

  state.markModified('answers');
  state.markModified('pendingFields');
  state.markModified('completedFields');
  state.markModified('currentField');
  try {
    await state.save();
  } catch (saveErr) {
    if (saveErr.name === 'VersionError') {
      console.warn('[InterviewService] VersionError caught on state.save(), updating via findByIdAndUpdate...');
      await InterviewState.findByIdAndUpdate(state._id, {
        answers: state.answers,
        pendingFields: state.pendingFields,
        completedFields: state.completedFields,
        currentField: state.currentField,
        status: state.status
      });
    } else {
      throw saveErr;
    }
  }
  
  // 5. Save AI message with options metadata if next field has dropdown options
  const nextFieldInfo = fieldDetails[state.currentField] || {};
  const nextFieldOptions = nextFieldInfo.options || (aiOutput.options ? aiOutput.options : null);

  const aiMessage = await Message.create({
    conversationId,
    sender: 'AI',
    content: aiResponseContent,
    metadata: {
      options: nextFieldOptions,
      currentField: state.currentField
    }
  });
  
  return { state, reply: aiMessage };
};
