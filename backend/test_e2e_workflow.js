import { analyzeUrl } from './src/workflow/workflow.controller.js';
import mongoose from 'mongoose';
import { config } from './src/config/env.js';

async function test() {
  await mongoose.connect(config.mongoUri);
  console.log('Connected to DB');

  for (let i = 0; i < 10; i++) {
    console.log(`\n--- Run ${i+1} ---`);
    const req = {
      body: { targetUrl: 'https://example.com/test' + Date.now() + i },
      user: { _id: new mongoose.Types.ObjectId() },
      id: 'test-req-123'
    };

    const res = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        console.log(`[Response ${this.statusCode}] success=${data.success}`);
      }
    };

    await analyzeUrl(req, res, (err) => {
      console.error('Next called with error:', err);
    });
  }

  mongoose.disconnect();
}

test().catch(console.error);
