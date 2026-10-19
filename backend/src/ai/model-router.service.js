/**
 * Multi-Model AI Routing Service
 * Applier 2.0 — Phase 22: Multi-Model AI Routing
 *
 * Core Principles:
 * 1. Use the least expensive/reasoning-intensive model capable of solving each task.
 * 2. Never use an LLM when deterministic code/regex/heuristics is sufficient.
 * 3. Track model, tokens, latency, cost (USD), confidence, and success for every execution.
 * 4. Resilient Fallback Pipeline:
 *    Primary Route -> Retry -> Alternate Model (Escalate) -> Human Checkpoint.
 * 5. Full compliance with canonical `model-routing-decision.json` schema.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ModelRoute,
  RoutingTaskType,
  FallbackStatus
} from '../../../shared/enums/index.js';
import { validateModelRoutingDecision } from '../../../shared/validators/index.js';

// Standardized Pricing per 1,000 tokens (USD)
export const MODEL_PRICING = Object.freeze({
  'deterministic-rule-engine': { input: 0.0, output: 0.0 },
  'qwen-2.5-7b-instruct': { input: 0.0001, output: 0.0002 },
  'gemini-flash': { input: 0.0001, output: 0.0002 },
  'qwen2-vl-72b-instruct': { input: 0.0010, output: 0.0020 },
  'gemini-1.5-flash-vision': { input: 0.0010, output: 0.0020 },
  'qwen-2.5-72b-instruct': { input: 0.0040, output: 0.0080 },
  'gemini-1.5-pro': { input: 0.0040, output: 0.0080 }
});

export const DEFAULT_ROUTE_MODELS = Object.freeze({
  [ModelRoute.DETERMINISTIC]: 'deterministic-rule-engine',
  [ModelRoute.FAST]: 'qwen-2.5-7b-instruct',
  [ModelRoute.VISION]: 'qwen2-vl-72b-instruct',
  [ModelRoute.STRONG]: 'qwen-2.5-72b-instruct'
});

export const ALTERNATE_ROUTE_MODELS = Object.freeze({
  [ModelRoute.FAST]: 'qwen-2.5-72b-instruct',
  [ModelRoute.VISION]: 'gemini-1.5-flash-vision',
  [ModelRoute.STRONG]: 'gemini-1.5-pro'
});

export const TASK_ROUTE_MAP = Object.freeze({
  [RoutingTaskType.DETERMINISTIC_EXTRACTION]: ModelRoute.DETERMINISTIC,
  [RoutingTaskType.CLASSIFICATION]: ModelRoute.FAST,
  [RoutingTaskType.NORMALIZATION]: ModelRoute.FAST,
  [RoutingTaskType.SIMPLE_EXTRACTION]: ModelRoute.FAST,
  [RoutingTaskType.DOCUMENT_ANALYSIS]: ModelRoute.VISION,
  [RoutingTaskType.SCREENSHOT_ANALYSIS]: ModelRoute.VISION,
  [RoutingTaskType.VISUAL_UI]: ModelRoute.VISION,
  [RoutingTaskType.AMBIGUITY_RESOLUTION]: ModelRoute.STRONG,
  [RoutingTaskType.COMPLEX_WORKFLOW]: ModelRoute.STRONG,
  [RoutingTaskType.RECOVERY]: ModelRoute.STRONG,
  [RoutingTaskType.CONFLICTING_EVIDENCE]: ModelRoute.STRONG
});

/**
 * Deterministic Engine: Handles exact regexes, formatters, and lookups without calling any LLM.
 * Zero tokens, $0.00 cost, <1ms latency, 100% confidence.
 */
