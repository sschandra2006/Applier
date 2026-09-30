from core.llm_service import llm_service
import json

from pydantic import BaseModel, Field
from typing import List, Optional
from core.models import WorkflowSchema, WorkflowPage, WorkflowStep

async def generate_workflow(form_data: dict) -> dict:
    # Check total inputs for chunking
    forms = form_data.get("forms", [])
    total_inputs = sum(len(f.get("inputs", [])) for f in forms)
    
    system_instruction = "You are a strict data parser. Be concise. Extract valid logical steps and fields based ONLY on the provided HTML form data. Never invent fields or repeat titles unnecessarily."
    
    if total_inputs <= 50:
        prompt = f"""
        Analyze the following form data extracted from a website and generate a structured application workflow.
        Structure your JSON according to the canonical schema (pages containing steps).
        Form Data:
        {json.dumps(form_data, indent=2)}
        """
        schema_obj = llm_service.generate_safe_json(
            prompt=prompt,
            schema_model=WorkflowSchema,
            system_instruction=system_instruction
        )
        return schema_obj.model_dump()
        
    else:
        # Chunking Logic to prevent repetitive loops and token limits on massive forms
        print(f"[Workflow Generator] Massive form detected ({total_inputs} inputs). Engaging Prompt Chunking.")
        all_pages = []
        workflow_name = form_data.get("title", "Generated Application Workflow")
        
        chunk_inputs = []
        for f in forms:
            for inp in f.get("inputs", []):
                chunk_inputs.append(inp)
                if len(chunk_inputs) >= 50:
                    chunk_form = {"forms": [{"inputs": chunk_inputs}]}
                    prompt = f"Analyze this CHUNK of form data and extract logical application pages and steps.\nForm Data: {json.dumps(chunk_form, indent=2)}"
                    chunk_schema = llm_service.generate_safe_json(prompt, WorkflowSchema, system_instruction=system_instruction)
                    all_pages.extend(chunk_schema.pages)
                    chunk_inputs = []
                    
        if chunk_inputs:
            chunk_form = {"forms": [{"inputs": chunk_inputs}]}
            prompt = f"Analyze this CHUNK of form data and extract logical application pages and steps.\nForm Data: {json.dumps(chunk_form, indent=2)}"
            chunk_schema = llm_service.generate_safe_json(prompt, WorkflowSchema, system_instruction=system_instruction)
            all_pages.extend(chunk_schema.pages)
            
        merged_schema = WorkflowSchema(name=workflow_name, pages=all_pages, schemaVersion="2.0")
        return merged_schema.model_dump()
