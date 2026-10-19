/**
 * Observation Engine Barrel Export
 * Applier 2.0 — Phase 4: Live Browser Observation Engine
 */

export { ObservationEngine, defaultObservationEngine, default } from './observation-engine.js';
export { ElementNormalizer, defaultElementNormalizer } from './element-normalizer.js';
export { FormExtractor, defaultFormExtractor } from './form-extractor.js';
export { ActionCandidateDetector, defaultActionCandidateDetector } from './action-candidate-detector.js';
export { collectFrameDom } from './dom-collector.js';
