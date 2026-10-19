/**
 * Universal Browser QA Laboratory — Fixtures Registry
 * Aggregates all 27 synthetic website scenarios.
 */

import { scenario01 } from './scenario-01-simple-form.js';
import { scenario02 } from './scenario-02-react-form.js';
import { scenario03 } from './scenario-03-vue-dynamic-form.js';
import { scenario04 } from './scenario-04-multipage-wizard.js';
import { scenario05 } from './scenario-05-conditional-fields.js';
import { scenario06 } from './scenario-06-dynamic-dropdown.js';
import { scenario07 } from './scenario-07-autocomplete.js';
import { scenario08 } from './scenario-08-custom-select.js';
import { scenario09 } from './scenario-09-iframe.js';
import { scenario10 } from './scenario-10-nested-iframe.js';
import { scenario11 } from './scenario-11-shadow-dom.js';
import { scenario12 } from './scenario-12-file-upload.js';
import { scenario13 } from './scenario-13-multiple-file-upload.js';
import { scenario14 } from './scenario-14-validation-errors.js';
import { scenario15 } from './scenario-15-slow-page.js';
import { scenario16 } from './scenario-16-popup.js';
import { scenario17 } from './scenario-17-new-tab.js';
import { scenario18 } from './scenario-18-redirect.js';
import { scenario19 } from './scenario-19-session-expiration.js';
import { scenario20 } from './scenario-20-otp-checkpoint.js';
import { scenario21 } from './scenario-21-captcha-checkpoint.js';
import { scenario22 } from './scenario-22-changed-selectors.js';
import { scenario23 } from './scenario-23-missing-labels.js';
import { scenario24 } from './scenario-24-ambiguous-fields.js';
import { scenario25 } from './scenario-25-conflicting-documents.js';
import { scenario26 } from './scenario-26-submission-success.js';
import { scenario27 } from './scenario-27-ambiguous-submission.js';

export const QA_SCENARIOS = [
  scenario01,
  scenario02,
  scenario03,
  scenario04,
  scenario05,
  scenario06,
  scenario07,
  scenario08,
  scenario09,
  scenario10,
  scenario11,
  scenario12,
  scenario13,
  scenario14,
  scenario15,
  scenario16,
  scenario17,
  scenario18,
  scenario19,
  scenario20,
  scenario21,
  scenario22,
  scenario23,
  scenario24,
  scenario25,
  scenario26,
  scenario27
];

export const SCENARIOS_BY_ID = new Map(
  QA_SCENARIOS.map(s => [s.scenarioId, s])
);

export const SCENARIOS_BY_NUMBER = new Map(
  QA_SCENARIOS.map(s => [s.scenarioNumber, s])
);

export function getScenarioById(id) {
  return SCENARIOS_BY_ID.get(id) || null;
}

export function getScenarioByNumber(num) {
  return SCENARIOS_BY_NUMBER.get(num) || null;
}

export {
  scenario01,
  scenario02,
  scenario03,
  scenario04,
  scenario05,
  scenario06,
  scenario07,
  scenario08,
  scenario09,
  scenario10,
  scenario11,
  scenario12,
  scenario13,
  scenario14,
  scenario15,
  scenario16,
  scenario17,
  scenario18,
  scenario19,
  scenario20,
  scenario21,
  scenario22,
  scenario23,
  scenario24,
  scenario25,
  scenario26,
  scenario27
};
