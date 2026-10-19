/**
 * QA Laboratory Automation Test Runner
 * Orchestrates multi-level automated regression testing against synthetic websites.
 */

import { validateQaLabScenario } from '../../shared/validators/index.js';
import { ObservationEngine } from '../observation/index.js';
import { RuntimeLocatorResolver } from '../locator/index.js';
import { ActionVerifier } from '../execution/action-verifier.js';
import { MultiLevelRecoveryEngine } from '../execution/multi-level-recovery.engine.js';
import { QA_SCENARIOS, getScenarioByNumber, getScenarioById } from './fixtures/index.js';

export class QaRunner {
  constructor(options = {}) {
    this.observationEngine = options.observationEngine || new ObservationEngine();
    this.locatorResolver = options.locatorResolver || new RuntimeLocatorResolver();
    this.actionVerifier = options.actionVerifier || new ActionVerifier();
    this.recoveryEngine = options.recoveryEngine || new MultiLevelRecoveryEngine();
  }

  /**
   * Validates canonical schema contract and syntax for all fixtures
   */
  validateAllScenariosContract() {
    const results = [];
    for (const scenario of QA_SCENARIOS) {
      const validation = validateQaLabScenario(scenario);
      results.push({
        scenarioNumber: scenario.scenarioNumber,
        scenarioId: scenario.scenarioId,
        valid: validation.valid,
        errors: validation.errors || []
      });
    }
    return results;
  }

  /**
   * Executes observation and element extraction integration check on a scenario
   * @param {import('playwright').Page} page
   * @param {object} scenario
   */
  async runObservationIntegration(page, scenario) {
    const startTime = Date.now();
    await page.setContent(scenario.htmlFixture, { waitUntil: 'domcontentloaded' });
    const observation = await this.observationEngine.observe(page, { depth: 'interactive' });
    const durationMs = Date.now() - startTime;

    return {
      scenarioNumber: scenario.scenarioNumber,
      scenarioId: scenario.scenarioId,
      elementsCount: observation.elements.length,
      formsCount: observation.forms.length,
      actionCandidatesCount: observation.actionCandidates.length,
      durationMs,
      observation
    };
  }

  /**
   * Runs a stress load test across multiple parallel page contexts
   * @param {import('playwright').Browser} browser
   * @param {Array<object>} scenarios
   * @param {number} concurrency
   */
  async runStressLoad(browser, scenarios, concurrency = 4) {
    const memBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    const taskResults = [];

    // Run scenarios in parallel chunks
    for (let i = 0; i < scenarios.length; i += concurrency) {
      const batch = scenarios.slice(i, i + concurrency);
      const promises = batch.map(async (scenario) => {
        const itemStart = Date.now();
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          await page.setContent(scenario.htmlFixture, { waitUntil: 'domcontentloaded' });
          const obs = await this.observationEngine.observe(page);
          return {
            scenarioNumber: scenario.scenarioNumber,
            success: true,
            elements: obs.elements.length,
            latencyMs: Date.now() - itemStart
          };
        } catch (err) {
          return {
            scenarioNumber: scenario.scenarioNumber,
            success: false,
            error: err.message,
            latencyMs: Date.now() - itemStart
          };
        } finally {
          await context.close().catch(() => {});
        }
      });

      const batchResults = await Promise.all(promises);
      taskResults.push(...batchResults);
    }

    const totalDurationMs = Date.now() - startTime;
    const memAfter = process.memoryUsage().heapUsed;
    const heapDeltaMb = Math.round((memAfter - memBefore) / (1024 * 1024) * 100) / 100;

    return {
      totalScenariosExecuted: taskResults.length,
      successfulCount: taskResults.filter(r => r.success).length,
      totalDurationMs,
      averageLatencyMs: Math.round(totalDurationMs / taskResults.length),
      heapDeltaMb,
      results: taskResults
    };
  }
}

export default QaRunner;
