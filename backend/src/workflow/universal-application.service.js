/**
 * Universal Application Service — Applier 2.0 (Phase 20)
 * Exposes universal unknown-website application mode to backend workflows and controllers.
 */

import { UniversalApplicationEngine, defaultUniversalApplicationEngine } from '../../../browser-worker/workflow/universal-application.engine.js';

export { UniversalApplicationEngine, defaultUniversalApplicationEngine };

export const runUniversalApplication = async (params) => {
  return await defaultUniversalApplicationEngine.executeUniversalWorkflow(params);
};

export default {
  UniversalApplicationEngine,
  defaultUniversalApplicationEngine,
  runUniversalApplication
};
