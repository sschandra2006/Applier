import logging
from core.llm_service import llm_service
from services.vector_db import vector_store

logger = logging.getLogger("KnowledgeAgent")

class KnowledgeAgent:
    """
    RAG Knowledge Agent — queries ChromaDB vector store for portal rules, 
    frequently asked questions, and document requirements.
    """

    def process(self, context: dict) -> dict:
        query_text = context.get("raw_data", {}).get("query") or context.get("raw_data", {}).get("portal_type", "generic")
        collection_name = context.get("raw_data", {}).get("collection", "portal_knowledge")

        try:
            # Generate embedding for the query
            query_embedding = llm_service.embed_content(query_text, task_type="retrieval_query")
            
            # Query ChromaDB
            results = vector_store.query(
                collection_name=collection_name,
                query_embeddings=[query_embedding],
                n_results=3
            )

            documents = results.get("documents", [[]])[0]
            metadatas = results.get("metadatas", [[]])[0]

            knowledge_items = []
            for doc, meta in zip(documents, metadatas):
                knowledge_items.append({"content": doc, "metadata": meta})

            return {
                "action": "knowledge_retrieved",
                "query": query_text,
                "knowledge": knowledge_items,
                "confidence": 0.9 if knowledge_items else 0.5
            }

        except Exception as e:
            logger.warning(f"[KnowledgeAgent] Retrieval failed or collection empty: {e}")
            return {
                "action": "knowledge_retrieved",
                "query": query_text,
                "knowledge": [],
                "confidence": 0.0,
                "note": "No knowledge base entry found or vector store empty."
            }
