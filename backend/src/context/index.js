/**
 * Context Optimization Module
 * Applier 2.0 — Phase 21: Large Application and Context Optimization
 */

export { HierarchicalContextEngine, defaultHierarchicalContextEngine } from './hierarchical-context.engine.js';
export { ContextOptimizationCache, defaultContextOptimizationCache } from './context-optimization-cache.js';

import defaultHierarchicalContextEngine from './hierarchical-context.engine.js';
import defaultContextOptimizationCache from './context-optimization-cache.js';

export default {
  HierarchicalContextEngine: defaultHierarchicalContextEngine,
  ContextOptimizationCache: defaultContextOptimizationCache
};
