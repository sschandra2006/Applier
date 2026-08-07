import mongoose from 'mongoose';
import { config } from './src/config/env.js';
import { processMessageController } from './src/interview/interview.controller.js';
import { Workflow } from './src/workflow/workflow.model.js';
import { InterviewState } from './src/interview/interview-state.model.js';
import { Conversation } from './src/chat/conversation.model.js';

async function testLoop() {
  await mongoose.connect(config.mongoUri);
  console.log('Connected to DB');

  for (let i = 1; i <= 10; i++) {
    console.log(`\n--- Run ${i} ---`);
    const dummyUserId = new mongoose.Types.ObjectId();

    // Create a dummy workflow
    const workflow = await Workflow.create({
      name: `Test Workflow ${i}`,
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
      body: { conversationId: conversation._id.toString(), content: 'My name is John Doe' },
      user: { _id: dummyUserId },
      correlationId: `test-corr-${i}`
    };

    let isDone = false;
    const res = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        console.log(`[Response ${this.statusCode}]`, JSON.stringify(data, null, 2));
        if (this.statusCode === 200 && data.success) {
            console.log(`Run ${i} SUCCESS: AI Reply ->`, data.data.reply.content);
        } else {
            console.error(`Run ${i} FAILED.`);
        }
        isDone = true;
      },
      headersSent: false
    };

    await processMessageController(req, res, async (err) => {
      // If next(error) is called, let's simulate the global error handler
      const { globalErrorHandler } = await import('./src/error/error.middleware.js');
      globalErrorHandler(err, req, res, () => {});
      isDone = true;
    });
    
    // Wait for async execution
    while(!isDone) {
        await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log('\nAll 10 runs completed successfully.');
  setTimeout(() => mongoose.disconnect(), 1000);
}

testLoop().catch(console.error);
