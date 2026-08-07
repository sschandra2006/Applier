import logging
from services.failure_analyzer import FailureAnalyzer
from core.models import RecoveryInsight

logger = logging.getLogger("RecoveryAgent")

_failure_analyzer = FailureAnalyzer()


class RecoveryAgent:
    """
    Analyzes Playwright automation failures using the FailureAnalyzer service.
    Returns structured recovery insights: root cause, suggested fix, updated selector.
    Called automatically when executePlan() fails in automation.service.js.
    """

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})
        logs: list = raw_data.get("logs", [])
        target_url: str = raw_data.get("targetUrl", raw_data.get("url", "unknown"))
        error_message: str = raw_data.get("message", "")

        if not logs and not error_message:
            logger.warning("[RecoveryAgent] No logs or error message provided for analysis.")
            return {
                "action": "recovered_technical",
                "rootCause": "No logs provided for analysis.",
                "suggestedFix": "Ensure automation logs are captured and sent with recovery requests.",
                "updatedSelector": None,
                "isRetryable": False,
                "confidence": 0.0,
            }

        # Combine error message with logs for richer context
        analysis_logs = []
        if error_message:
            analysis_logs.append(f"[ERROR] {error_message}")
        analysis_logs.extend(logs)

        try:
            insight = _failure_analyzer.analyze_failure(analysis_logs, target_url)
            logger.info(
                f"[RecoveryAgent] Analysis complete for {target_url}: "
                f"rootCause={insight.get('rootCause', '')[:80]}"
            )

            return {
                "action": "recovered_technical",
                "rootCause": insight.get("rootCause", "Unknown failure"),
                "suggestedFix": insight.get("suggestedFix", "Manual review required."),
                "updatedSelector": insight.get("updatedSelector"),
                "isRetryable": self._assess_retryability(insight.get("rootCause", "")),
                "confidence": insight.get("confidence", 0.0),
            }

        except Exception as e:
            logger.error(f"[RecoveryAgent] Analysis failed: {e}", exc_info=True)
            return {
                "action": "recovered_technical",
                "rootCause": f"Recovery analysis engine error: {str(e)}",
                "suggestedFix": "Manual investigation required.",
                "updatedSelector": None,
                "isRetryable": False,
                "confidence": 0.0,
            }

    def _assess_retryability(self, root_cause: str) -> bool:
        """Heuristic: some failures are safe to retry, others are not."""
        non_retryable_signals = [
            "captcha", "otp", "manual review", "login required",
            "payment", "account blocked", "not eligible",
        ]
        cause_lower = root_cause.lower()
        return not any(signal in cause_lower for signal in non_retryable_signals)
