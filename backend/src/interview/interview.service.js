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
  
  // Flatten all fields to find pending ones (Updated to Canonical Schema: pages -> steps)
  const pendingFields = [];
  workflow.schemaDefinition?.pages?.forEach(page => {
    page.steps?.forEach(step => {
      if (step.required && step.id) pendingFields.push(step.id);
    });
  });
  
  const state = await InterviewState.create({
    userId,
    workflowId,
    pendingFields,
    status: 'IN_PROGRESS'
  });
  
  // Create Conversation for history
  const conversation = await Conversation.create({
    userId,
    title: `Interview: ${workflow.name}`,
    metadata: { interviewStateId: state._id }
  });
  
  // Generate first question
  await processUserMessage(conversation._id, userId, "Hi, I'd like to start this application.");
  
  return { state, conversation };
};

export const processUserMessage = async (conversationId, userId, content) => {
  const conversation = await Conversation.findOne({ _id: conversationId, userId });
  if (!conversation) throw new Error('Conversation not found');
  
  const stateId = conversation.metadata?.interviewStateId;
  if (!stateId) throw new Error('No active interview state linked to this conversation');
  
  const state = await InterviewState.findById(stateId);
  if (state.status === 'COMPLETED') throw new Error('Interview already completed');
  
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
  const payload = {
    state: {
      answers: Object.fromEntries(state.answers || new Map()),
      pendingFields: state.pendingFields,
      completedFields: state.completedFields,
      currentStep: state.currentStep,
      availableDocuments: vaultContext
    },
    lastUserMessage: content
  };
  
  // 3. Call Python AI via internalApi
  let aiOutput;
  try {
    const res = await internalApi.post(`${PYTHON_API_URL}/interview/turn`, payload);
    aiOutput = res.data.data;
  } catch (error) {
    console.error(`[InterviewService] AI Service failed:`, error.message);
    throw new Error(`AI Service failed: ${error.message}`);
  }
  
  // 4. Update Node State
  if (aiOutput.extracted_data && !aiOutput.requiresClarification) {
    for (const [key, value] of Object.entries(aiOutput.extracted_data)) {
      state.answers.set(key, value);
      if (!state.completedFields.includes(key)) {
        state.completedFields.push(key);
      }
      state.pendingFields = state.pendingFields.filter(f => f !== key);
      state.confidenceScores.set(key, aiOutput.confidence);
    }
  }
  
  if (state.pendingFields.length === 0) {
    state.status = 'COMPLETED';
    aiOutput.question = "Excellent! I have all the information required. We are ready to submit your application.";
  }
  
  await state.save();
  
  // 5. Save AI message
  const aiMessage = await Message.create({
    conversationId,
    sender: 'AI',
    content: aiOutput.question
  });
  
  return { state, reply: aiMessage };
};
