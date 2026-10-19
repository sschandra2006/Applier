/**
 * Browser Worker Environment Configuration
 * Phase 2: Distributed Browser Worker Architecture
 */

import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../backend/.env') });
dotenv.config();

export const workerConfig = {
  workerId: process.env.WORKER_ID || `worker_${os.hostname()}_${process.pid}`,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/applier',
  redisUrl: process.env.REDIS_URL,
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD,
  pythonApiUrl: process.env.PYTHON_API_URL || 'http://127.0.0.1:8000/api/v1/ai/execute',
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '15000', 10),
  stalledJobThresholdMs: parseInt(process.env.STALLED_JOB_THRESHOLD_MS || '120000', 10),
  useInMemoryQueue: process.env.USE_IN_MEMORY_QUEUE === 'true' || process.env.NODE_ENV === 'test'
};

export default workerConfig;
