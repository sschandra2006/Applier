from core.context_builder import context_builder
from core.ai_logger import ai_logger
from core.cost_manager import cost_manager
from core.confidence_scorer import confidence_scorer

from agents.conversation_agent import ConversationAgent
from agents.website_intelligence_agent import WebsiteIntelligenceAgent
from agents.workflow_planner import WorkflowPlanner
from agents.validation_agent import ValidationAgent
from agents.document_intelligence_agent import DocumentIntelligenceAgent
from agents.execution_planner import ExecutionPlanner
from agents.recovery_agent import RecoveryAgent
from agents.explanation_agent import ExplanationAgent
from agents.recommendation_agent import RecommendationAgent
from agents.knowledge_agent import KnowledgeAgent

import time

class AIOrchestrator:
    def __init__(self):
        self.agents = {
            "continue_interview": ConversationAgent(),
            "scan_portal": WebsiteIntelligenceAgent(),
            "plan_workflow": WorkflowPlanner(),
            "validate_field": ValidationAgent(),
            "process_document": DocumentIntelligenceAgent(),
            "plan_execution": ExecutionPlanner(),
            "recover_error": RecoveryAgent(),
            "explain_error": ExplanationAgent(),
            "recommend_actions": RecommendationAgent(),
            "retrieve_knowledge": KnowledgeAgent()
        }

    def execute(self, payload: dict) -> dict:
        intent = payload.get("intent")
        if not intent or intent not in self.agents:
            return {"success": False, "error": f"Unknown or missing intent: {intent}"}
        
        start_time = time.time()
        agent = self.agents[intent]
        
        # 1. Build standardized context (stateless, from Node payload)
        context = context_builder.build_context(payload)
        
        # 2. Execute specific agent
        try:
            response = agent.process(context)
            success = True
        except Exception as e:
            import traceback
            tb_str = traceback.format_exc()
            ai_logger.logger.error(f"Agent execution failed: {tb_str}")
            response = {
                "error": str(e),
                "traceback": tb_str,
                "agent": agent.__class__.__name__
            }
            success = False
            
        # 3. Score confidence
        confidence = confidence_scorer.score(response)
        
        # 4. Log decision
        ai_logger.log_decision(
            agent_name=agent.__class__.__name__,
            intent=intent,
            context_summary={"keys": list(context.keys())},
            decision=response,
            confidence=confidence
        )
        
        # 5. Log cost/latency (placeholder for actual token tracking)
        latency_ms = int((time.time() - start_time) * 1000)
        cost_manager.log_cost(intent, 0, 0, latency_ms)
        
        # 6. Return standard structured response
        return {
            "success": success,
            "intent": intent,
            "confidence": confidence,
            "data": response
        }

orchestrator = AIOrchestrator()
