/**
 * Observability Metrics Collector Service
 * Applier 2.0 — Phase 25: Production Scaling and Observability
 *
 * Tracks the 11 production metrics:
 * 1. job latency (p50, p90, p99, avg)
 * 2. browser startup time (avg, p95)
 * 3. AI latency (avg, p95)
 * 4. AI cost (tokens, cost in USD)
 * 5. document processing time (avg)
 * 6. field mapping confidence (avgScore, minScore)
 * 7. recovery rate (successes / attempts)
 * 8. submission success rate
 * 9. submission uncertainty rate
 * 10. worker failures (crashes, timeouts)
 * 11. queue depth (waiting, active, completed, failed)
 * + Real-time system resource usage (CPU, RSS, Heap, Active Browsers, Active Workers)
 */

import { validateSystemMetrics } from '../../../shared/validators/index.js';

export class MetricsCollector {
  constructor(options = {}) {
    this.maxSamples = options.maxSamples ?? 1000;
    this.reset();
  }

  reset() {
    this.jobLatencySamples = [];
    this.browserStartupSamples = [];
    this.aiLatencySamples = [];
    this.docProcessingSamples = [];

    this.aiTokens = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0.0
    };

    this.fieldMapping = {
      totalScores: 0,
      sumScores: 0,
      minScore: 1.0,
      totalMappedFields: 0
    };

    this.recoveries = {
      totalAttempts: 0,
      successful: 0
    };

    this.submissions = {
      total: 0,
      successful: 0,
      uncertain: 0
    };

    this.workerFailures = {
      crashCount: 0,
      crashedWorkers: new Set(),
      timeoutAborts: 0
    };

