from pydantic import BaseModel, Field, AliasChoices
from typing import List, Optional, Any, Dict

class WorkflowStep(BaseModel):
    id: Optional[str] = None
    type: Optional[str] = None
    label: Optional[str] = Field(default=None, validation_alias=AliasChoices('label', 'title', 'name', 'text'))
    selector: Optional[str] = None
    required: bool = False
    validation: Dict[str, Any] = Field(default_factory=dict)
    options: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    extensions: Dict[str, Any] = Field(default_factory=dict)

class WorkflowPage(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    url: Optional[str] = None
    steps: List[WorkflowStep] = Field(default_factory=list)

class WorkflowSchema(BaseModel):
    name: str = Field(validation_alias=AliasChoices('name', 'title'))
    website: Optional[str] = None
    url: Optional[str] = None
    schemaVersion: str = "2.0"
    pages: List[WorkflowPage] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    extensions: Dict[str, Any] = Field(default_factory=dict)