export class DeterministicRuleEngine {
  /**
   * Checks whether the task can be resolved deterministically.
   */
  static canResolve(taskType, payload = {}) {
    if (taskType === RoutingTaskType.DETERMINISTIC_EXTRACTION) {
      return true;
    }

    if (taskType === RoutingTaskType.NORMALIZATION) {
      const type = (payload.normalizationType || '').toLowerCase();
      const val = String(payload.value || '').trim();
      if (['phone', 'date', 'boolean', 'gender', 'email', 'trim', 'uppercase', 'lowercase'].includes(type)) {
        return true;
      }
      // Auto-detect phone or simple date format
      if (/^[\d\s+\-().]{7,25}$/.test(val)) return true;
      if (/^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$/.test(val)) return true;
    }

    if (taskType === RoutingTaskType.CLASSIFICATION) {
      const { options, value } = payload;
      if (Array.isArray(options) && value) {
        const valStr = String(value).trim().toLowerCase();
        if (options.some(opt => String(opt).trim().toLowerCase() === valStr)) {
          return true;
        }
      }
    }

    if (taskType === RoutingTaskType.SIMPLE_EXTRACTION) {
      const extractType = (payload.extractType || '').toLowerCase();
      if (['email', 'pan', 'aadhaar', 'phone', 'url'].includes(extractType)) {
        return true;
      }
      if (payload.regexPattern) {
        return true;
      }
    }

    return false;
  }

  /**
   * Executes deterministic transformation with 1.0 confidence.
   */
  static resolve(taskType, payload = {}) {
    const val = payload.value;
    const subType = (payload.normalizationType || '').toLowerCase();

    // 1. Phone Normalization (E.164)
    if (subType === 'phone' || (taskType === RoutingTaskType.NORMALIZATION && /^[\d\s+\-().]{7,25}$/.test(String(val || '').trim()))) {
      const digits = String(val).replace(/[^\d+]/g, '');
      let formatted = digits;
      if (!digits.startsWith('+')) {
        const cc = payload.defaultCountryCode || '+1';
        formatted = `${cc}${digits.length === 10 ? digits : digits.slice(-10)}`;
      }
      return { ok: true, result: { normalized: formatted, original: val }, confidence: 1.0 };
    }

    // 2. Date Normalization (ISO YYYY-MM-DD)
    if (subType === 'date' || (taskType === RoutingTaskType.NORMALIZATION && /^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$/.test(String(val || '').trim()))) {
      const parts = String(val).trim().split(/[/\-.]/);
      if (parts.length === 3) {
        let yyyy, mm, dd;
        if (parts[0].length === 4) {
          [yyyy, mm, dd] = [parts[0], parts[1].padStart(2, '0'), parts[2].padStart(2, '0')];
        } else if (parts[2].length === 4) {
          if (parseInt(parts[0], 10) > 12) {
            [dd, mm, yyyy] = [parts[0].padStart(2, '0'), parts[1].padStart(2, '0'), parts[2]];
          } else {
            [mm, dd, yyyy] = [parts[0].padStart(2, '0'), parts[1].padStart(2, '0'), parts[2]];
          }
        } else {
          [yyyy, mm, dd] = [`20${parts[2]}`, parts[0].padStart(2, '0'), parts[1].padStart(2, '0')];
        }
        return { ok: true, result: { normalized: `${yyyy}-${mm}-${dd}`, original: val }, confidence: 1.0 };
      }
    }

    // 3. Boolean Normalization
    if (subType === 'boolean') {
      const s = String(val).trim().toLowerCase();
      if (['true', 'yes', '1', 'y'].includes(s)) {
        return { ok: true, result: { normalized: true, original: val }, confidence: 1.0 };
      }
      if (['false', 'no', '0', 'n'].includes(s)) {
        return { ok: true, result: { normalized: false, original: val }, confidence: 1.0 };
      }
    }

    // 4. Gender Normalization
    if (subType === 'gender') {
      const s = String(val).trim().toLowerCase();
      if (['m', 'male', 'man'].includes(s)) {
        return { ok: true, result: { normalized: 'MALE', original: val }, confidence: 1.0 };
      }
      if (['f', 'female', 'woman'].includes(s)) {
        return { ok: true, result: { normalized: 'FEMALE', original: val }, confidence: 1.0 };
      }
      return { ok: true, result: { normalized: 'OTHER', original: val }, confidence: 1.0 };
    }

    // 5. String / Email Normalization
    if (subType === 'email') {
      return { ok: true, result: { normalized: String(val).trim().toLowerCase(), original: val }, confidence: 1.0 };
    }

    // 6. Direct Option Classification
    if (taskType === RoutingTaskType.CLASSIFICATION && Array.isArray(payload.options)) {
      const s = String(val || '').trim().toLowerCase();
      const match = payload.options.find(opt => String(opt).trim().toLowerCase() === s);
      if (match) {
        return { ok: true, result: { classification: match }, confidence: 1.0 };
      }
    }

    // 7. Regex Extractions
    if (taskType === RoutingTaskType.SIMPLE_EXTRACTION || taskType === RoutingTaskType.DETERMINISTIC_EXTRACTION) {
      const text = payload.text || '';
      const extractType = (payload.extractType || '').toLowerCase();

      if (extractType === 'email' || !extractType) {
        const emailMatch = text.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/);
        if (emailMatch) {
          return { ok: true, result: { extracted: emailMatch[0], type: 'email' }, confidence: 1.0 };
        }
      }

      if (extractType === 'pan') {
        const panMatch = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
        if (panMatch) {
          return { ok: true, result: { extracted: panMatch[0], type: 'pan' }, confidence: 1.0 };
        }
      }

      if (extractType === 'aadhaar') {
        const aadhaarMatch = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
        if (aadhaarMatch) {
          return { ok: true, result: { extracted: aadhaarMatch[0], type: 'aadhaar' }, confidence: 1.0 };
        }
      }
    }

