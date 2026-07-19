from abc import ABC, abstractmethod
import chromadb
from typing import List, Dict, Any

class VectorStoreInterface(ABC):
    @abstractmethod
    def add_documents(self, collection_name: str, embeddings: List[List[float]], documents: List[str], metadatas: List[Dict[str, Any]], ids: List[str]):
        pass
        
    @abstractmethod
    def query(self, collection_name: str, query_embeddings: List[List[float]], n_results: int = 5):
        pass

class ChromaDBStore(VectorStoreInterface):
    def __init__(self, persist_directory: str = "./chroma_db"):
        self.client = chromadb.PersistentClient(path=persist_directory)
        
    def _get_or_create_collection(self, name: str):
        return self.client.get_or_create_collection(name=name)

    def add_documents(self, collection_name: str, embeddings: List[List[float]], documents: List[str], metadatas: List[Dict[str, Any]], ids: List[str]):
        collection = self._get_or_create_collection(collection_name)
        collection.add(
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )

    def query(self, collection_name: str, query_embeddings: List[List[float]], n_results: int = 5):
        collection = self._get_or_create_collection(collection_name)
        results = collection.query(
            query_embeddings=query_embeddings,
            n_results=n_results
        )
        return results

# Singleton instance
vector_store = ChromaDBStore()
