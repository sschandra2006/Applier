/**
 * Browser Session & Context Management — Phase 3 Entrypoint
 * Applier 2.0
 */

export { BrowserManager, defaultBrowserManager } from './browser-manager.js';
export { ContextManager, defaultContextManager } from './context-manager.js';
export { PageManager, defaultPageManager } from './page-manager.js';
export { FrameManager, defaultFrameManager } from './frame-manager.js';
export { CheckpointManager, defaultCheckpointManager } from './checkpoint-manager.js';
export { CleanupManager, CLEANUP_REASONS, SESSION_TERMINAL_STATUSES } from './cleanup-manager.js';
export {
  SessionManager,
  BrowserSession,
  SESSION_STATUS,
  defaultSessionManager
} from './session-manager.js';
export {
  ObservationEngine,
  defaultObservationEngine,
  ElementNormalizer,
  FormExtractor,
  ActionCandidateDetector
} from '../observation/index.js';
export {
  SemanticPageAnalyzer,
  defaultSemanticPageAnalyzer,
  PAGE_TYPES
} from '../semantic/index.js';

export default {
  BrowserManager: (await import('./browser-manager.js')).BrowserManager,
  ContextManager: (await import('./context-manager.js')).ContextManager,
  PageManager: (await import('./page-manager.js')).PageManager,
  FrameManager: (await import('./frame-manager.js')).FrameManager,
  CheckpointManager: (await import('./checkpoint-manager.js')).CheckpointManager,
  CleanupManager: (await import('./cleanup-manager.js')).CleanupManager,
  SessionManager: (await import('./session-manager.js')).SessionManager
};
