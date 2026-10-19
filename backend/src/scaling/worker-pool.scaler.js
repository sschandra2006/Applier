/**
 * Worker Pool Autoscaler Service
 * Applier 2.0 — Phase 25: Production Scaling and Observability
 *
 * Computes dynamic scaling decisions based on:
 * - Queue depth
 * - CPU utilization
 * - Memory utilization
 * - Job latency (P90)
 */

import { ScalingAction } from '../../../shared/enums/index.js';

export class WorkerPoolScaler {
  constructor(options = {}) {
    this.minWorkers = options.minWorkers ?? 1;
    this.maxWorkers = options.maxWorkers ?? 20;
    this.targetJobsPerWorker = options.targetJobsPerWorker ?? 3;
    this.targetCpuPercent = options.targetCpuPercent ?? 75.0;
    this.scaleDownCpuPercent = options.scaleDownCpuPercent ?? 25.0;
    this.targetMemoryPercent = options.targetMemoryPercent ?? 75.0;
    this.targetLatencyMs = options.targetLatencyMs ?? 15000.0;
    this.cooldownMs = options.cooldownMs ?? 5000;

    this.lastScalingTime = 0;
    this.scalingHistory = [];
  }

  /**
   * Evaluates pool metrics and calculates the desired scaling action
   */
  evaluateScaling(metrics = {}) {
    const queueDepth = metrics.queueDepth ?? 0;
    const currentWorkers = Math.max(1, metrics.currentWorkers ?? 1);
    const avgCpu = metrics.avgCpu ?? 10.0;
    const avgMemoryPercent = metrics.avgMemoryPercent ?? 30.0;
    const jobLatencyP90 = metrics.jobLatencyP90 ?? 2000.0;
    const now = metrics.currentTime ?? Date.now();

    // 1. Calculate required worker capacity per signal
    const neededByQueue = queueDepth > 0
      ? Math.ceil(queueDepth / this.targetJobsPerWorker)
      : 1;

    const neededByCpu = avgCpu > this.targetCpuPercent
      ? Math.ceil(currentWorkers * (avgCpu / this.targetCpuPercent))
      : 1;

    const neededByMemory = avgMemoryPercent > this.targetMemoryPercent
      ? Math.ceil(currentWorkers * (avgMemoryPercent / this.targetMemoryPercent))
      : 1;

    const neededByLatency = jobLatencyP90 > this.targetLatencyMs
      ? Math.ceil(currentWorkers * 1.5)
      : 1;

    // Highest demand wins
    const rawDesired = Math.max(
      this.minWorkers,
      neededByQueue,
      neededByCpu,
      neededByMemory,
      neededByLatency
    );

    const desiredWorkers = Math.min(this.maxWorkers, rawDesired);

    // Identify primary driving factor
    let driver = 'QUEUE_DEPTH';
    let maxFactor = neededByQueue;

    if (neededByCpu > maxFactor) {
      driver = 'CPU_UTILIZATION';
      maxFactor = neededByCpu;
    }
    if (neededByMemory > maxFactor) {
      driver = 'MEMORY_PRESSURE';
      maxFactor = neededByMemory;
    }
    if (neededByLatency > maxFactor) {
      driver = 'JOB_LATENCY_SPIKE';
      maxFactor = neededByLatency;
    }

    // Check cooldown
    const cooldownRemaining = Math.max(0, this.cooldownMs - (now - this.lastScalingTime));
    const inCooldown = cooldownRemaining > 0;

    // Decision Logic
    if (rawDesired > currentWorkers) {
      // Scale UP is prioritized, but if already at max workers, trigger THROTTLE
      if (currentWorkers >= this.maxWorkers) {
        return {
          action: ScalingAction.THROTTLE,
          currentWorkers,
          desiredWorkers: this.maxWorkers,
          delta: 0,
          driver,
          reason: `Pool at capacity limit (${this.maxWorkers} workers) with excess load. Throttle admissions.`,
          metrics: { queueDepth, avgCpu, avgMemoryPercent, jobLatencyP90 }
        };
      }

      this.lastScalingTime = now;
      const decision = {
        action: ScalingAction.SCALE_UP,
        currentWorkers,
        desiredWorkers,
        delta: desiredWorkers - currentWorkers,
        driver,
        reason: `Scale up triggered by ${driver} (desired: ${desiredWorkers}, current: ${currentWorkers})`,
        metrics: { queueDepth, avgCpu, avgMemoryPercent, jobLatencyP90 }
      };
      this.scalingHistory.push({ ...decision, timestamp: now });
      return decision;
    }

    if (desiredWorkers < currentWorkers) {
      // Scale down requires:
      // 1. Not in cooldown
      // 2. Queue is drained
      // 3. CPU and Memory safely low
      if (inCooldown) {
        return {
          action: ScalingAction.NOOP,
          currentWorkers,
          desiredWorkers: currentWorkers,
          delta: 0,
          driver: 'COOLDOWN_ACTIVE',
          reason: `Scale down deferred due to active cooldown (${cooldownRemaining} ms remaining)`,
          metrics: { queueDepth, avgCpu, avgMemoryPercent, jobLatencyP90 }
        };
      }

      if (queueDepth === 0 && avgCpu <= this.scaleDownCpuPercent && avgMemoryPercent < 50.0) {
        this.lastScalingTime = now;
        const decision = {
          action: ScalingAction.SCALE_DOWN,
          currentWorkers,
          desiredWorkers,
          delta: desiredWorkers - currentWorkers,
          driver: 'RESOURCE_UNDERUTILIZATION',
          reason: `Scale down triggered: queue empty and low CPU (${avgCpu.toFixed(1)}%)`,
          metrics: { queueDepth, avgCpu, avgMemoryPercent, jobLatencyP90 }
        };
        this.scalingHistory.push({ ...decision, timestamp: now });
        return decision;
      }
    }

    return {
      action: ScalingAction.NOOP,
      currentWorkers,
      desiredWorkers: currentWorkers,
      delta: 0,
      driver: 'EQUILIBRIUM',
      reason: 'Worker pool operating within target resource and queue thresholds',
      metrics: { queueDepth, avgCpu, avgMemoryPercent, jobLatencyP90 }
    };
  }

  getScalingHistory() {
    return [...this.scalingHistory];
  }

  resetCooldown() {
    this.lastScalingTime = 0;
  }
}

export const defaultWorkerPoolScaler = new WorkerPoolScaler();
