/**
 * Production Alert Engine Service
 * Applier 2.0 — Phase 25: Production Scaling and Observability
 *
 * Evaluates operational telemetry and dispatches canonical alerts for:
 * 1. HIGH_FAILURE_RATE
 * 2. WORKER_CRASHES
 * 3. QUEUE_BACKLOG
 * 4. MEMORY_PRESSURE
 * 5. AI_FAILURES
 * 6. DATABASE_FAILURES
 */

import crypto from 'crypto';
import { ScalingAlertType, AlertSeverity } from '../../../shared/enums/index.js';
import { validateScalingAlert } from '../../../shared/validators/index.js';

export class AlertEngine {
  constructor(options = {}) {
    this.failureRateThreshold = options.failureRateThreshold ?? 0.15; // 15%
    this.workerCrashThreshold = options.workerCrashThreshold ?? 1;
    this.queueBacklogThreshold = options.queueBacklogThreshold ?? 20;
    this.memoryPressurePercentThreshold = options.memoryPressurePercentThreshold ?? 85.0; // 85%
    this.aiFailureRateThreshold = options.aiFailureRateThreshold ?? 0.10; // 10%
    this.databaseLatencyThresholdMs = options.databaseLatencyThresholdMs ?? 5000;

    this.activeAlerts = new Map(); // alertKey -> alertRecord
    this.alertHistory = [];
    this.subscribers = new Set();

    // AI failure tracking window
    this.aiStats = { total: 0, failures: 0, consecutiveFailures: 0 };
  }

  /**
   * Subscribes a listener to triggered alerts
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Evaluates a SystemMetrics snapshot against all alert rules
   */
  evaluateMetrics(metricsSnapshot) {
    const triggered = [];

    // 1. HIGH_FAILURE_RATE
    const totalJobs = metricsSnapshot.queueDepth.completed + metricsSnapshot.queueDepth.failed;
    if (totalJobs >= 5) {
      const failureRate = metricsSnapshot.queueDepth.failed / totalJobs;
      if (failureRate >= this.failureRateThreshold) {
        const alert = this._createOrUpdateAlert({
          alertType: ScalingAlertType.HIGH_FAILURE_RATE,
          severity: failureRate >= 0.30 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
          message: `Job failure rate (${(failureRate * 100).toFixed(1)}%) exceeded threshold (${(this.failureRateThreshold * 100).toFixed(1)}%).`,
          triggerValue: Number(failureRate.toFixed(4)),
          thresholdValue: this.failureRateThreshold,
          metadata: { totalJobs, failedJobs: metricsSnapshot.queueDepth.failed }
        });
        if (alert) triggered.push(alert);
      }
    }

    // 2. WORKER_CRASHES
    if (metricsSnapshot.workerFailures.crashCount >= this.workerCrashThreshold) {
      const alert = this._createOrUpdateAlert({
        alertType: ScalingAlertType.WORKER_CRASHES,
        severity: AlertSeverity.CRITICAL,
        message: `Worker crash detected! Crash count: ${metricsSnapshot.workerFailures.crashCount}.`,
        triggerValue: metricsSnapshot.workerFailures.crashCount,
        thresholdValue: this.workerCrashThreshold,
        workerId: metricsSnapshot.workerFailures.crashedWorkers[0] || null,
        metadata: { crashedWorkers: metricsSnapshot.workerFailures.crashedWorkers }
      });
      if (alert) triggered.push(alert);
    }

    // 3. QUEUE_BACKLOG
    if (metricsSnapshot.queueDepth.waiting >= this.queueBacklogThreshold) {
      const alert = this._createOrUpdateAlert({
        alertType: ScalingAlertType.QUEUE_BACKLOG,
        severity: metricsSnapshot.queueDepth.waiting >= this.queueBacklogThreshold * 2
          ? AlertSeverity.CRITICAL
          : AlertSeverity.WARNING,
        message: `Queue backlog (${metricsSnapshot.queueDepth.waiting} waiting jobs) exceeded threshold (${this.queueBacklogThreshold}).`,
        triggerValue: metricsSnapshot.queueDepth.waiting,
        thresholdValue: this.queueBacklogThreshold,
        metadata: { queueDepth: metricsSnapshot.queueDepth }
      });
      if (alert) triggered.push(alert);
    }

    // 4. MEMORY_PRESSURE
    // Default limit baseline 1500 MB
    const memoryLimitMb = 1500.0;
    const memoryPercent = (metricsSnapshot.resourceUsage.memoryRssMb / memoryLimitMb) * 100.0;
    if (memoryPercent >= this.memoryPressurePercentThreshold) {
      const alert = this._createOrUpdateAlert({
        alertType: ScalingAlertType.MEMORY_PRESSURE,
        severity: memoryPercent >= 95.0 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        message: `Worker memory utilization (${memoryPercent.toFixed(1)}%) reached pressure limit (${this.memoryPressurePercentThreshold}%).`,
        triggerValue: Number(memoryPercent.toFixed(2)),
        thresholdValue: this.memoryPressurePercentThreshold,
        metadata: {
          memoryRssMb: metricsSnapshot.resourceUsage.memoryRssMb,
          memoryHeapUsedMb: metricsSnapshot.resourceUsage.memoryHeapUsedMb
        }
      });
      if (alert) triggered.push(alert);
    }

    return triggered;
  }