    return { ok: false, result: null, confidence: 0.0 };
  }
}

/**
 * MultiModelRouterService
 * Dispatches tasks to the appropriate model, collects metrics, and oversees fallback.
 */
export class MultiModelRouterService {
  constructor(options = {}) {
    this.models = { ...DEFAULT_ROUTE_MODELS, ...(options.customModels || {}) };
    this.alternateModels = { ...ALTERNATE_ROUTE_MODELS, ...(options.customAlternateModels || {}) };
    this.pricing = { ...MODEL_PRICING, ...(options.customPricing || {}) };
  }

  /**
   * Selects the initial routing tier based on deterministic pre-emption and task classification.
   */
  selectRoute(taskType, payload = {}) {
    // 1. Check if deterministic code is sufficient
    if (DeterministicRuleEngine.canResolve(taskType, payload)) {
      return ModelRoute.DETERMINISTIC;
    }

    // 2. Lookup standard route tier
    return TASK_ROUTE_MAP[taskType] || ModelRoute.STRONG;
  }

  /**
   * Calculates estimated cost in USD based on model pricing table.
   */
  calculateCost(model, inputTokens, outputTokens) {
    const rates = this.pricing[model] || { input: 0.0040, output: 0.0080 };
    const cost = ((inputTokens / 1000) * rates.input) + ((outputTokens / 1000) * rates.output);
    return Math.round(cost * 1000000) / 1000000;
  }

