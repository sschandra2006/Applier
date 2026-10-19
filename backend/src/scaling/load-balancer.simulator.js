/**
 * Distributed Architecture Simulator
 * Applier 2.0 — Phase 25: Production Scaling and Observability
 *
 * Implements the production architecture topology:
 * Load Balancer
 *   -> API Instances Pool
 *     -> Redis Queue
 *       -> Browser Worker Pool (Resource-governed)
 *         -> MongoDB (Durable state)
 *         -> Object Storage (Artifacts & Receipts)
 */

import crypto from 'crypto';
import { ResourceGovernor } from './resource-governor.js';

export class LoadBalancer {
  constructor(options = {}) {
    this.strategy = options.strategy || 'ROUND_ROBIN'; // ROUND_ROBIN | LEAST_CONNECTIONS
    this.apiInstances = [];
    this.currentIndex = 0;
  }

  registerApiInstance(instance) {
    this.apiInstances.push(instance);
  }

  unregisterApiInstance(instanceId) {
    this.apiInstances = this.apiInstances.filter(i => i.id !== instanceId);
  }

  /**
   * Health checks all registered API instances
   */
  getActiveInstances() {
    return this.apiInstances.filter(i => i.isHealthy());
  }

  /**
   * Routes an incoming HTTP application request to a healthy API instance
   */
  routeRequest(requestPayload) {
    const healthyInstances = this.getActiveInstances();
    if (healthyInstances.length === 0) {
      throw new Error('503 Service Unavailable: No healthy API instances available in pool');
    }

    let selectedInstance;

    if (this.strategy === 'LEAST_CONNECTIONS') {
      selectedInstance = healthyInstances.reduce((lowest, current) =>
        current.activeConnections < lowest.activeConnections ? current : lowest
      );
    } else {
      // Default: ROUND_ROBIN
      const index = this.currentIndex % healthyInstances.length;
      selectedInstance = healthyInstances[index];
      this.currentIndex = (this.currentIndex + 1) % healthyInstances.length;
    }

    return selectedInstance.handleRequest(requestPayload);
  }
}

export class ApiInstance {
  constructor(id, options = {}) {
    this.id = id;
    this.redisQueue = options.redisQueue;
    this.activeConnections = 0;
    this.healthy = true;
  }

  isHealthy() {
    return this.healthy;
  }

  setHealth(healthy) {
    this.healthy = !!healthy;
  }

  async handleRequest(requestPayload) {
    if (!this.healthy) {
      throw new Error(`API instance ${this.id} is unhealthy`);
    }

    this.activeConnections += 1;
    try {
      const jobId = `job_${crypto.randomUUID().slice(0, 12)}`;
      const jobItem = {
        jobId,
        apiInstanceId: this.id,
        targetUrl: requestPayload.targetUrl || 'https://jobs.example.com',
        payload: requestPayload,
        submittedAt: new Date().toISOString(),
        status: 'QUEUED'
      };

      await this.redisQueue.enqueue(jobItem);

      return {
        success: true,
        jobId,
        status: 'QUEUED',
        routedThrough: this.id
      };
    } finally {
      this.activeConnections = Math.max(0, this.activeConnections - 1);
    }
  }
}

export class RedisQueueSimulator {
  constructor() {
    this.queue = [];
    this.active = new Map();
    this.completedCount = 0;
    this.failedCount = 0;
  }

  async enqueue(jobItem) {
    this.queue.push(jobItem);
    return jobItem;
  }

  async dequeue() {
    const item = this.queue.shift();
    if (item) {
      item.status = 'PROCESSING';
      this.active.set(item.jobId, item);
    }
    return item || null;
  }

  async complete(jobId) {
    const item = this.active.get(jobId);
    if (item) {
      this.active.delete(jobId);
      this.completedCount += 1;
      item.status = 'COMPLETED';
    }
    return item;
  }

  async fail(jobId, error = 'Failed') {
    const item = this.active.get(jobId);
    if (item) {
      this.active.delete(jobId);
      this.failedCount += 1;
      item.status = 'FAILED';
      item.error = String(error);
    }
    return item;
  }

  getDepth() {
    return {
      waiting: this.queue.length,
      active: this.active.size,
      completed: this.completedCount,
      failed: this.failedCount
    };
  }

  clear() {
    this.queue = [];
    this.active.clear();
    this.completedCount = 0;
    this.failedCount = 0;
  }
}

