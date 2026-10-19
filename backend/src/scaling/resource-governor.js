/**
 * Resource Governor Service
 * Applier 2.0 — Phase 25: Production Scaling and Observability
 *
 * Enforces worker execution limits:
 * - Active browser context limit
 * - CPU utilization ceiling
 * - Memory (RSS & Heap) footprint limit
 * - Job execution duration hard timeout
 */

export class ResourceGovernor {
  constructor(options = {}) {
    this.maxBrowsersPerWorker = options.maxBrowsersPerWorker ?? 5;
    this.maxCpuPercent = options.maxCpuPercent ?? 85.0;
    this.maxMemoryRssMb = options.maxMemoryRssMb ?? 1500.0;
    this.maxMemoryHeapMb = options.maxMemoryHeapMb ?? 1000.0;
    this.maxJobDurationMs = options.maxJobDurationMs ?? 300000; // 5 minutes hard limit

    // Active tracking
    this.activeJobs = new Map(); // jobId -> { startTime, timeoutTimer, workerId, metadata }
    this.timeoutCallbacks = new Set();
  }

  /**
   * Evaluates if a worker node can safely admit another job
   */
  canAdmitJob(workerState = {}) {
    const activeBrowsers = workerState.activeBrowsers ?? this.activeJobs.size;
    const cpuPercent = workerState.cpuPercent ?? this._getCurrentCpu();
    const memoryRssMb = workerState.memoryRssMb ?? this._getCurrentMemoryRssMb();
    const memoryHeapMb = workerState.memoryHeapMb ?? this._getCurrentMemoryHeapMb();

    if (activeBrowsers >= this.maxBrowsersPerWorker) {
      return {
        admitted: false,
        reason: 'BROWSER_COUNT_LIMIT_REACHED',
        details: `Active browsers (${activeBrowsers}) reached worker limit (${this.maxBrowsersPerWorker})`,
        metrics: { activeBrowsers, cpuPercent, memoryRssMb, memoryHeapMb }
      };
    }

    if (cpuPercent >= this.maxCpuPercent) {
      return {
        admitted: false,
        reason: 'CPU_LIMIT_EXCEEDED',
        details: `CPU utilization (${cpuPercent.toFixed(1)}%) exceeded worker limit (${this.maxCpuPercent}%)`,
        metrics: { activeBrowsers, cpuPercent, memoryRssMb, memoryHeapMb }
      };
    }

    if (memoryRssMb >= this.maxMemoryRssMb || memoryHeapMb >= this.maxMemoryHeapMb) {
      const violatedMb = memoryRssMb >= this.maxMemoryRssMb ? memoryRssMb : memoryHeapMb;
      const limitMb = memoryRssMb >= this.maxMemoryRssMb ? this.maxMemoryRssMb : this.maxMemoryHeapMb;
      return {
        admitted: false,
        reason: 'MEMORY_LIMIT_EXCEEDED',
        details: `Memory consumption (${violatedMb.toFixed(1)} MB) exceeded worker limit (${limitMb} MB)`,
        metrics: { activeBrowsers, cpuPercent, memoryRssMb, memoryHeapMb }
      };
    }

    return {
      admitted: true,
      reason: null,
      details: 'Worker resources within safe thresholds',
      metrics: { activeBrowsers, cpuPercent, memoryRssMb, memoryHeapMb }
    };
  }

  /**
   * Begins tracking a job and enforces the hard duration timeout
   */
  trackJobStart(jobId, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.maxJobDurationMs;
    const workerId = options.workerId ?? 'default-worker';

    if (this.activeJobs.has(jobId)) {
      this.trackJobEnd(jobId);
    }

    const timer = setTimeout(() => {
      this._handleJobTimeout(jobId);
    }, timeoutMs);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    const jobRecord = {
      jobId,
      workerId,
      startTime: Date.now(),
      timeoutMs,
      timer,
      metadata: options.metadata || {}
    };

    this.activeJobs.set(jobId, jobRecord);
    return jobRecord;
  }

