import mongoose from 'mongoose';
import crypto from 'crypto';
import { Workflow } from './src/workflow/workflow.model.js';
import { config } from './src/config/env.js';

async function testCache() {
  await mongoose.connect(config.mongoUri);
  console.log("Connected to MongoDB");

  const targetUrl = 'https://example.com/mock-form';
  const urlHash = crypto.createHash('sha256').update(targetUrl).digest('hex');

  console.log(`Testing with URL: ${targetUrl} | Hash: ${urlHash}`);

  // Clean up previous runs
  await Workflow.deleteMany({ urlHash });

  // 1. First run - should miss cache
  let workflow = await Workflow.findOne({ urlHash });
  if (!workflow) {
    console.log("[TEST] Cache MISS (expected)");
    workflow = await Workflow.create({
      userId: new mongoose.Types.ObjectId(),
      name: 'Mock Workflow',
      url: targetUrl,
      urlHash: urlHash,
      schemaDefinition: { steps: [] }
    });
    console.log(`[TEST] Created workflow: ${workflow._id}`);
  }

  // 2. Second run - should hit cache
  let workflow2 = await Workflow.findOne({ urlHash });
  if (workflow2) {
    console.log("[TEST] Cache HIT (expected) - Reuse existing workflow");
    console.log(`[TEST] Found workflow ID: ${workflow2._id}`);
  } else {
    console.error("[TEST] ERROR: Cache should have hit!");
  }

  await mongoose.disconnect();
}

testCache().catch(console.error);
