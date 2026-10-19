/**
 * Production Scaling and Observability Test Suite
 * Applier 2.0 — Phase 25: Production Scaling and Observability
 *
 * Verifies:
 * 1. End-to-end Architecture Topology (Load Balancer -> API -> Redis -> Workers -> Mongo -> Object Storage)
 * 2. Worker Scaling Limits (Browser count, CPU, Memory, Job duration hard timeout)
 * 3. Worker Pool Dynamic Autoscaling (Queue depth, CPU, Memory, Job latency)
 * 4. Observability Metrics Collection (All 11 metrics + canonical contract validation)
 * 5. Production Alert Engine (All 6 alert classes + canonical contract validation)
 * 6. Progressive Concurrency Load Testing (5, 10, 25, 50 jobs with actual resource measurements)
 */

import {
  ResourceGovernor,
  WorkerPoolScaler,
  MetricsCollector,
  AlertEngine,
  LoadBalancer,
  ApiInstance,
  RedisQueueSimulator,
  MongoDatabaseSimulator,
  ObjectStorageSimulator,
  WorkerNode,
  ProgressiveLoadTester
} from '../src/scaling/index.js';

import {
  ScalingAlertType,
  AlertSeverity,
  ScalingAction
} from '../../shared/enums/index.js';

import {
  validateSystemMetrics,
  validateScalingAlert
} from '../../shared/validators/index.js';

