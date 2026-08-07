import mongoose from 'mongoose';
import { config } from './src/config/env.js';
import { processMessageController } from './src/interview/interview.controller.js';
import { Workflow } from './src/workflow/workflow.model.js';
import { InterviewState } from './src/interview/interview-state.model.js';
import { Conversation } from './src/chat/conversation.model.js';

async function test() {
  await mongoose.connect(config.mongoUri);
  console.log('Connected to DB');

  const dummyUserId = new mongoose.Types.ObjectId();

  // Create a dummy workflow
  const workflow = await Workflow.create({
    name: 'Test Workflow',
    url: 'https://example.com/test' + Date.now(),
    urlHash: 'hash' + Date.now(),
    schemaDefinition: {}
  });

  // Create InterviewState
  const state = await InterviewState.create({
    userId: dummyUserId,
    workflowId: workflow._id,
    pendingFields: ['fullName'],
    status: 'IN_PROGRESS'
  });

  // Create Conversation
  const conversation = await Conversation.create({
    userId: dummyUserId,
    title: `Interview: ${workflow.name}`,
    metadata: { interviewStateId: state._id }
  });

  // Mock Request to POST /api/v1/interview/message
  const req = {
    body: { conversationId: conversation._id.toString(), content: 'My name is John' },
    user: { _id: dummyUserId },
    correlationId: 'test-corr-123'
  };

  const res = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      console.log(`[Response ${this.statusCode}]`, JSON.stringify(data, null, 2));
    },
    headersSent: false
  };

  await processMessageController(req, res, (err) => {
    // If next(error) is called, let's simulate the global error handler
    import('./src/error/error.middleware.js').then(({ globalErrorHandler }) => {
      globalErrorHandler(err, req, res, () => {});
    });
  });

  setTimeout(() => mongoose.disconnect(), 1000);
}

test().catch(console.error);
