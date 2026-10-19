/**
 * Unified Queue Provider (BullMQ / InMemory Adapter)
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Provides high-throughput BullMQ Queue and Worker over Redis in production,
 * and a zero-dependency In-Memory Queue implementation for testing and offline environments.
 */

import { EventEmitter } from 'events';
import { Queue as BullQueue, Worker as BullWorker } from 'bullmq';
import { getRedisConnectionConfig, isInMemoryMode } from './queue.config.js';
import { RETRY_STRATEGY } from './queue.constants.js';

// In-Memory Queue Store
const memoryQueues = new Map();

/**
 * In-Memory Job Representation mirroring BullMQ Job
 */
export class InMemoryJob extends EventEmitter {
  constructor(queueName, id, name, data, opts = {}) {
    super();
    this.queueName = queueName;
    this.id = String(id);
    this.name = name;
    this.data = data;
    this.opts = {
      attempts: opts.attempts ?? RETRY_STRATEGY.MAX_ATTEMPTS,
      backoff: opts.backoff ?? { type: RETRY_STRATEGY.BACKOFF_TYPE, delay: RETRY_STRATEGY.BACKOFF_DELAY_MS },
      timeout: opts.timeout,
      priority: opts.priority ?? 1,
      ...opts
    };
    this.attemptsMade = 0;
    this.timestamp = Date.now();
    this.progress = 0;
    this.failedReason = null;
    this.returnvalue = null;
    this.finishedOn = null;
    this.processedOn = null;
  }

  async updateProgress(val) {
    this.progress = val;
    this.emit('progress', val);
  }

  async log(msg) {
    // Mirror BullMQ job.log
  }
}

/**
 * In-Memory Queue implementation matching BullMQ Queue API
 */
export class InMemoryQueue extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.jobs = new Map();
    this.waiting = [];
    this.active = new Map();
    this.completed = new Map();
    this.failed = new Map();
    this.jobCounter = 1;
    this.isClosed = false;
    memoryQueues.set(name, this);
  }

  async add(name, data, opts = {}) {
    if (this.isClosed) throw new Error(`Queue ${this.name} is closed`);
    const id = opts.jobId || `job_${Date.now()}_${this.jobCounter++}`;
    const job = new InMemoryJob(this.name, id, name, data, opts);
    this.jobs.set(id, job);
    
    // Sort by priority (higher priority number first)
    this.waiting.push(job);
    this.waiting.sort((a, b) => (b.opts.priority || 1) - (a.opts.priority || 1));

    this.emit('waiting', job);
    return job;
  }

  async getJob(id) {
    return this.jobs.get(String(id)) || null;
  }

  async close() {
    this.isClosed = true;
    this.waiting = [];
    this.removeAllListeners();
  }
}

/**
 * In-Memory Worker implementation matching BullMQ Worker API
 */
export class InMemoryWorker extends EventEmitter {
  constructor(name, processor, opts = {}) {
    super();
    this.name = name;
    this.processor = processor;
    this.opts = opts;
    this.concurrency = opts.concurrency || 1;
    this.isPaused = false;
    this.isClosed = false;
    this.activeCount = 0;

    const queue = memoryQueues.get(name) || new InMemoryQueue(name);
    memoryQueues.set(name, queue);
    this.queue = queue;

    this._onWaiting = (job) => this._processNext();
    this.queue.on('waiting', this._onWaiting);

    // Initial check for any pending jobs
    process.nextTick(() => this._processNext());
  }

  async _processNext() {
    if (this.isClosed || this.isPaused) return;
    if (this.activeCount >= this.concurrency) return;
    if (this.queue.waiting.length === 0) return;

    const job = this.queue.waiting.shift();
    if (!job) return;

    this.activeCount++;
    this.queue.active.set(job.id, job);
    job.processedOn = Date.now();
    job.attemptsMade++;

    try {
      this.emit('active', job);

      // Support execution with timeout
      let timeoutId = null;
      const timeoutPromise = new Promise((_, reject) => {
        if (job.opts.timeout && job.opts.timeout > 0) {
          timeoutId = setTimeout(() => {
            const err = new Error(`JobTimeoutError: Job ${job.id} exceeded timeout of ${job.opts.timeout}ms`);
            err.name = 'JobTimeoutError';
            reject(err);
          }, job.opts.timeout);
        }
      });

      const result = await Promise.race([
        this.processor(job),
        timeoutPromise
      ]);

      if (timeoutId) clearTimeout(timeoutId);

      job.returnvalue = result;
      job.finishedOn = Date.now();
      this.queue.active.delete(job.id);
      this.queue.completed.set(job.id, job);
      this.emit('completed', job, result);
    } catch (err) {
      job.failedReason = err.message;
      this.queue.active.delete(job.id);

      // Retry mechanism with exponential backoff
      if (job.attemptsMade < job.opts.attempts) {
        const backoffDelay = (job.opts.backoff?.delay || RETRY_STRATEGY.BACKOFF_DELAY_MS) * Math.pow(2, job.attemptsMade - 1);
        setTimeout(() => {
          if (!this.isClosed) {
            this.queue.waiting.push(job);
            this.queue.waiting.sort((a, b) => (b.opts.priority || 1) - (a.opts.priority || 1));
            this._processNext();
          }
        }, backoffDelay);
      } else {
        job.finishedOn = Date.now();
        this.queue.failed.set(job.id, job);
        this.emit('failed', job, err);
      }
    } finally {
      this.activeCount--;
      if (!this.isClosed) {
        setImmediate(() => this._processNext());
      }
    }
  }

  async close() {
    this.isClosed = true;
    if (this.queue) {
      this.queue.off('waiting', this._onWaiting);
    }
    this.removeAllListeners();
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this._processNext();
  }
}

/**
 * Creates a Queue instance (BullMQ Queue over Redis, or InMemoryQueue)
 */
export function createQueue(queueName, customOpts = {}) {
  if (isInMemoryMode()) {
    if (!memoryQueues.has(queueName)) {
      memoryQueues.set(queueName, new InMemoryQueue(queueName));
    }
    return memoryQueues.get(queueName);
  }

  const connection = getRedisConnectionConfig();
  return new BullQueue(queueName, {
    connection,
    defaultJobOptions: {
      attempts: RETRY_STRATEGY.MAX_ATTEMPTS,
      backoff: {
        type: RETRY_STRATEGY.BACKOFF_TYPE,
        delay: RETRY_STRATEGY.BACKOFF_DELAY_MS
      },
      removeOnComplete: 1000,
      removeOnFail: 5000
    },
    ...customOpts
  });
}

/**
 * Creates a Worker instance (BullMQ Worker over Redis, or InMemoryWorker)
 */
export function createWorker(queueName, processor, customOpts = {}) {
  if (isInMemoryMode()) {
    return new InMemoryWorker(queueName, processor, customOpts);
  }

  const connection = getRedisConnectionConfig();
  return new BullWorker(queueName, processor, {
    connection,
    concurrency: customOpts.concurrency || 2,
    lockDuration: 30000,
    ...customOpts
  });
}

/**
 * Utility to clear in-memory queues (used between test runs)
 */
export function resetInMemoryQueues() {
  for (const q of memoryQueues.values()) {
    q.waiting = [];
    q.active.clear();
    q.completed.clear();
    q.failed.clear();
    q.jobs.clear();
    q.isClosed = false;
  }
}

export default {
  createQueue,
  createWorker,
  InMemoryQueue,
  InMemoryWorker,
  resetInMemoryQueues
};
