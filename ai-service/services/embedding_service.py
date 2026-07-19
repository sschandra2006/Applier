from core.llm_service import llm_service

def get_embedding(text: str) -> list[float]:
    return llm_service.embed_content(text=text, task_type="retrieval_document")
    
def get_query_embedding(text: str) -> list[float]:
    return llm_service.embed_content(text=text, task_type="retrieval_query")