    this.queueDepth = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0
    };

    this.resourceUsage = {
      cpuPercent: 10.0,
      memoryRssMb: 150.0,
      memoryHeapUsedMb: 75.0,
      activeBrowsers: 0,
      activeWorkers: 1
    };
  }

  // --- Record Methods ---

  recordJobLatency(durationMs) {
    if (typeof durationMs === 'number' && durationMs >= 0) {
      this._pushSample(this.jobLatencySamples, durationMs);
    }
  }

  recordBrowserStartup(durationMs) {
    if (typeof durationMs === 'number' && durationMs >= 0) {
      this._pushSample(this.browserStartupSamples, durationMs);
    }
  }

  recordAiLatency(durationMs) {
    if (typeof durationMs === 'number' && durationMs >= 0) {
      this._pushSample(this.aiLatencySamples, durationMs);
    }
  }

  recordAiUsage({ promptTokens = 0, completionTokens = 0, costUsd = null } = {}) {
    const pTokens = Math.max(0, promptTokens);
    const cTokens = Math.max(0, completionTokens);
    const totTokens = pTokens + cTokens;

    this.aiTokens.promptTokens += pTokens;
    this.aiTokens.completionTokens += cTokens;
    this.aiTokens.totalTokens += totTokens;

    // Standard baseline cost estimation if not provided ($2.00 / 1M prompt, $6.00 / 1M completion)
    const calculatedCost = costUsd !== null
      ? costUsd
      : (pTokens * 0.000002) + (cTokens * 0.000006);

    this.aiTokens.totalCostUsd = Number((this.aiTokens.totalCostUsd + calculatedCost).toFixed(6));
  }

  recordDocumentProcessing(durationMs) {
    if (typeof durationMs === 'number' && durationMs >= 0) {
      this._pushSample(this.docProcessingSamples, durationMs);
    }
  }

  recordFieldMappingConfidence(scores) {
    const scoreArray = Array.isArray(scores) ? scores : [scores];
    for (const score of scoreArray) {
      if (typeof score === 'number' && score >= 0 && score <= 1) {
        this.fieldMapping.totalScores += 1;
        this.fieldMapping.sumScores += score;
        this.fieldMapping.totalMappedFields += 1;
        if (score < this.fieldMapping.minScore) {
          this.fieldMapping.minScore = score;
        }
      }
    }
  }

  recordRecoveryAttempt({ successful = false } = {}) {
    this.recoveries.totalAttempts += 1;
    if (successful) {
      this.recoveries.successful += 1;
    }
  }

  recordSubmissionOutcome({ status = 'SUCCESS' } = {}) {
    this.submissions.total += 1;
    const normalized = String(status).toUpperCase();
    if (normalized === 'SUCCESS' || normalized === 'SUBMISSION_VERIFIED') {
      this.submissions.successful += 1;
    } else if (normalized === 'SUBMISSION_UNCERTAIN' || normalized === 'UNCERTAIN') {
      this.submissions.uncertain += 1;
    }
  }

  recordWorkerFailure({ workerId = 'unknown', type = 'CRASH' } = {}) {
    if (type === 'TIMEOUT') {
      this.workerFailures.timeoutAborts += 1;
    } else {
      this.workerFailures.crashCount += 1;
      if (workerId) {
        this.workerFailures.crashedWorkers.add(String(workerId));
      }
    }
  }

  updateQueueDepth(depth = {}) {
    this.queueDepth.waiting = Math.max(0, depth.waiting ?? this.queueDepth.waiting);
    this.queueDepth.active = Math.max(0, depth.active ?? this.queueDepth.active);
    this.queueDepth.completed = Math.max(0, depth.completed ?? this.queueDepth.completed);
    this.queueDepth.failed = Math.max(0, depth.failed ?? this.queueDepth.failed);
  }

  updateResourceUsage(usage = {}) {
    if (usage.cpuPercent !== undefined) this.resourceUsage.cpuPercent = usage.cpuPercent;
    if (usage.memoryRssMb !== undefined) this.resourceUsage.memoryRssMb = usage.memoryRssMb;
    if (usage.memoryHeapUsedMb !== undefined) this.resourceUsage.memoryHeapUsedMb = usage.memoryHeapUsedMb;
    if (usage.activeBrowsers !== undefined) this.resourceUsage.activeBrowsers = usage.activeBrowsers;
    if (usage.activeWorkers !== undefined) this.resourceUsage.activeWorkers = usage.activeWorkers;
  }

  /**
   * Generates a canonical snapshot conforming to system-metrics schema (v2.0.0)
   */
  captureSnapshot(metricsId = null) {
    const id = metricsId || `met_snapshot_${Date.now()}`;
    const timestamp = new Date().toISOString();

    const jobLatPercentiles = this._calculatePercentiles(this.jobLatencySamples);
    const browserStartupStats = this._calculateAvgAndP95(this.browserStartupSamples);
    const aiLatencyStats = this._calculateAvgAndP95(this.aiLatencySamples);
    const docProcessingStats = this._calculateAvg(this.docProcessingSamples);

    const avgFieldConfidence = this.fieldMapping.totalScores > 0
      ? Number((this.fieldMapping.sumScores / this.fieldMapping.totalScores).toFixed(4))
      : 1.0;
    const minFieldConfidence = this.fieldMapping.totalScores > 0
      ? Number(this.fieldMapping.minScore.toFixed(4))
      : 1.0;

    const recoveryRate = this.recoveries.totalAttempts > 0
      ? Number((this.recoveries.successful / this.recoveries.totalAttempts).toFixed(4))
      : 1.0;

    const submissionSuccessRate = this.submissions.total > 0
      ? Number((this.submissions.successful / this.submissions.total).toFixed(4))
      : 1.0;

    const submissionUncertaintyRate = this.submissions.total > 0
      ? Number((this.submissions.uncertain / this.submissions.total).toFixed(4))
      : 0.0;

    // Read process memory if available and not overridden
    let rssMb = this.resourceUsage.memoryRssMb;
    let heapMb = this.resourceUsage.memoryHeapUsedMb;
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      rssMb = Number((mem.rss / (1024 * 1024)).toFixed(1));
      heapMb = Number((mem.heapUsed / (1024 * 1024)).toFixed(1));
    }

    const snapshot = {
      schemaVersion: '2.0.0',
      metricsId: id,
      timestamp,
      jobLatency: {
        p50: jobLatPercentiles.p50,
        p90: jobLatPercentiles.p90,
        p99: jobLatPercentiles.p99,
        avg: jobLatPercentiles.avg,
        sampleCount: this.jobLatencySamples.length
      },
      browserStartup: {
        avgMs: browserStartupStats.avg,
        p95Ms: browserStartupStats.p95,
        sampleCount: this.browserStartupSamples.length
      },
      aiLatency: {
        avgMs: aiLatencyStats.avg,
        p95Ms: aiLatencyStats.p95,
        sampleCount: this.aiLatencySamples.length
      },
      aiCost: {
        promptTokens: this.aiTokens.promptTokens,
        completionTokens: this.aiTokens.completionTokens,
        totalTokens: this.aiTokens.totalTokens,
        totalCostUsd: this.aiTokens.totalCostUsd
      },
      documentProcessingTime: {
        avgMs: docProcessingStats.avg,
        sampleCount: this.docProcessingSamples.length
      },
      fieldMappingConfidence: {
        avgScore: avgFieldConfidence,
        minScore: minFieldConfidence,
        totalMappedFields: this.fieldMapping.totalMappedFields
      },
      recoveryRate: {
        rate: recoveryRate,
        successfulRecoveries: this.recoveries.successful,
        totalRecoveryAttempts: this.recoveries.totalAttempts
      },
      submissionSuccess: {
        rate: submissionSuccessRate,
        successfulCount: this.submissions.successful,
        totalSubmissions: this.submissions.total
      },
      submissionUncertainty: {
        rate: submissionUncertaintyRate,
        uncertainCount: this.submissions.uncertain,
        totalSubmissions: this.submissions.total
      },
      workerFailures: {
        crashCount: this.workerFailures.crashCount,
        crashedWorkers: Array.from(this.workerFailures.crashedWorkers),
        timeoutAborts: this.workerFailures.timeoutAborts
      },
      queueDepth: {
        waiting: this.queueDepth.waiting,
        active: this.queueDepth.active,
        completed: this.queueDepth.completed,
        failed: this.queueDepth.failed
      },
      resourceUsage: {
        cpuPercent: Number(this.resourceUsage.cpuPercent.toFixed(1)),
        memoryRssMb: rssMb,
        memoryHeapUsedMb: heapMb,
        activeBrowsers: this.resourceUsage.activeBrowsers,
        activeWorkers: this.resourceUsage.activeWorkers
      }
    };

    const validation = validateSystemMetrics(snapshot);
    if (!validation.valid) {
      throw new Error(`Metrics snapshot violates schema: ${JSON.stringify(validation.errors)}`);
    }

    return snapshot;
  }

  // --- Helpers ---

  _pushSample(arr, val) {
    if (arr.length >= this.maxSamples) {
      arr.shift();
    }
    arr.push(val);
  }

  _calculatePercentiles(samples) {
    if (samples.length === 0) {
      return { p50: 0, p90: 0, p99: 0, avg: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = Number((sum / sorted.length).toFixed(2));

    const p50Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.50));
    const p90Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.90));
    const p99Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));

    return {
      p50: Number(sorted[p50Index].toFixed(2)),
      p90: Number(sorted[p90Index].toFixed(2)),
      p99: Number(sorted[p99Index].toFixed(2)),
      avg
    };
  }

  _calculateAvgAndP95(samples) {
    if (samples.length === 0) {
      return { avg: 0, p95: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = Number((sum / sorted.length).toFixed(2));
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));

    return {
      avg,
      p95: Number(sorted[p95Index].toFixed(2))
    };
  }

  _calculateAvg(samples) {
    if (samples.length === 0) {
      return { avg: 0 };
    }
    const sum = samples.reduce((a, b) => a + b, 0);
    return { avg: Number((sum / samples.length).toFixed(2)) };
  }
}

export const defaultMetricsCollector = new MetricsCollector();
