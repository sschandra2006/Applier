class ConfidenceScorer:
    def score(self, response: dict) -> float:
        return response.get("confidence", 1.0)
        
confidence_scorer = ConfidenceScorer()