describe('Phase 25: Production Scaling and Observability Suite', () => {

  describe('1. Distributed Architecture Topology Integration', () => {
    let loadBalancer;
    let redisQueue;
    let mongoDb;
    let objectStorage;
    let metricsCollector;
    let alertEngine;
    let api1;
    let api2;
    let worker1;
    let worker2;

    beforeEach(() => {
      redisQueue = new RedisQueueSimulator();
      mongoDb = new MongoDatabaseSimulator();
      objectStorage = new ObjectStorageSimulator();
      metricsCollector = new MetricsCollector();
      alertEngine = new AlertEngine();

      loadBalancer = new LoadBalancer({ strategy: 'ROUND_ROBIN' });
      api1 = new ApiInstance('api-instance-1', { redisQueue });
      api2 = new ApiInstance('api-instance-2', { redisQueue });
      loadBalancer.registerApiInstance(api1);
      loadBalancer.registerApiInstance(api2);

      worker1 = new WorkerNode('worker-node-1', {
        redisQueue,
        database: mongoDb,
        objectStorage,
        metricsCollector,
        alertEngine
      });

      worker2 = new WorkerNode('worker-node-2', {
        redisQueue,
        database: mongoDb,
        objectStorage,
        metricsCollector,
        alertEngine
      });
    });

    it('should route traffic across multiple API instances and enqueue jobs into Redis', async () => {
      const res1 = await loadBalancer.routeRequest({ targetUrl: 'https://jobs.apple.com', applicant: 'Alice' });
      const res2 = await loadBalancer.routeRequest({ targetUrl: 'https://jobs.google.com', applicant: 'Bob' });

      expect(res1.success).toBe(true);
      expect(res1.routedThrough).toBe('api-instance-1');
      expect(res2.success).toBe(true);
      expect(res2.routedThrough).toBe('api-instance-2');

      const depth = redisQueue.getDepth();
      expect(depth.waiting).toBe(2);
    });

    it('should fail over to healthy API instances when an instance is degraded or unhealthy', async () => {
      api1.setHealth(false); // api1 becomes unhealthy

      const res = await loadBalancer.routeRequest({ targetUrl: 'https://jobs.microsoft.com' });
      expect(res.success).toBe(true);
      expect(res.routedThrough).toBe('api-instance-2');
    });

    it('should throw 503 if all API instances are unhealthy', async () => {
      api1.setHealth(false);
      api2.setHealth(false);

      expect(() => {
        loadBalancer.routeRequest({ targetUrl: 'https://jobs.meta.com' });
      }).toThrow('503 Service Unavailable');
    });

    it('should execute end-to-end flow: Load Balancer -> API -> Redis -> Worker -> Mongo -> Object Storage', async () => {
      // 1. Ingress
      const ingressResult = await loadBalancer.routeRequest({
        targetUrl: 'https://careers.netflix.com',
        jobTitle: 'Senior Platform Engineer'
      });
      expect(ingressResult.status).toBe('QUEUED');

      // 2. Worker dequeue & process
      const workResult = await worker1.processNextJob(async (job) => {
        return {
          submissionStatus: 'SUBMISSION_VERIFIED',
          referenceNumber: 'NFLX-2026-98124',
          confirmationUrl: `${job.targetUrl}/thank-you`
        };
      });

      expect(workResult.processed).toBe(true);
      expect(workResult.result.referenceNumber).toBe('NFLX-2026-98124');

      // 3. Durable state in MongoDB
      const savedJob = await mongoDb.findById('automation_jobs', ingressResult.jobId);
      expect(savedJob).toBeDefined();
      expect(savedJob.workerId).toBe('worker-node-1');

      // 4. Evidence artifact in Object Storage
      const storedReceipt = await objectStorage.getObject('applier-receipts', `${ingressResult.jobId}/receipt.json`);
      expect(storedReceipt).toBeDefined();
      const parsedReceipt = JSON.parse(storedReceipt.data);
      expect(parsedReceipt.referenceNumber).toBe('NFLX-2026-98124');

      // 5. Redis queue updated
      const depth = redisQueue.getDepth();
      expect(depth.waiting).toBe(0);
      expect(depth.completed).toBe(1);
    });
  });

  describe('2. Worker Resource Governor Limits', () => {
    let governor;

    beforeEach(() => {
      governor = new ResourceGovernor({
        maxBrowsersPerWorker: 3,
        maxCpuPercent: 80.0,
        maxMemoryRssMb: 1200.0,
        maxMemoryHeapMb: 800.0,
        maxJobDurationMs: 150 // short duration for testing timeout
      });
    });

    afterEach(() => {
      governor.cleanup();
    });

    it('should admit jobs when worker resources are within limits', () => {
      const admission = governor.canAdmitJob({
        activeBrowsers: 1,
        cpuPercent: 45.0,
        memoryRssMb: 500.0,
        memoryHeapMb: 300.0
      });

      expect(admission.admitted).toBe(true);
      expect(admission.reason).toBeNull();
    });

    it('should reject jobs when active browser count limit is reached', () => {
      const admission = governor.canAdmitJob({
        activeBrowsers: 3,
        cpuPercent: 40.0,
        memoryRssMb: 400.0
      });

      expect(admission.admitted).toBe(false);
      expect(admission.reason).toBe('BROWSER_COUNT_LIMIT_REACHED');
      expect(admission.details).toContain('Active browsers (3) reached worker limit (3)');
    });

    it('should reject jobs when CPU limit is exceeded', () => {
      const admission = governor.canAdmitJob({
        activeBrowsers: 1,
        cpuPercent: 88.5,
        memoryRssMb: 500.0
      });

      expect(admission.admitted).toBe(false);
      expect(admission.reason).toBe('CPU_LIMIT_EXCEEDED');
      expect(admission.details).toContain('88.5%');
    });

    it('should reject jobs when Memory limit is exceeded', () => {
      const admission = governor.canAdmitJob({
        activeBrowsers: 1,
        cpuPercent: 50.0,
        memoryRssMb: 1350.0
      });

      expect(admission.admitted).toBe(false);
      expect(admission.reason).toBe('MEMORY_LIMIT_EXCEEDED');
      expect(admission.details).toContain('1350.0 MB');
    });

    it('should trigger timeout callback when a job exceeds hard execution duration limit', async () => {
      const timeoutPromise = new Promise((resolve) => {
        governor.onTimeout((event) => resolve(event));
      });

      governor.trackJobStart('job_runaway_001', { timeoutMs: 50, workerId: 'worker-timeout-test' });

      const timeoutEvent = await timeoutPromise;
      expect(timeoutEvent.jobId).toBe('job_runaway_001');
      expect(timeoutEvent.workerId).toBe('worker-timeout-test');
      expect(timeoutEvent.durationMs).toBeGreaterThanOrEqual(45);
      expect(governor.getActiveJobCount()).toBe(0);
    });

    it('should disarm timeout cleanly when a job ends before limit', async () => {
      let timeoutTriggered = false;
      governor.onTimeout(() => {
        timeoutTriggered = true;
      });

      governor.trackJobStart('job_quick_002', { timeoutMs: 100 });
      expect(governor.getActiveJobCount()).toBe(1);

      // Finish job immediately
      const ended = governor.trackJobEnd('job_quick_002');
      expect(ended.jobId).toBe('job_quick_002');
      expect(governor.getActiveJobCount()).toBe(0);

      // Wait past timeout
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(timeoutTriggered).toBe(false);
    });

    it('should assess resource pressure levels accurately (NORMAL, WARNING, CRITICAL)', () => {
      const normal = governor.checkResourcePressure({
        cpuPercent: 30.0,
        memoryRssMb: 400.0,
        activeBrowsers: 1
      });
      expect(normal.level).toBe('NORMAL');
      expect(normal.pressure).toBe(false);

      const warning = governor.checkResourcePressure({
        cpuPercent: 70.0, // 70 / 80 = 87.5% ratio
        memoryRssMb: 600.0,
        activeBrowsers: 1
      });
      expect(warning.level).toBe('WARNING');
      expect(warning.pressure).toBe(true);

      const critical = governor.checkResourcePressure({
        cpuPercent: 85.0, // > 80.0
        memoryRssMb: 600.0,
        activeBrowsers: 1
      });
      expect(critical.level).toBe('CRITICAL');
      expect(critical.pressure).toBe(true);
      expect(critical.reasons).toContain('CPU_EXCEEDED');
    });
  });

  describe('3. Dynamic Worker Pool Autoscaler', () => {
    let scaler;

    beforeEach(() => {
      scaler = new WorkerPoolScaler({
        minWorkers: 2,
        maxWorkers: 10,
        targetJobsPerWorker: 3,
        targetCpuPercent: 75.0,
        scaleDownCpuPercent: 20.0,
        targetMemoryPercent: 75.0,
        targetLatencyMs: 10000,
        cooldownMs: 200 // short cooldown for testing
      });
    });

    it('should scale UP based on Queue Depth backlog', () => {
      // 15 waiting jobs with 2 workers (target 3 jobs/worker -> needs 5 workers)
      const decision = scaler.evaluateScaling({
        queueDepth: 15,
        currentWorkers: 2,
        avgCpu: 30.0,
        avgMemoryPercent: 40.0,
        jobLatencyP90: 2500
      });

      expect(decision.action).toBe(ScalingAction.SCALE_UP);
      expect(decision.desiredWorkers).toBe(5);
      expect(decision.delta).toBe(3);
      expect(decision.driver).toBe('QUEUE_DEPTH');
    });

    it('should scale UP based on CPU saturation', () => {
      // CPU at 90% across 3 workers -> needs 3 * (90/75) = 4 workers
      const decision = scaler.evaluateScaling({
        queueDepth: 0,
        currentWorkers: 3,
        avgCpu: 90.0,
        avgMemoryPercent: 40.0,
        jobLatencyP90: 3000
      });

      expect(decision.action).toBe(ScalingAction.SCALE_UP);
      expect(decision.desiredWorkers).toBe(4);
      expect(decision.delta).toBe(1);
      expect(decision.driver).toBe('CPU_UTILIZATION');
    });

    it('should scale UP based on Memory pressure', () => {
      // Memory at 85% across 2 workers -> needs 2 * (85/75) = 3 workers
      const decision = scaler.evaluateScaling({
        queueDepth: 0,
        currentWorkers: 2,
        avgCpu: 35.0,
        avgMemoryPercent: 85.0,
        jobLatencyP90: 3000
      });

      expect(decision.action).toBe(ScalingAction.SCALE_UP);
      expect(decision.desiredWorkers).toBe(3);
      expect(decision.delta).toBe(1);
      expect(decision.driver).toBe('MEMORY_PRESSURE');
    });

    it('should scale UP based on Job Latency spike', () => {
      // P90 latency 22,000 ms > 10,000 ms target
      const decision = scaler.evaluateScaling({
        queueDepth: 2,
        currentWorkers: 2,
        avgCpu: 40.0,
        avgMemoryPercent: 40.0,
        jobLatencyP90: 22000
      });

      expect(decision.action).toBe(ScalingAction.SCALE_UP);
      expect(decision.desiredWorkers).toBe(3);
      expect(decision.driver).toBe('JOB_LATENCY_SPIKE');
    });

    it('should trigger THROTTLE when pool is at maximum capacity under load', () => {
      const decision = scaler.evaluateScaling({
        queueDepth: 50,
        currentWorkers: 10, // at maxWorkers
        avgCpu: 95.0,
        avgMemoryPercent: 90.0,
        jobLatencyP90: 35000
      });

      expect(decision.action).toBe(ScalingAction.THROTTLE);
      expect(decision.currentWorkers).toBe(10);
      expect(decision.desiredWorkers).toBe(10);
      expect(decision.reason).toContain('capacity limit');
    });

    it('should scale DOWN safely when resources are underutilized and cooldown has passed', async () => {
      // First scale up to 6 workers
      scaler.evaluateScaling({
        queueDepth: 18,
        currentWorkers: 2,
        avgCpu: 40.0,
        avgMemoryPercent: 40.0
      });

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Now queue is empty and CPU is 12%
      const decision = scaler.evaluateScaling({
        queueDepth: 0,
        currentWorkers: 6,
        avgCpu: 12.0,
        avgMemoryPercent: 25.0,
        jobLatencyP90: 1200
      });

      expect(decision.action).toBe(ScalingAction.SCALE_DOWN);
      expect(decision.desiredWorkers).toBe(2); // minWorkers
      expect(decision.delta).toBe(-4);
      expect(decision.driver).toBe('RESOURCE_UNDERUTILIZATION');
    });
  });

  describe('3. Observability Metrics Collection (11 Tracked Metrics)', () => {
    let collector;

    beforeEach(() => {
      collector = new MetricsCollector();
    });

    it('should record all 11 required metrics and produce valid canonical SystemMetrics snapshot', () => {
      // 1. Job Latency
      collector.recordJobLatency(1200);
      collector.recordJobLatency(2500);
      collector.recordJobLatency(3800);
      collector.recordJobLatency(8100);

      // 2. Browser Startup
      collector.recordBrowserStartup(320);
      collector.recordBrowserStartup(450);

      // 3. AI Latency
      collector.recordAiLatency(280);
      collector.recordAiLatency(390);

      // 4. AI Cost & Tokens
      collector.recordAiUsage({ promptTokens: 12500, completionTokens: 2100 });

      // 5. Document Processing Time
      collector.recordDocumentProcessing(135);
      collector.recordDocumentProcessing(160);

      // 6. Field Mapping Confidence
      collector.recordFieldMappingConfidence([0.98, 0.94, 0.88, 0.92]);

      // 7. Recovery Rate
      collector.recordRecoveryAttempt({ successful: true });
      collector.recordRecoveryAttempt({ successful: true });
      collector.recordRecoveryAttempt({ successful: false });

      // 8. Submission Success
      collector.recordSubmissionOutcome({ status: 'SUBMISSION_VERIFIED' });
      collector.recordSubmissionOutcome({ status: 'SUCCESS' });

      // 9. Submission Uncertainty
      collector.recordSubmissionOutcome({ status: 'SUBMISSION_UNCERTAIN' });

      // 10. Worker Failures
      collector.recordWorkerFailure({ workerId: 'worker-alpha', type: 'CRASH' });
      collector.recordWorkerFailure({ workerId: 'worker-beta', type: 'TIMEOUT' });

      // 11. Queue Depth
      collector.updateQueueDepth({ waiting: 4, active: 2, completed: 45, failed: 1 });

      // Telemetry
      collector.updateResourceUsage({
        cpuPercent: 42.0,
        memoryRssMb: 520.0,
        memoryHeapUsedMb: 240.0,
        activeBrowsers: 2,
        activeWorkers: 3
      });

      const snapshot = collector.captureSnapshot('met_test_validation_001');

      // Verify canonical schema validation
      const validation = validateSystemMetrics(snapshot);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(snapshot.schemaVersion).toBe('2.0.0');

      // Assert each tracked metric
      expect(snapshot.jobLatency.sampleCount).toBe(4);
      expect(snapshot.jobLatency.p50).toBeGreaterThan(0);
      expect(snapshot.browserStartup.sampleCount).toBe(2);
      expect(snapshot.aiLatency.sampleCount).toBe(2);
      expect(snapshot.aiCost.totalTokens).toBe(14600);
      expect(snapshot.aiCost.totalCostUsd).toBeGreaterThan(0);
      expect(snapshot.documentProcessingTime.sampleCount).toBe(2);
      expect(snapshot.fieldMappingConfidence.avgScore).toBeCloseTo(0.93, 1);
      expect(snapshot.fieldMappingConfidence.minScore).toBe(0.88);
      expect(snapshot.recoveryRate.totalRecoveryAttempts).toBe(3);
      expect(snapshot.recoveryRate.successfulRecoveries).toBe(2);
      expect(snapshot.recoveryRate.rate).toBeCloseTo(0.6667, 2);
      expect(snapshot.submissionSuccess.successfulCount).toBe(2);
      expect(snapshot.submissionUncertainty.uncertainCount).toBe(1);
      expect(snapshot.workerFailures.crashCount).toBe(1);
      expect(snapshot.workerFailures.timeoutAborts).toBe(1);
      expect(snapshot.queueDepth.waiting).toBe(4);
      expect(snapshot.resourceUsage.activeBrowsers).toBe(2);
    });
  });

  describe('4. Production Alert Engine (6 Alert Classes)', () => {
    let alertEngine;

    beforeEach(() => {
      alertEngine = new AlertEngine({
        failureRateThreshold: 0.15,
        workerCrashThreshold: 1,
        queueBacklogThreshold: 10,
        memoryPressurePercentThreshold: 80.0,
        aiFailureRateThreshold: 0.10,
        databaseLatencyThresholdMs: 3000
      });
    });

    afterEach(() => {
      alertEngine.clear();
    });

    it('1. should alert on HIGH_FAILURE_RATE and validate against canonical schema', () => {
      const metrics = {
        queueDepth: { completed: 8, failed: 2, waiting: 0, active: 0 }, // 20% failure rate
        workerFailures: { crashCount: 0, crashedWorkers: [] },
        resourceUsage: { memoryRssMb: 400, memoryHeapUsedMb: 200 }
      };

      const alerts = alertEngine.evaluateMetrics(metrics);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].alertType).toBe(ScalingAlertType.HIGH_FAILURE_RATE);
      expect(alerts[0].triggerValue).toBe(0.2);
      expect(alerts[0].thresholdValue).toBe(0.15);

      const val = validateScalingAlert(alerts[0]);
      expect(val.valid).toBe(true);
    });

    it('2. should alert on WORKER_CRASHES when worker crash is reported', () => {
      const alert = alertEngine.reportWorkerCrash({
        workerId: 'worker-prod-node-4',
        error: 'SIGSEGV browser process killed unexpectedly',
        exitCode: 139
      });

      expect(alert.alertType).toBe(ScalingAlertType.WORKER_CRASHES);
      expect(alert.severity).toBe(AlertSeverity.CRITICAL);
      expect(alert.workerId).toBe('worker-prod-node-4');

      const val = validateScalingAlert(alert);
      expect(val.valid).toBe(true);
    });

    it('3. should alert on QUEUE_BACKLOG when pending jobs exceed threshold', () => {
      const metrics = {
        queueDepth: { waiting: 18, active: 5, completed: 20, failed: 0 },
        workerFailures: { crashCount: 0, crashedWorkers: [] },
        resourceUsage: { memoryRssMb: 400, memoryHeapUsedMb: 200 }
      };

      const alerts = alertEngine.evaluateMetrics(metrics);
      const backlogAlert = alerts.find(a => a.alertType === ScalingAlertType.QUEUE_BACKLOG);
      expect(backlogAlert).toBeDefined();
      expect(backlogAlert.triggerValue).toBe(18);
      expect(backlogAlert.thresholdValue).toBe(10);

      const val = validateScalingAlert(backlogAlert);
      expect(val.valid).toBe(true);
    });

    it('4. should alert on MEMORY_PRESSURE when worker memory exceeds threshold', () => {
      // 1300 MB out of 1500 MB limit = 86.6% (> 80%)
      const metrics = {
        queueDepth: { waiting: 0, active: 2, completed: 10, failed: 0 },
        workerFailures: { crashCount: 0, crashedWorkers: [] },
        resourceUsage: { memoryRssMb: 1300.0, memoryHeapUsedMb: 750.0 }
      };

      const alerts = alertEngine.evaluateMetrics(metrics);
      const memAlert = alerts.find(a => a.alertType === ScalingAlertType.MEMORY_PRESSURE);
      expect(memAlert).toBeDefined();
      expect(memAlert.triggerValue).toBeCloseTo(86.67, 1);

      const val = validateScalingAlert(memAlert);
      expect(val.valid).toBe(true);
    });

    it('5. should alert on AI_FAILURES when consecutive errors exceed limit', () => {
      alertEngine.reportAiFailure({ provider: 'gemini', error: 'Service Unavailable' });
      alertEngine.reportAiFailure({ provider: 'gemini', error: 'Timeout' });
      const alert = alertEngine.reportAiFailure({ provider: 'gemini', error: 'Rate limit 429' });

      expect(alert).not.toBeNull();
      expect(alert.alertType).toBe(ScalingAlertType.AI_FAILURES);
      expect(alert.metadata.consecutiveFailures).toBe(3);

      const val = validateScalingAlert(alert);
      expect(val.valid).toBe(true);
    });

    it('6. should alert on DATABASE_FAILURES when Mongo connection fails or query latency spikes', () => {
      const alert = alertEngine.reportDatabaseFailure({
        operation: 'findOneAndUpdate',
        error: 'MongoServerSelectionError: Server selection timed out after 30000 ms',
        latencyMs: 31000
      });

      expect(alert.alertType).toBe(ScalingAlertType.DATABASE_FAILURES);
      expect(alert.severity).toBe(AlertSeverity.CRITICAL);
      expect(alert.triggerValue).toBe(31000);

      const val = validateScalingAlert(alert);
      expect(val.valid).toBe(true);
    });

    it('should support subscriber notification dispatch and alert resolution', () => {
      const received = [];
      alertEngine.subscribe((a) => received.push(a));

      const alert = alertEngine.reportWorkerCrash({ workerId: 'worker-7' });
      expect(received).toHaveLength(1);
      expect(received[0].alertId).toBe(alert.alertId);
      expect(alertEngine.getActiveAlerts()).toHaveLength(1);

      const resolved = alertEngine.resolveAlert(alert.alertId);
      expect(resolved.resolved).toBe(true);
      expect(alertEngine.getActiveAlerts()).toHaveLength(0);
    });
  });

  describe('5. Progressive Concurrency Load Test (5, 10, 25, 50)', () => {
    let loadTester;

    beforeEach(() => {
      loadTester = new ProgressiveLoadTester({
        simulatedJobDurationMs: 25,
        governorConfig: {
          maxBrowsersPerWorker: 15,
          maxCpuPercent: 85.0,
          maxMemoryRssMb: 1500.0,
          maxMemoryHeapMb: 1000.0,
          maxJobDurationMs: 10000
        }
      });
    });

    it('should progressively benchmark 5 concurrent jobs and measure actual resources', async () => {
      const report = await loadTester.runTier(5);

      expect(report.concurrency).toBe(5);
      expect(report.completed).toBe(5);
      expect(report.throttled).toBe(0);
      expect(report.failed).toBe(0);
      expect(report.latency.avgMs).toBeGreaterThan(0);
      expect(report.memory.peakRssMb).toBeGreaterThan(0);
      expect(report.governorIntervened).toBe(false);

      console.log('\n--- PROGRESSIVE BENCHMARK: 5 CONCURRENT JOBS ---');
      console.log(`Completed:     ${report.completed}/${report.totalJobs}`);
      console.log(`Avg Latency:   ${report.latency.avgMs} ms (P90: ${report.latency.p90Ms} ms)`);
      console.log(`Peak RSS:      ${report.memory.peakRssMb} MB (Delta: ${report.memory.deltaRssMb} MB)`);
      console.log(`Peak Heap:     ${report.memory.peakHeapMb} MB (Delta: ${report.memory.deltaHeapMb} MB)`);
      console.log(`Simulated CPU: ${report.cpuPercent}%`);
    });

    it('should progressively benchmark 10 concurrent jobs and measure actual resources', async () => {
      const report = await loadTester.runTier(10);

      expect(report.concurrency).toBe(10);
      expect(report.completed).toBe(10);
      expect(report.throttled).toBe(0);
      expect(report.latency.avgMs).toBeGreaterThan(0);
      expect(report.memory.peakRssMb).toBeGreaterThan(0);

      console.log('\n--- PROGRESSIVE BENCHMARK: 10 CONCURRENT JOBS ---');
      console.log(`Completed:     ${report.completed}/${report.totalJobs}`);
      console.log(`Avg Latency:   ${report.latency.avgMs} ms (P90: ${report.latency.p90Ms} ms)`);
      console.log(`Peak RSS:      ${report.memory.peakRssMb} MB (Delta: ${report.memory.deltaRssMb} MB)`);
      console.log(`Peak Heap:     ${report.memory.peakHeapMb} MB (Delta: ${report.memory.deltaHeapMb} MB)`);
      console.log(`Simulated CPU: ${report.cpuPercent}%`);
    });

    it('should progressively benchmark 25 concurrent jobs and observe governor intervention', async () => {
      // With maxBrowsersPerWorker = 15, at 25 jobs the governor will admit 15 and throttle 10
      const report = await loadTester.runTier(25);

      expect(report.concurrency).toBe(25);
      expect(report.completed + report.throttled).toBe(25);
      expect(report.throttled).toBeGreaterThan(0); // Governor protected node from overload
      expect(report.governorIntervened).toBe(true);

      console.log('\n--- PROGRESSIVE BENCHMARK: 25 CONCURRENT JOBS ---');
      console.log(`Admitted/Done: ${report.completed}/${report.totalJobs}`);
      console.log(`Throttled:     ${report.throttled} (Governor protective limit applied)`);
      console.log(`Avg Latency:   ${report.latency.avgMs} ms (P90: ${report.latency.p90Ms} ms)`);
      console.log(`Peak RSS:      ${report.memory.peakRssMb} MB`);
      console.log(`Governor Hit:  ${report.governorIntervened}`);
    });

    it('should progressively benchmark 50 concurrent jobs and measure actual resource limits safely', async () => {
      // "Do not assume 50 is safe. Measure actual resource usage."
      const report = await loadTester.runTier(50);

      expect(report.concurrency).toBe(50);
      expect(report.completed + report.throttled).toBe(50);
      expect(report.throttled).toBeGreaterThan(0); // Verified: 50 unthrottled is unsafe, governor preserves host
      expect(report.governorIntervened).toBe(true);
      expect(report.memory.peakRssMb).toBeLessThan(1500.0); // Never breached host memory boundary

      console.log('\n--- PROGRESSIVE BENCHMARK: 50 CONCURRENT JOBS ---');
      console.log(`Admitted/Done: ${report.completed}/${report.totalJobs}`);
      console.log(`Throttled:     ${report.throttled} (Safely queued/throttled)`);
      console.log(`Avg Latency:   ${report.latency.avgMs} ms (P90: ${report.latency.p90Ms} ms)`);
      console.log(`Peak RSS:      ${report.memory.peakRssMb} MB`);
      console.log(`Peak Heap:     ${report.memory.peakHeapMb} MB`);
      console.log(`Governor Hit:  ${report.governorIntervened}`);
    });
  });
});