export class ObjectStorageSimulator {
  constructor() {
    this.buckets = new Map(); // bucketName -> Map(key, data)
  }

  async putObject(bucket, key, data, contentType = 'application/json') {
    if (!this.buckets.has(bucket)) {
      this.buckets.set(bucket, new Map());
    }
    const bucketMap = this.buckets.get(bucket);
    const uri = `s3://${bucket}/${key}`;
    bucketMap.set(key, { data, contentType, uri, uploadedAt: new Date().toISOString() });
    return { uri, bucket, key, bytes: typeof data === 'string' ? data.length : 1024 };
  }

  async getObject(bucket, key) {
    const bucketMap = this.buckets.get(bucket);
    if (!bucketMap || !bucketMap.has(key)) {
      return null;
    }
    return bucketMap.get(key);
  }
}

export class MongoDatabaseSimulator {
  constructor() {
    this.collections = new Map();
    this.isHealthy = true;
  }

  setHealth(healthy) {
    this.isHealthy = !!healthy;
  }

  async insertOne(collectionName, document) {
    if (!this.isHealthy) {
      throw new Error('MongoNetworkError: failed to connect to server [127.0.0.1:27017]');
    }
    if (!this.collections.has(collectionName)) {
      this.collections.set(collectionName, []);
    }
    const doc = { _id: crypto.randomUUID(), ...document, createdAt: new Date() };
    this.collections.get(collectionName).push(doc);
    return doc;
  }

  async findById(collectionName, id) {
    if (!this.isHealthy) {
      throw new Error('MongoNetworkError: failed to connect to server [127.0.0.1:27017]');
    }
    const col = this.collections.get(collectionName) || [];
    return col.find(d => d._id === id || d.jobId === id) || null;
  }
}

export class WorkerNode {
  constructor(workerId, options = {}) {
    this.workerId = workerId;
    this.governor = options.governor || new ResourceGovernor(options.governorOptions);
    this.redisQueue = options.redisQueue;
    this.database = options.database;
    this.objectStorage = options.objectStorage;
    this.metricsCollector = options.metricsCollector;
    this.alertEngine = options.alertEngine;

    this.activeBrowsers = 0;
    this.cpuPercent = options.initialCpu ?? 15.0;
    this.memoryRssMb = options.initialMemoryMb ?? 200.0;
    this.isRunning = false;
  }

  async processNextJob(jobExecutor = null) {
    const admission = this.governor.canAdmitJob({
      activeBrowsers: this.activeBrowsers,
      cpuPercent: this.cpuPercent,
      memoryRssMb: this.memoryRssMb
    });

    if (!admission.admitted) {
      return { processed: false, reason: admission.reason, details: admission.details };
    }

    const jobItem = await this.redisQueue.dequeue();
    if (!jobItem) {
      return { processed: false, reason: 'QUEUE_EMPTY' };
    }

    this.activeBrowsers += 1;
    this.governor.trackJobStart(jobItem.jobId, { workerId: this.workerId });
    const startTime = Date.now();

    try {
      let result;
      if (jobExecutor) {
        result = await jobExecutor(jobItem);
      } else {
        result = { success: true, referenceNumber: `APP-${Date.now()}` };
      }

      // Persist to Mongo
      if (this.database) {
        await this.database.insertOne('automation_jobs', {
          jobId: jobItem.jobId,
          workerId: this.workerId,
          result
        });
      }

      // Persist evidence to Object Storage
      if (this.objectStorage) {
        await this.objectStorage.putObject(
          'applier-receipts',
          `${jobItem.jobId}/receipt.json`,
          JSON.stringify(result)
        );
      }

      await this.redisQueue.complete(jobItem.jobId);

      const durationMs = Date.now() - startTime;
      if (this.metricsCollector) {
        this.metricsCollector.recordJobLatency(durationMs);
        this.metricsCollector.recordSubmissionOutcome({ status: 'SUCCESS' });
      }

      return { processed: true, jobId: jobItem.jobId, durationMs, result };
    } catch (err) {
      await this.redisQueue.fail(jobItem.jobId, err.message);
      if (this.metricsCollector) {
        this.metricsCollector.recordJobLatency(Date.now() - startTime);
        this.metricsCollector.recordSubmissionOutcome({ status: 'FAILED' });
      }
      return { processed: false, jobId: jobItem.jobId, error: err.message };
    } finally {
      this.activeBrowsers = Math.max(0, this.activeBrowsers - 1);
      this.governor.trackJobEnd(jobItem.jobId);
    }
  }
}
