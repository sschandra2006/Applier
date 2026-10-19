/**
 * Scaling and Observability Module Index
 * Applier 2.0 — Phase 25: Production Scaling and Observability
 */

export { ResourceGovernor, defaultResourceGovernor } from './resource-governor.js';
export { WorkerPoolScaler, defaultWorkerPoolScaler } from './worker-pool.scaler.js';
export { MetricsCollector, defaultMetricsCollector } from './metrics-collector.service.js';
export { AlertEngine, defaultAlertEngine } from './alert-engine.service.js';
export {
  LoadBalancer,
  ApiInstance,
  RedisQueueSimulator,
  MongoDatabaseSimulator,
  ObjectStorageSimulator,
  WorkerNode
} from './load-balancer.simulator.js';
export { ProgressiveLoadTester } from './progressive-load-tester.js';