  /**
   * Executes task through the designated route with full telemetry and fallback support.
   */
  async executeTask({
    taskType,
    payload = {},
    executor = null
  }) {
    const startTime = Date.now();
    const decisionId = `mrd_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    let route = this.selectRoute(taskType, payload);
    const fallbackHistory = [];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0.0;
    let confidence = 0.0;
    let success = false;
    let humanCheckpointRequired = false;
    let humanCheckpointReason = null;
    let resultData = null;
    let selectedModel = this.models[route] || 'deterministic-rule-engine';

    // 1. DETERMINISTIC ROUTE EXECUTION
    if (route === ModelRoute.DETERMINISTIC) {
      const detRes = DeterministicRuleEngine.resolve(taskType, payload);
      const latencyMs = Math.max(0.1, Date.now() - startTime);

      if (detRes.ok) {
        const decision = {
          schemaVersion: '2.0.0',
          decisionId,
          taskType,
          route: ModelRoute.DETERMINISTIC,
          selectedModel: 'deterministic-rule-engine',
          tokens: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0
          },
          latencyMs,
          costUsd: 0.0,
          confidence: detRes.confidence,
          success: true,
          fallbackHistory: [],
          humanCheckpointRequired: false,
          humanCheckpointReason: null
        };

        const validation = validateModelRoutingDecision(decision);
        if (!validation.valid) {
          throw new Error(`Canonical validation failed: ${JSON.stringify(validation.errors)}`);
        }

        return {
          ...decision,
          _result: detRes.result
        };
      }

      // If deterministic resolution failed unexpectedly, fall through to FAST
      route = ModelRoute.FAST;
      selectedModel = this.models[ModelRoute.FAST];
    }

    // Default mock executor if not provided
    const defaultExecutor = async (model, p) => {
      const inTok = Math.ceil(JSON.stringify(p).length / 4) + 15;
      const outTok = 25;
      return {
        ok: true,
        result: { resolvedBy: model, timestamp: Date.now() },
        confidence: 0.94,
        inputTokens: inTok,
        outputTokens: outTok
      };
    };

    const callExecutor = executor || defaultExecutor;

    // 2. AI EXECUTION WITH FALLBACK CHAIN (Retry -> Escalate -> Human Checkpoint)
    let currentModel = selectedModel;
    let attempt = 1;
    const maxAttempts = 3;

    while (attempt <= maxAttempts) {
      try {
        const res = await callExecutor(currentModel, payload);
        const inTok = res.inputTokens || 0;
        const outTok = res.outputTokens || 0;
        const callCost = this.calculateCost(currentModel, inTok, outTok);

        totalInputTokens += inTok;
        totalOutputTokens += outTok;
        totalCost += callCost;

        const isConfident = (res.confidence || 0) >= 0.65;
        if (res.ok && isConfident) {
          success = true;
          confidence = res.confidence;
          resultData = res.result;
          selectedModel = currentModel;
          fallbackHistory.push({
            attempt,
            model: currentModel,
            error: null,
            status: FallbackStatus.SUCCESS
          });
          break;
        } else {
          const errMsg = !res.ok ? (res.error || 'Execution returned non-ok status') : `Low confidence (${res.confidence})`;
          if (attempt === 1) {
            // First failure -> RETRY on same model
            fallbackHistory.push({
              attempt,
              model: currentModel,
              error: errMsg,
              status: FallbackStatus.RETRY
            });
            attempt++;
          } else if (attempt === 2) {
            // Second failure -> ESCALATE to alternate model
            fallbackHistory.push({
              attempt,
              model: currentModel,
              error: errMsg,
              status: FallbackStatus.ESCALATED
            });
            const altModel = this.alternateModels[route] || 'gemini-1.5-pro';
            currentModel = altModel;
            if (route === ModelRoute.FAST) {
              route = ModelRoute.STRONG;
            }
            attempt++;
          } else {
            // Final failure -> HUMAN CHECKPOINT
            fallbackHistory.push({
              attempt,
              model: currentModel,
              error: errMsg,
              status: FallbackStatus.HUMAN_CHECKPOINT
            });
            humanCheckpointRequired = true;
            humanCheckpointReason = `Multi-model routing failed after retries and escalation: ${errMsg}`;
            success = false;
            confidence = res.confidence || 0.0;
            selectedModel = currentModel;
            break;
          }
        }
      } catch (err) {
        const errMsg = err.message || 'Execution error';
        if (attempt === 1) {
          fallbackHistory.push({
            attempt,
            model: currentModel,
            error: errMsg,
            status: FallbackStatus.RETRY
          });
          attempt++;
        } else if (attempt === 2) {
          fallbackHistory.push({
            attempt,
            model: currentModel,
            error: errMsg,
            status: FallbackStatus.ESCALATED
          });
          const altModel = this.alternateModels[route] || 'gemini-1.5-pro';
          currentModel = altModel;
          if (route === ModelRoute.FAST) {
            route = ModelRoute.STRONG;
          }
          attempt++;
        } else {
          fallbackHistory.push({
            attempt,
            model: currentModel,
            error: errMsg,
            status: FallbackStatus.HUMAN_CHECKPOINT
          });
          humanCheckpointRequired = true;
          humanCheckpointReason = `Fatal model execution error: ${errMsg}`;
          success = false;
          selectedModel = currentModel;
          break;
        }
      }
    }

    const latencyMs = Math.max(0.1, Date.now() - startTime);

    const decision = {
      schemaVersion: '2.0.0',
      decisionId,
      taskType,
      route,
      selectedModel,
      tokens: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens
      },
      latencyMs,
      costUsd: Math.round(totalCost * 1000000) / 1000000,
      confidence: Math.round(confidence * 10000) / 10000,
      success,
      fallbackHistory,
      humanCheckpointRequired,
      humanCheckpointReason
    };

    const validation = validateModelRoutingDecision(decision);
    if (!validation.valid) {
      throw new Error(`Canonical validation failed for ModelRoutingDecision: ${JSON.stringify(validation.errors)}`);
    }

    if (resultData) {
      decision._result = resultData;
    }

    return decision;
  }
}

export const defaultModelRouterService = new MultiModelRouterService();
