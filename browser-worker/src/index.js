/**
 * Browser Worker Process Entrypoint
 * Phase 2: Distributed Browser Worker Architecture
 */

import mongoose from 'mongoose';
import { workerConfig } from './config/env.js';
import { defaultBrowserWorker } from './worker/browser.worker.js';
import { defaultOrphanDetector } from './worker/orphan.detector.js';
import { defaultBrowserManager } from './engine/browser.manager.js';

async function bootstrap() {
  console.log(`[BrowserWorker] Starting worker process: ${workerConfig.workerId}`);
  console.log(`[BrowserWorker] Concurrency: ${workerConfig.concurrency}`);

  // 1. Connect to MongoDB
  try {
    await mongoose.connect(workerConfig.mongoUri);
    console.log('[BrowserWorker] Connected to MongoDB');
  } catch (err) {
    console.error('[BrowserWorker] Failed connecting to MongoDB:', err.message);
  }

  // 2. Start Orphan & Stalled Job Detector
  defaultOrphanDetector.start();
  console.log('[BrowserWorker] Stalled job detector active');

  // 3. Start BullMQ Browser Worker
  defaultBrowserWorker.start();
  console.log('[BrowserWorker] Listening for automation jobs on queue...');

  // 4. Graceful Shutdown Handlers
  const shutdown = async (signal) => {
    console.log(`[BrowserWorker] Received ${signal}. Shutting down gracefully...`);
    defaultOrphanDetector.stop();
    await defaultBrowserWorker.stop();
    await defaultBrowserManager.cleanupAllBrowsers();
    await mongoose.disconnect();
    console.log('[BrowserWorker] Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[BrowserWorker] Fatal startup error:', err);
  process.exit(1);
});
