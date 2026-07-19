from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from services.vector_db import vector_store
from services.embedding_service import get_embedding, get_query_embedding
import fitz  # PyMuPDF
import uuid

router = APIRouter()

@router.post("/ingest")
async def ingest_document(collection_name: str = Form(...), file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for now.")
        
    try:
        content = await file.read()
        doc = fitz.open(stream=content, filetype="pdf")
        
        text_chunks = []
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text = page.get_text()
            if text.strip():
                text_chunks.append({
                    "text": text,
                    "metadata": {"page": page_num + 1, "filename": file.filename}
                })
                
        if not text_chunks:
            raise HTTPException(status_code=400, detail="Could not extract text from PDF.")
            
        documents = []
        embeddings = []
        metadatas = []
        ids = []
        
        for chunk in text_chunks:
            documents.append(chunk["text"])
            metadatas.append(chunk["metadata"])
            ids.append(str(uuid.uuid4()))
            embeddings.append(get_embedding(chunk["text"]))
            
        vector_store.add_documents(
            collection_name=collection_name,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        
        return {"status": "success", "message": f"Ingested {len(documents)} chunks from {file.filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/query")
async def query_knowledge_base(collection_name: str, q: str, top_k: int = 3):
    try:
        query_emb = get_query_embedding(q)
        results = vector_store.query(
            collection_name=collection_name,
            query_embeddings=[query_emb],
            n_results=top_k
        )
        
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
