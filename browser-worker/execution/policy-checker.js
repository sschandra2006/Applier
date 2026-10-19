/**
 * Pre-Execution Policy Checker
 * Applier 2.0 — Phase 10: Observe → Plan → Act → Verify Execution Engine
 *
 * Runs before any action is executed by Playwright.
 * Evaluates:
 * 1. Safe protocol & target validation
 * 2. Human intervention detection (CAPTCHA/OTP/Payment gating)
 * 3. Input value completeness
 * 4. Safety limits and retry thresholds
 */

export class PolicyChecker {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.allowedProtocols = options.allowedProtocols ?? ['http:', 'https:', 'data:'];
  }

  /**
   * Pre-execution policy check.
   * @param {object} params
   * @returns {object} { allowed: boolean, policyName?: string, reason?: string, requiresPause?: boolean, pauseReason?: string }
   */
  check({ step, currentUrl, retryCount = 0 }) {
    if (!step) {
      return { allowed: false, policyName: 'STEP_EXISTENCE', reason: 'No execution step provided.' };
    }

    // 1. Retry Threshold Policy
    if (retryCount >= this.maxRetries) {
      return {
        allowed: false,
        policyName: 'MAX_RETRIES_EXCEEDED',
        reason: `Step has failed ${retryCount} times, exceeding maximum limit (${this.maxRetries}).`
      };
    }

    // 2. Safe URL Protocol Policy (for navigate)
    if (step.type === 'navigate' && step.url) {
      const urlStr = String(step.url).trim().toLowerCase();
      if (urlStr.startsWith('javascript:') || urlStr.startsWith('vbscript:')) {
        return {
          allowed: false,
          policyName: 'UNSAFE_PROTOCOL_POLICY',
          reason: `Navigation to unsafe protocol "${urlStr.slice(0, 15)}" is strictly prohibited.`
        };
      }
    }

    // 3. Human Intervention Gating Policy
    const targetName = String(step.field || step.selector || step.semanticTarget || '').toLowerCase();
    const isCaptcha = targetName.includes('captcha') || step.pauseReason === 'CAPTCHA';
    const isOtp = targetName.includes('otp') || targetName.includes('one_time_password') || step.pauseReason === 'OTP';
    const isPayment = targetName.includes('payment') || targetName.includes('cvv') || targetName.includes('card_number');

    if (step.type !== 'pause' && (isCaptcha || isOtp || isPayment)) {
      const isExplicitlyUserProvided = step.userProvided === true || step.isResumeStep === true;

      if (!isExplicitlyUserProvided) {
        const reason = isCaptcha ? 'CAPTCHA' : isOtp ? 'OTP' : 'PAYMENT';
        return {
          allowed: false,
          requiresPause: true,
          pauseReason: reason,
          policyName: 'HUMAN_INTERVENTION_POLICY',
          reason: `Target "${targetName}" requires human intervention (${reason}). Automated action blocked.`
        };
      }
    }

    // 4. Value Completeness Policy (for fill/select)
    if ((step.type === 'fill' || step.type === 'select') && !step.isOptional) {
      const val = step.value;
      if (val === undefined || val === null) {
        return {
          allowed: false,
          policyName: 'MISSING_REQUIRED_VALUE_POLICY',
          reason: `Step for field "${step.field || step.selector}" requires a non-null value.`
        };
      }
    }

    return { allowed: true, policyName: 'ALL_POLICIES_PASSED', reason: 'Action approved for execution.' };
  }
}

export const defaultPolicyChecker = new PolicyChecker();
