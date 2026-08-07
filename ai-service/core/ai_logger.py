import logging
import json
from datetime import datetime, UTC

class AILogger:
    def __init__(self):
        self.logger = logging.getLogger("AILogger")
        self.logger.setLevel(logging.INFO)

    def log_decision(self, agent_name: str, intent: str, context_summary: dict, decision: dict, confidence: float):
        log_entry = {
            "timestamp": datetime.now(UTC).isoformat(),
            "agent": agent_name,
            "intent": intent,
            "context_summary": context_summary,
            "decision": decision,
            "confidence": confidence
        }
        self.logger.info(f"[AI_DECISION] {json.dumps(log_entry)}")
        
ai_logger = AILogger()
