from pydantic import BaseModel, Field, AliasChoices
from typing import List, Optional, Any, Dict, Literal

# ─────────────────────────────────────────────
# Workflow Schema (used by WorkflowPlanner)
# ─────────────────────────────────────────────

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


# ─────────────────────────────────────────────
# Execution Plan (used by ExecutionPlanner)
# ─────────────────────────────────────────────

class ExecutionStep(BaseModel):
    """A single Playwright automation step."""
    type: Literal["navigate", "fill", "click", "select", "upload", "pause", "wait", "screenshot"] = "fill"
    selector: Optional[str] = Field(default=None, description="CSS selector or XPath to target the element")
    field: Optional[str] = Field(default=None, description="The workflow field ID this step maps to")
    value: Optional[str] = Field(default=None, description="Static value if not driven by user answers")
    url: Optional[str] = Field(default=None, description="URL for navigate steps")
    description: Optional[str] = Field(default=None, description="Human-readable description of this step")
    waitAfterMs: int = Field(default=500, description="Milliseconds to wait after executing this step")
    constraints: Dict[str, Any] = Field(default_factory=dict, description="Document constraints for upload steps")
    pauseReason: Optional[Literal["OTP", "CAPTCHA", "MANUAL_REVIEW"]] = Field(
        default=None, description="Reason for pause steps"
    )

class ExecutionPlan(BaseModel):
    """Full Playwright execution plan returned by ExecutionPlanner."""
    targetUrl: str
    totalSteps: int
    steps: List[ExecutionStep] = Field(default_factory=list)
    confidence: float = Field(default=0.85)
    notes: Optional[str] = Field(default=None, description="Any notes about this plan")


# ─────────────────────────────────────────────
# Document Intelligence (used by DocumentIntelligenceAgent)
# ─────────────────────────────────────────────

class DocumentExtraction(BaseModel):
    """Structured data extracted from a document via OCR/Vision."""
    documentType: Optional[str] = Field(default=None, description="e.g. Passport, Aadhaar, PAN, Birth Certificate")
    extractedFields: Dict[str, Any] = Field(
        default_factory=dict,
        description="Key-value pairs extracted: name, dob, id_number, address, etc."
    )
    confidence: float = Field(default=0.0)
    isValid: bool = Field(default=False, description="Whether the document appears genuine and readable")
    warnings: List[str] = Field(default_factory=list, description="Any quality or validity warnings")


# ─────────────────────────────────────────────
# Recovery Insight (used by RecoveryAgent)
# ─────────────────────────────────────────────

class RecoveryInsight(BaseModel):
    """AI-generated insight on a Playwright automation failure."""
    targetUrl: str = Field(description="The URL where failure occurred")
    rootCause: str = Field(description="Technical root cause description")
    suggestedFix: str = Field(description="Concrete recommendation to fix the workflow")
    confidence: float = Field(description="Confidence in the analysis 0.0-1.0")
    updatedSelector: Optional[str] = Field(
        default=None,
        description="If a CSS selector failed, an alternative robust selector"
    )
    isRetryable: bool = Field(default=True, description="Whether the job can safely be retried")


# ─────────────────────────────────────────────
# Explanation (used by ExplanationAgent)
# ─────────────────────────────────────────────

class UserExplanation(BaseModel):
    """User-friendly explanation of a technical error."""
    title: str = Field(description="Short title of the issue")
    message: str = Field(description="Plain English explanation for the user")
    actionRequired: Optional[str] = Field(default=None, description="What the user should do next, if anything")
    confidence: float = Field(default=0.9)


# ─────────────────────────────────────────────
# Recommendation (used by RecommendationAgent)
# ─────────────────────────────────────────────

class Recommendation(BaseModel):
    title: str
    description: str
    priority: Literal["HIGH", "MEDIUM", "LOW"] = "MEDIUM"
    actionType: Optional[str] = None

class RecommendationList(BaseModel):
    recommendations: List[Recommendation] = Field(default_factory=list)
    summary: Optional[str] = None
    confidence: float = Field(default=0.85)