  /**
   * Reports a worker crash directly from worker lifecycle
   */
  reportWorkerCrash({ workerId, error = 'Unknown crash', exitCode = 1 }) {
    return this._createOrUpdateAlert({
      alertType: ScalingAlertType.WORKER_CRASHES,
      severity: AlertSeverity.CRITICAL,
      message: `Worker process ${workerId} crashed unexpectedly with exit code ${exitCode}: ${error}`,
      triggerValue: 1,
      thresholdValue: 1,
      workerId: String(workerId),
      metadata: { error: String(error), exitCode }
    });
  }

  /**
   * Reports a database failure directly from DB layer
   */
  reportDatabaseFailure({ operation = 'query', error = 'Database connection error', latencyMs = null }) {
    const isLatencyIssue = latencyMs !== null && latencyMs >= this.databaseLatencyThresholdMs;
    const triggerVal = isLatencyIssue ? latencyMs : 1;
    const thresholdVal = isLatencyIssue ? this.databaseLatencyThresholdMs : 0;

    return this._createOrUpdateAlert({
      alertType: ScalingAlertType.DATABASE_FAILURES,
      severity: AlertSeverity.CRITICAL,
      message: `Database failure during ${operation}: ${error}`,
      triggerValue: triggerVal,
      thresholdValue: thresholdVal,
      metadata: { operation, error: String(error), latencyMs }
    });
  }

  /**
   * Reports an AI failure directly from AI invocation layer
   */
  reportAiFailure({ provider = 'gemini', model = 'flash', error = 'Rate limit exceeded' }) {
    this.aiStats.total += 1;
    this.aiStats.failures += 1;
    this.aiStats.consecutiveFailures += 1;

    const failureRate = this.aiStats.failures / this.aiStats.total;

    if (failureRate >= this.aiFailureRateThreshold || this.aiStats.consecutiveFailures >= 3) {
      return this._createOrUpdateAlert({
        alertType: ScalingAlertType.AI_FAILURES,
        severity: this.aiStats.consecutiveFailures >= 5 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        message: `AI provider ${provider} (${model}) failure threshold reached: ${error}`,
        triggerValue: Number(failureRate.toFixed(4)),
        thresholdValue: this.aiFailureRateThreshold,
        metadata: {
          provider,
          model,
          consecutiveFailures: this.aiStats.consecutiveFailures,
          error: String(error)
        }
      });
    }

    return null;
  }

  /**
   * Records a successful AI call to heal consecutive failures
   */
  recordAiSuccess() {
    this.aiStats.total += 1;
    this.aiStats.consecutiveFailures = 0;
  }

  /**
   * Resolves an alert by ID
   */
  resolveAlert(alertId) {
    for (const [key, alert] of this.activeAlerts) {
      if (alert.alertId === alertId) {
        alert.resolved = true;
        this.activeAlerts.delete(key);
        return alert;
      }
    }
    return null;
  }

  /**
   * Returns list of currently active (unresolved) alerts
   */
  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Returns complete history of dispatched alerts
   */
  getAlertHistory() {
    return [...this.alertHistory];
  }

  clear() {
    this.activeAlerts.clear();
    this.alertHistory = [];
    this.aiStats = { total: 0, failures: 0, consecutiveFailures: 0 };
  }

  _createOrUpdateAlert({
    alertType,
    severity,
    message,
    triggerValue,
    thresholdValue,
    workerId = null,
    metadata = {}
  }) {
    const key = `${alertType}:${workerId || 'global'}`;
    const alertId = `alt_${crypto.randomUUID().slice(0, 12)}`;
    const timestamp = new Date().toISOString();

    const alertPayload = {
      schemaVersion: '2.0.0',
      alertId,
      alertType,
      severity,
      message,
      triggerValue: Number(triggerValue),
      thresholdValue: Number(thresholdValue),
      timestamp,
      ...(workerId ? { workerId } : {}),
      metadata,
      resolved: false
    };

    const validation = validateScalingAlert(alertPayload);
    if (!validation.valid) {
      throw new Error(`Alert payload violates schema: ${JSON.stringify(validation.errors)}`);
    }

    this.activeAlerts.set(key, alertPayload);
    this.alertHistory.push(alertPayload);

    for (const sub of this.subscribers) {
      try {
        sub(alertPayload);
      } catch (_) {}
    }

    return alertPayload;
  }
}

export const defaultAlertEngine = new AlertEngine();
