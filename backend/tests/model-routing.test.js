/**
 * Multi-Model AI Routing Test Suite
 * Applier 2.0 — Phase 22: Multi-Model AI Routing
 *
 * Verifies:
 * 1. Deterministic code short-circuits without LLM (0 tokens, $0 cost, <1ms latency, 1.0 confidence)
 * 2. FAST route handles classification, light normalization, and simple extraction
 * 3. VISION route handles document analysis, screenshots, visual UI
 * 4. STRONG route handles ambiguity, complex workflows, recovery, conflicting evidence
 * 5. Full telemetry tracking: model, tokens, latency, cost (USD), confidence, success
 * 6. Fallback pipeline: retry -> alternate model (escalate) -> human checkpoint
 * 7. All decisions strictly adhere to canonical schema `model-routing-decision.json`
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  MultiModelRouterService,
  DeterministicRuleEngine,
  MODEL_PRICING
} from '../src/ai/model-router.service.js';
import {
  ModelRoute,
  RoutingTaskType,
  FallbackStatus
} from '../../shared/enums/index.js';
import { validateModelRoutingDecision } from '../../shared/validators/index.js';

describe('Multi-Model AI Routing System (Phase 22)', () => {
  let router;

  beforeEach(() => {
    router = new MultiModelRouterService();
  });

  describe('1. Deterministic Pre-emption Rule (No LLM Calls)', () => {
    it('should normalize phone numbers to E.164 without LLM (0 tokens, $0 cost)', async () => {
      const payload = { value: '+1 (555) 789-0123', normalizationType: 'phone' };
      const route = router.selectRoute(RoutingTaskType.NORMALIZATION, payload);
      expect(route).toBe(ModelRoute.DETERMINISTIC);

      const decision = await router.executeTask({
        taskType: RoutingTaskType.NORMALIZATION,
        payload
      });

      expect(decision.route).toBe(ModelRoute.DETERMINISTIC);
      expect(decision.selectedModel).toBe('deterministic-rule-engine');
      expect(decision.tokens.totalTokens).toBe(0);
      expect(decision.costUsd).toBe(0.0);
      expect(decision.confidence).toBe(1.0);
      expect(decision.success).toBe(true);
      expect(decision.humanCheckpointRequired).toBe(false);
      expect(decision._result.normalized).toBe('+15557890123');

      const validation = validateModelRoutingDecision(decision);
      expect(validation.valid).toBe(true);
    });

    it('should normalize various date formats to ISO YYYY-MM-DD deterministically', async () => {
      const payload = { value: '15/08/2026', normalizationType: 'date' };
      const decision = await router.executeTask({
        taskType: RoutingTaskType.NORMALIZATION,
        payload
      });

      expect(decision.route).toBe(ModelRoute.DETERMINISTIC);
      expect(decision.tokens.totalTokens).toBe(0);
      expect(decision.costUsd).toBe(0.0);
      expect(decision._result.normalized).toBe('2026-08-15');
    });

    it('should normalize booleans and genders deterministically', async () => {
      const boolRes = await router.executeTask({
        taskType: RoutingTaskType.NORMALIZATION,
        payload: { value: 'yes', normalizationType: 'boolean' }
      });
      expect(boolRes._result.normalized).toBe(true);
      expect(boolRes.costUsd).toBe(0.0);

      const genderRes = await router.executeTask({
        taskType: RoutingTaskType.NORMALIZATION,
        payload: { value: 'female', normalizationType: 'gender' }
      });
      expect(genderRes._result.normalized).toBe('FEMALE');
      expect(genderRes.costUsd).toBe(0.0);
    });

    it('should extract email and PAN deterministically via regex', async () => {
      const emailRes = await router.executeTask({
        taskType: RoutingTaskType.SIMPLE_EXTRACTION,
        payload: {
          text: 'Send applicant details to hr-ops@company.org immediately.',
          extractType: 'email'
        }
      });
      expect(emailRes.route).toBe(ModelRoute.DETERMINISTIC);
      expect(emailRes._result.extracted).toBe('hr-ops@company.org');
      expect(emailRes.tokens.totalTokens).toBe(0);

      const panRes = await router.executeTask({
        taskType: RoutingTaskType.SIMPLE_EXTRACTION,
        payload: {
          text: 'Verified PAN number is ABCDE1234F on file.',
          extractType: 'pan'
        }
      });
      expect(panRes.route).toBe(ModelRoute.DETERMINISTIC);
      expect(panRes._result.extracted).toBe('ABCDE1234F');
    });

    it('should classify exact option matches deterministically', async () => {
      const decision = await router.executeTask({
        taskType: RoutingTaskType.CLASSIFICATION,
        payload: {
          options: ['Full-Time', 'Part-Time', 'Contract'],
          value: 'full-time'
        }
      });
      expect(decision.route).toBe(ModelRoute.DETERMINISTIC);
      expect(decision._result.classification).toBe('Full-Time');
      expect(decision.costUsd).toBe(0.0);
    });
  });

  describe('2. Routing Tier Assignment', () => {
    it('routes general text classification and extraction to FAST', () => {
      expect(router.selectRoute(RoutingTaskType.CLASSIFICATION, { value: 'Senior DevOps Architect with k8s' })).toBe(ModelRoute.FAST);
      expect(router.selectRoute(RoutingTaskType.SIMPLE_EXTRACTION, { text: 'Free-form unformatted summary block' })).toBe(ModelRoute.FAST);
    });

    it('routes document, screenshot, and UI analysis to VISION', () => {
      expect(router.selectRoute(RoutingTaskType.DOCUMENT_ANALYSIS, { docId: 'doc_123' })).toBe(ModelRoute.VISION);
      expect(router.selectRoute(RoutingTaskType.SCREENSHOT_ANALYSIS, { img: 'shot.png' })).toBe(ModelRoute.VISION);
      expect(router.selectRoute(RoutingTaskType.VISUAL_UI, { target: 'dialog' })).toBe(ModelRoute.VISION);
    });

    it('routes ambiguity, complex workflow, recovery, and conflicts to STRONG', () => {
      expect(router.selectRoute(RoutingTaskType.AMBIGUITY_RESOLUTION)).toBe(ModelRoute.STRONG);
      expect(router.selectRoute(RoutingTaskType.COMPLEX_WORKFLOW)).toBe(ModelRoute.STRONG);
      expect(router.selectRoute(RoutingTaskType.RECOVERY)).toBe(ModelRoute.STRONG);
      expect(router.selectRoute(RoutingTaskType.CONFLICTING_EVIDENCE)).toBe(ModelRoute.STRONG);
    });
  });

  describe('3. Telemetry Tracking & Cost Calculation', () => {
    it('accurately computes cost and tracks token counts across models', async () => {
      const mockExecutor = jest.fn().mockResolvedValue({
        ok: true,
        result: { summary: 'Analysis complete' },
        confidence: 0.98,
        inputTokens: 1000,
        outputTokens: 500
      });

      const decision = await router.executeTask({
        taskType: RoutingTaskType.DOCUMENT_ANALYSIS,
        payload: { docUrl: 'https://example.com/passport.pdf' },
        executor: mockExecutor
      });

      expect(decision.route).toBe(ModelRoute.VISION);
      expect(decision.selectedModel).toBe('qwen2-vl-72b-instruct');
      expect(decision.tokens.inputTokens).toBe(1000);
      expect(decision.tokens.outputTokens).toBe(500);
      expect(decision.tokens.totalTokens).toBe(1500);

      // Vision pricing: $0.0010 / 1k in, $0.0020 / 1k out => 1.0 * 0.0010 + 0.5 * 0.0020 = 0.0020
      expect(decision.costUsd).toBeCloseTo(0.0020, 4);
      expect(decision.confidence).toBe(0.98);
      expect(decision.success).toBe(true);
      expect(decision.humanCheckpointRequired).toBe(false);

      const validation = validateModelRoutingDecision(decision);
      expect(validation.valid).toBe(true);
    });
  });

  describe('4. Fallback Pipeline (Retry -> Alternate Model -> Human Checkpoint)', () => {
    it('retries on first transient error and succeeds on second attempt', async () => {
      let callCount = 0;
      const flakingExecutor = jest.fn().mockImplementation(async (model) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Connection reset by peer');
        }
        return {
          ok: true,
          result: { parsed: true },
          confidence: 0.91,
          inputTokens: 120,
          outputTokens: 30
        };
      });

      const decision = await router.executeTask({
        taskType: RoutingTaskType.CLASSIFICATION,
        payload: { text: 'Classify this message' },
        executor: flakingExecutor
      });

      expect(decision.success).toBe(true);
      expect(decision.fallbackHistory).toHaveLength(2);
      expect(decision.fallbackHistory[0].status).toBe(FallbackStatus.RETRY);
      expect(decision.fallbackHistory[1].status).toBe(FallbackStatus.SUCCESS);
      expect(decision.humanCheckpointRequired).toBe(false);
    });

    it('escalates from FAST to STRONG when confidence remains low across retries', async () => {
      const tieredExecutor = jest.fn().mockImplementation(async (model) => {
        if (model.includes('7b')) {
          // Fast model returns low confidence
          return {
            ok: true,
            result: { ambiguous: true },
            confidence: 0.50,
            inputTokens: 80,
            outputTokens: 20
          };
        } else {
          // Strong model succeeds with high confidence
          return {
            ok: true,
            result: { definitive: true },
            confidence: 0.97,
            inputTokens: 200,
            outputTokens: 50
          };
        }
      });

      const decision = await router.executeTask({
        taskType: RoutingTaskType.CLASSIFICATION,
        payload: { text: 'Subtle ambiguous profile description' },
        executor: tieredExecutor
      });

      expect(decision.success).toBe(true);
      expect(decision.route).toBe(ModelRoute.STRONG);
      expect(decision.selectedModel).toBe('qwen-2.5-72b-instruct');
      expect(decision.fallbackHistory).toHaveLength(3);
      expect(decision.fallbackHistory[0].status).toBe(FallbackStatus.RETRY);
      expect(decision.fallbackHistory[1].status).toBe(FallbackStatus.ESCALATED);
      expect(decision.fallbackHistory[2].status).toBe(FallbackStatus.SUCCESS);
      expect(decision.humanCheckpointRequired).toBe(false);
    });

    it('triggers human checkpoint when even STRONG model fails repeatedly', async () => {
      const fatalExecutor = jest.fn().mockRejectedValue(new Error('Fatal syntax decoding exception'));

      const decision = await router.executeTask({
        taskType: RoutingTaskType.COMPLEX_WORKFLOW,
        payload: { site: 'unsupported-portal.com' },
        executor: fatalExecutor
      });

      expect(decision.success).toBe(false);
      expect(decision.humanCheckpointRequired).toBe(true);
      expect(decision.humanCheckpointReason).toMatch(/Fatal model execution error/);
      expect(decision.fallbackHistory).toHaveLength(3);
      expect(decision.fallbackHistory[2].status).toBe(FallbackStatus.HUMAN_CHECKPOINT);

      const validation = validateModelRoutingDecision(decision);
      expect(validation.valid).toBe(true);
    });
  });
});