  /**
   * Concludes job tracking and disarms timeout timer
   */
  trackJobEnd(jobId) {
    const jobRecord = this.activeJobs.get(jobId);
    if (!jobRecord) return null;

    clearTimeout(jobRecord.timer);
    const durationMs = Date.now() - jobRecord.startTime;
    this.activeJobs.delete(jobId);

    return {
      jobId,
      durationMs,
      workerId: jobRecord.workerId
    };
  }

  /**
   * Registers a listener for job duration timeouts
   */
  onTimeout(callback) {
    this.timeoutCallbacks.add(callback);
    return () => this.timeoutCallbacks.delete(callback);
  }

  /**
   * Internal timeout handler
   */
  _handleJobTimeout(jobId) {
    const jobRecord = this.activeJobs.get(jobId);
    if (!jobRecord) return;

    const durationMs = Date.now() - jobRecord.startTime;
    this.activeJobs.delete(jobId);

    const timeoutEvent = {
      jobId,
      workerId: jobRecord.workerId,
      durationMs,
      limitMs: jobRecord.timeoutMs,
      timestamp: new Date().toISOString()
    };

    for (const cb of this.timeoutCallbacks) {
      try {
        cb(timeoutEvent);
      } catch (_) {}
    }
  }

  /**
   * Checks resource pressure levels
   */
  checkResourcePressure(telemetry = {}) {
    const cpu = telemetry.cpuPercent ?? this._getCurrentCpu();
    const memoryRss = telemetry.memoryRssMb ?? this._getCurrentMemoryRssMb();
    const activeBrowsers = telemetry.activeBrowsers ?? this.activeJobs.size;

    const cpuRatio = cpu / this.maxCpuPercent;
    const memRatio = memoryRss / this.maxMemoryRssMb;
    const browserRatio = activeBrowsers / this.maxBrowsersPerWorker;

    const maxRatio = Math.max(cpuRatio, memRatio, browserRatio);

    if (maxRatio >= 1.0) {
      return {
        level: 'CRITICAL',
        pressure: true,
        reasons: [
          ...(cpuRatio >= 1.0 ? ['CPU_EXCEEDED'] : []),
          ...(memRatio >= 1.0 ? ['MEMORY_EXCEEDED'] : []),
          ...(browserRatio >= 1.0 ? ['BROWSERS_EXCEEDED'] : [])
        ],
        ratios: { cpuRatio, memRatio, browserRatio }
      };
    }

    if (maxRatio >= 0.8) {
      return {
        level: 'WARNING',
        pressure: true,
        reasons: [
          ...(cpuRatio >= 0.8 ? ['CPU_NEAR_LIMIT'] : []),
          ...(memRatio >= 0.8 ? ['MEMORY_NEAR_LIMIT'] : []),
          ...(browserRatio >= 0.8 ? ['BROWSERS_NEAR_LIMIT'] : [])
        ],
        ratios: { cpuRatio, memRatio, browserRatio }
      };
    }

    return {
      level: 'NORMAL',
      pressure: false,
      reasons: [],
      ratios: { cpuRatio, memRatio, browserRatio }
    };
  }

  /**
   * Returns active tracked jobs count
   */
  getActiveJobCount() {
    return this.activeJobs.size;
  }

  /**
   * Cleans up all active jobs
   */
  cleanup() {
    for (const [_, record] of this.activeJobs) {
      clearTimeout(record.timer);
    }
    this.activeJobs.clear();
  }

  _getCurrentCpu() {
    return 10.0;
  }

  _getCurrentMemoryRssMb() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().rss / (1024 * 1024);
    }
    return 150.0;
  }

  _getCurrentMemoryHeapMb() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed / (1024 * 1024);
    }
    return 75.0;
  }
}

export const defaultResourceGovernor = new ResourceGovernor();
