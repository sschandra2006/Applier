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
    captchaSelector: Optional[str] = Field(
        default=None, description="CSS selector of the CAPTCHA image element to screenshot (for CAPTCHA pause steps)"
    )

class ExecutionPlan(BaseModel):
    """Full Playwright execution plan returned by ExecutionPlanner."""
    targetUrl: str = Field(default="", validation_alias=AliasChoices('targetUrl', 'target_url', 'url'))
    totalSteps: int = Field(default=0, validation_alias=AliasChoices('totalSteps', 'total_steps', 'count'))
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


# ─────────────────────────────────────────────
# Semantic Page Model (Phase 5: Semantic Page Understanding)
# ─────────────────────────────────────────────

PageType = Literal[
    "LANDING",
    "LOGIN",
    "REGISTRATION",
    "APPLICATION_FORM",
    "DOCUMENT_UPLOAD",
    "REVIEW",
    "PAYMENT",
    "OTP",
    "CAPTCHA",
    "SUCCESS",
    "ERROR",
    "UNKNOWN"
]

class SemanticField(BaseModel):
    elementId: str
    semanticType: str = "UNKNOWN_FIELD"
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    reason: str = ""
    isResolved: bool = False

class SemanticPageModel(BaseModel):
    schemaVersion: str = "2.0.0"
    modelId: str
    observationId: str
    url: str
    pageType: PageType = "UNKNOWN"
    pageTypeConfidence: float = Field(ge=0.0, le=1.0, default=0.5)
    pageTypeReason: str = ""
    fields: List[SemanticField] = Field(default_factory=list)
    summary: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


KnowledgeSourceType = Literal[
    "PROFILE",
    "DOCUMENT",
    "USER_INPUT",
    "PREVIOUS_APPLICATION",
    "SYSTEM_DERIVED"
]

KnowledgeVerificationStatus = Literal[
    "VERIFIED",
    "UNVERIFIED",
    "CONFIRMATION_REQUIRED",
    "CONFLICT"
]

class KnowledgeNode(BaseModel):
    value: Any
    source: KnowledgeSourceType = "PROFILE"
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)
    verificationStatus: KnowledgeVerificationStatus = "UNVERIFIED"
    updatedAt: str
    evidence: Optional[str] = None
    history: List[Dict[str, Any]] = Field(default_factory=list)

class ConflictItemValue(BaseModel):
    value: Any
    source: KnowledgeSourceType
    evidence: Optional[str] = None
    confidence: Optional[float] = None

class FieldConflict(BaseModel):
    conflictId: str
    path: str
    existingValue: ConflictItemValue
    conflictingValue: ConflictItemValue
    status: Literal["UNRESOLVED", "RESOLVED"] = "UNRESOLVED"
    reason: str = "FIELD_CONFLICT"
    detectedAt: str
    resolvedAt: Optional[str] = None
    resolution: Optional[Dict[str, Any]] = None

class ApplicantKnowledgeGraph(BaseModel):
    schemaVersion: str = "2.0.0"
    applicantId: str
    userId: str
    identity: Dict[str, KnowledgeNode] = Field(default_factory=dict)
    contact: Dict[str, KnowledgeNode] = Field(default_factory=dict)
    address: Dict[str, KnowledgeNode] = Field(default_factory=dict)
    education: Dict[str, KnowledgeNode] = Field(default_factory=dict)
    family: Dict[str, KnowledgeNode] = Field(default_factory=dict)
    financial: Dict[str, KnowledgeNode] = Field(default_factory=dict)
    preferences: Dict[str, KnowledgeNode] = Field(default_factory=dict)
    documents: Dict[str, KnowledgeNode] = Field(default_factory=dict)
    conflicts: List[FieldConflict] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ─────────────────────────────────────────────
# Document Evidence (Phase 7: Document Evidence & Extraction)
# ─────────────────────────────────────────────

class DocumentQualityModel(BaseModel):
    isBlurry: bool = False
    isCropped: bool = False
    isUnreadable: bool = False
    missingPages: bool = False
    qualityScore: float = Field(ge=0.0, le=1.0, default=1.0)
    warnings: List[str] = Field(default_factory=list)

class DocumentEvidenceModel(BaseModel):
    schemaVersion: str = "2.0.0"
    evidenceId: str
    documentId: str
    fieldKey: str
    page: int = Field(ge=1, default=1)
    region: Optional[Dict[str, Any]] = None
    extractionMethod: Literal["OCR", "VISION_LLM", "HYBRID", "PATTERN", "MANUAL"] = "OCR"
    rawValue: Optional[Any] = None
    normalizedValue: Optional[Any] = None
    extractedValue: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.85)
    timestamp: str
    quality: Optional[DocumentQualityModel] = None


# ─────────────────────────────────────────────
# Semantic Field Mapping (Phase 8: Semantic Field Mapping Engine)
# ─────────────────────────────────────────────

class AlternativeMatchModel(BaseModel):
    applicantField: str
    confidence: float = Field(ge=0.0, le=1.0)
    reason: Optional[str] = None

class ConflictDetailModel(BaseModel):
    existingValue: Optional[Any] = None
    conflictingValue: Optional[Any] = None
    reason: Optional[str] = "FIELD_CONFLICT"

class FieldMappingModel(BaseModel):
    websiteFieldId: str
    applicantField: str
    candidateValue: Optional[Any] = None
    source: Literal["PROFILE", "DOCUMENT", "USER_INPUT", "PREVIOUS_APPLICATION", "SYSTEM_DERIVED", "NONE"] = "NONE"
    confidence: float = Field(ge=0.0, le=1.0)
    status: Literal["MATCHED", "AMBIGUOUS", "MISSING", "CONFLICT", "REQUIRES_USER"]
    isFillable: bool = False
    evidence: Optional[str] = None
    documentId: Optional[str] = None
    signalsUsed: List[str] = Field(default_factory=list)
    matchReason: Optional[str] = None
    alternativeMatches: List[AlternativeMatchModel] = Field(default_factory=list)
    conflictDetails: Optional[ConflictDetailModel] = None

class SemanticFieldMappingSetModel(BaseModel):
    schemaVersion: str = "2.0.0"
    mappingId: Optional[str] = None
    pageUrl: Optional[str] = None
    pageType: Optional[str] = None
    mappings: List[FieldMappingModel] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)
    timestamp: Optional[str] = None


# ─────────────────────────────────────────────
# Runtime Semantic Locator (Phase 9: Runtime Semantic Locator Resolution)
# ─────────────────────────────────────────────

LocatorStrategyType = Literal[
    "ACCESSIBLE_ROLE_NAME",
    "LABEL",
    "SEMANTIC_RELATIONSHIP",
    "PLACEHOLDER",
    "NAME",
    "STABLE_TEST_ID",
    "STABLE_DOM_ATTRIBUTES",
    "CSS",
    "XPATH",
    "LOCATOR_NOT_FOUND"
]

class LocatorMetadataModel(BaseModel):
    tagName: Optional[str] = None
    role: Optional[str] = None
    inputType: Optional[str] = None
    isEditable: bool = True
    boundingBox: Optional[Dict[str, Any]] = None

class RuntimeLocatorModel(BaseModel):
    schemaVersion: str = "2.0.0"
    resolutionId: Optional[str] = None
    semanticTarget: str
    found: bool = False
    strategy: LocatorStrategyType = "LOCATOR_NOT_FOUND"
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    evidence: str
    selector: Optional[str] = None
    framePath: Optional[str] = None
    metadata: Optional[LocatorMetadataModel] = None
    error: Optional[str] = None
    timestamp: Optional[str] = None


class ActionVerificationModel(BaseModel):
    schemaVersion: str = "2.0.0"
    verificationId: str
    stepIndex: int = 0
    actionType: str
    status: Literal["PASSED", "FAILED", "SKIPPED", "RECOVERED"] = "PASSED"
    target: Optional[Any] = None
    expected: Optional[Any] = None
    actual: Optional[Any] = None
    evidence: str
    error: Optional[str] = None
    recoveryAttempted: bool = False
    recoveryOutcome: Optional[str] = None
    timestamp: Optional[str] = None


class SubmissionConfirmationModel(BaseModel):
    schemaVersion: str = "2.0.0"
    confirmationId: str
    applicationId: str
    workflowVersion: str = "2.0.0"
    userId: str
    fieldStateHash: str
    token: str
    signature: Optional[str] = None
    isValid: bool = True
    invalidatedReason: Optional[str] = None
    expiresAt: Optional[str] = None
    timestamp: Optional[str] = None


class ActionPolicyModel(BaseModel):
    schemaVersion: str = "2.0.0"
    evaluationId: str
    actionType: str
    riskCategory: Literal["LOW_RISK", "NORMAL", "SENSITIVE", "CRITICAL"] = "NORMAL"
    decision: Literal["ALLOWED", "BLOCKED", "REQUIRES_CONFIRMATION", "REQUIRES_USER"] = "ALLOWED"
    target: Optional[Any] = None
    allowed: bool = True
    violationCode: Optional[str] = None
    reason: str
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)
    fieldStateHash: Optional[str] = None
    confirmationToken: Optional[str] = None
    timestamp: Optional[str] = None


class ReviewFieldConflictItemModel(BaseModel):
    value: Any = None
    source: str
    evidence: Optional[str] = None
    confidence: Optional[float] = None


class ReviewFieldConflictModel(BaseModel):
    conflictId: Optional[str] = None
    existingValue: ReviewFieldConflictItemModel
    conflictingValue: ReviewFieldConflictItemModel
    status: Literal["UNRESOLVED", "RESOLVED"] = "UNRESOLVED"
    resolvedValue: Optional[Any] = None


class ApplicationReviewFieldModel(BaseModel):
    fieldKey: str
    label: str
    value: Optional[Any] = None
    source: Literal["PROFILE", "DOCUMENT", "USER_INPUT", "PREVIOUS_APPLICATION", "SYSTEM_DERIVED", "NONE"] = "NONE"
    sourceDetails: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)
    validation: str = "Verified"
    status: Literal["VERIFIED", "UNVERIFIED", "CONFIRMATION_REQUIRED", "MISSING", "CONFLICT", "OPTIONAL_EMPTY"] = "VERIFIED"
    isRequired: bool = True
    isOptional: bool = False
    isMissing: bool = False
    needsConfirmation: bool = False
    conflict: Optional[ReviewFieldConflictModel] = None


class ApplicationReviewSummaryModel(BaseModel):
    totalFields: int
    verifiedFields: int
    missingRequired: int
    missingOptional: int = 0
    conflictsCount: int = 0
    needsConfirmationCount: int = 0
    canConfirm: bool = True


class ApplicationReviewConfirmationModel(BaseModel):
    confirmationId: Optional[str] = None
    token: Optional[str] = None
    fieldStateHash: Optional[str] = None
    confirmedAt: Optional[str] = None
    confirmedBy: Optional[str] = None
    isLocked: Optional[bool] = False
    status: Optional[Literal["ISSUED", "INVALIDATED", "USED"]] = "ISSUED"


class ApplicationReviewModel(BaseModel):
    schemaVersion: str = "2.0.0"
    reviewId: str
    applicationId: str
    workflowId: Optional[str] = None
    userId: str
    status: Literal[
        "PENDING_REVIEW",
        "READY_FOR_CONFIRMATION",
        "CONFIRMED",
        "LOCKED",
        "MUTATED_INVALIDATED",
        "HAS_CONFLICTS",
        "INCOMPLETE",
    ] = "READY_FOR_CONFIRMATION"
    fields: List[ApplicationReviewFieldModel] = Field(default_factory=list)
    summary: ApplicationReviewSummaryModel
    confirmation: Optional[ApplicationReviewConfirmationModel] = None
    timestamp: Optional[str] = None


# ─────────────────────────────────────────────
# Structured Resume Extraction & Profile Models
# ─────────────────────────────────────────────

class ResumePersonalLocation(BaseModel):
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postalCode: Optional[str] = None

class ResumeLink(BaseModel):
    label: Optional[str] = "Link"
    url: str

class ResumeHighlight(BaseModel):
    text: str
    skillsReferenced: List[str] = Field(default_factory=list)

class ResumeExperienceItem(BaseModel):
    id: Optional[str] = None
    company: str
    title: str
    location: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = "Present"
    isCurrent: bool = False
    highlights: List[ResumeHighlight] = Field(default_factory=list)

class ResumeEducationItem(BaseModel):
    id: Optional[str] = None
    institution: str
    degree: str
    fieldOfStudy: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    gpa: Optional[str] = None
    honors: List[str] = Field(default_factory=list)

class ResumeSkillItem(BaseModel):
    category: str = "Technical"
    name: str
    yearsOfExperience: Optional[float] = None

class ResumeProjectItem(BaseModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)
    url: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    highlights: List[str] = Field(default_factory=list)

class ResumeCertificationItem(BaseModel):
    id: Optional[str] = None
    name: str
    issuingOrganization: Optional[str] = None
    issueDate: Optional[str] = None
    expirationDate: Optional[str] = None
    credentialId: Optional[str] = None
    credentialUrl: Optional[str] = None

class ResumeAchievementItem(BaseModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = None
    date: Optional[str] = None

class ExtractedResumeProfile(BaseModel):
    """Authoritative structured resume profile extracted by AI."""
    fullName: str = Field(description="Full name of applicant")
    email: Optional[str] = Field(default=None, description="Primary email address")
    phone: Optional[str] = Field(default=None, description="Phone number")
    location: Optional[ResumePersonalLocation] = None
    links: List[ResumeLink] = Field(default_factory=list)
    professionalSummary: Optional[str] = None
    skills: List[ResumeSkillItem] = Field(default_factory=list)
    experience: List[ResumeExperienceItem] = Field(default_factory=list)
    education: List[ResumeEducationItem] = Field(default_factory=list)
    projects: List[ResumeProjectItem] = Field(default_factory=list)
    certifications: List[ResumeCertificationItem] = Field(default_factory=list)
    achievements: List[ResumeAchievementItem] = Field(default_factory=list)
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    warnings: List[str] = Field(default_factory=list)


# ─────────────────────────────────────────────
# Job Requirement Analysis & Profile Matching Models
# ─────────────────────────────────────────────

class JobRequirementItem(BaseModel):
    """Classified requirement extracted from a job description."""
    id: str = Field(description="Unique requirement ID (e.g. req_1)")
    description: str = Field(description="Verbatim or summarized requirement statement")
    type: Literal[
        "TECHNICAL_SKILL",
        "SOFT_SKILL",
        "EDUCATION",
        "EXPERIENCE",
        "CERTIFICATION",
        "RESPONSIBILITY",
        "PROJECT",
        "SCREENING",
        "OTHER"
    ] = "TECHNICAL_SKILL"
    importance: Literal["MANDATORY", "PREFERRED", "UNCERTAIN"] = "MANDATORY"
    normalizedKey: Optional[str] = Field(default=None, description="Normalized skill or domain key")
    minYears: Optional[float] = Field(default=None, description="Minimum years of experience required")
    degreeLevel: Optional[Literal["ASSOCIATES", "BACHELORS", "MASTERS", "DOCTORATE", "NONE"]] = None
    ambiguityReason: Optional[str] = Field(default=None, description="Reason if marked UNCERTAIN or ambiguous")


class RequirementEvidenceMapping(BaseModel):
    """Maps a job requirement to verified profile evidence with uncertainty and status."""
    requirementId: str
    requirementText: str
    requirementType: str
    importance: Literal["MANDATORY", "PREFERRED", "UNCERTAIN"]
    status: Literal["SUPPORTED", "PARTIALLY_SUPPORTED", "NOT_FOUND", "NEEDS_CLARIFICATION", "NOT_APPLICABLE"]
    uncertainty: Literal["LOW", "MEDIUM", "HIGH"] = "LOW"
    needsClarification: bool = False
    matchingEvidence: List[str] = Field(default_factory=list, description="Verified facts or excerpts from profile")
    sourceItems: List[str] = Field(default_factory=list, description="Profile references (e.g. experience[0], skills[2])")
    explanation: str = Field(description="Explanation of the match decision or why evidence was not found")


class JobMatchBreakdown(BaseModel):
    mandatoryCoverage: float = Field(ge=0.0, le=100.0, description="Coverage % for mandatory requirements")
    preferredCoverage: float = Field(ge=0.0, le=100.0, description="Coverage % for preferred qualifications")
    totalRequirements: int
    supportedCount: int
    partiallySupportedCount: int
    needsClarificationCount: int
    notFoundCount: int


class SupportingProfileItems(BaseModel):
    """Relevant verified profile items selected to support tailored resume generation."""
    topRelevantSkills: List[str] = Field(default_factory=list)
    topRelevantExperienceIds: List[str] = Field(default_factory=list)
    topRelevantProjectIds: List[str] = Field(default_factory=list)
    topRelevantCertifications: List[str] = Field(default_factory=list)


class JobMatchReport(BaseModel):
    """Validated structured match report between target job description and verified profile."""
    jobTitle: str
    companyName: Optional[str] = None
    requirementCoverageEstimate: float = Field(
        ge=0.0,
        le=100.0,
        description="Applier's own internal requirement-coverage estimate. NOT an employer hiring probability."
    )
    breakdown: JobMatchBreakdown
    evidenceMappings: List[RequirementEvidenceMapping] = Field(default_factory=list)
    supportingProfileItems: SupportingProfileItems = Field(default_factory=SupportingProfileItems)
    disclaimer: str = (
        "This coverage estimate is solely Applier's internal heuristic comparison between extracted job requirements "
        "and verified user profile evidence. It does not represent an employer's hiring decision, ATS ranking, or hiring probability."
    )
    warnings: List[str] = Field(default_factory=list)


# ─────────────────────────────────────────────
# Missing-Information Engine Models
# ─────────────────────────────────────────────

class GapQuestionOption(BaseModel):
    id: str = Field(description="Option identifier (e.g. 'experienced', 'familiar', 'none')")
    label: str = Field(description="Display label presented to user")
    requiresDetails: bool = Field(default=False, description="Whether choosing this requires contextual details (e.g. project/years)")
    detailPrompt: Optional[str] = Field(default=None, description="Prompt placeholder for details")


class GapQuestionItem(BaseModel):
    """Specific, prioritized question generated to resolve an information gap."""
    id: str = Field(description="Unique question identifier")
    requirementId: str = Field(description="Associated job requirement ID")
    category: Literal["REQUIRED", "HIGH_VALUE", "OPTIONAL"] = Field(
        description="Prioritization tier: REQUIRED (mandatory blocker), HIGH_VALUE (resume booster), OPTIONAL (supplemental)"
    )
    targetEntity: Literal["PROFILE_SKILL", "PROFILE_PROJECT", "PROFILE_EXPERIENCE", "APPLICATION_ANSWER"] = Field(
        description="Destination of confirmed information: Permanent profile skill/project/exp, or application-specific answer"
    )
    targetKey: str = Field(description="Key or identifier to update (e.g. 'PyTorch', 'salary_expectation', 'proj_1')")
    questionText: str = Field(description="Natural, specific, grounded question text")
    contextExplanation: str = Field(description="Grounded explanation explaining why this gap matters for this job")
    options: List[GapQuestionOption] = Field(default_factory=list)
    status: Literal["PENDING", "ANSWERED", "SKIPPED", "DECLINED"] = "PENDING"
    userResponse: Optional[Dict[str, Any]] = None


class GapAnswerValidationResult(BaseModel):
    """Validation outcome for a user-submitted answer."""
    isValid: bool
    targetEntity: Literal["PROFILE_SKILL", "PROFILE_PROJECT", "PROFILE_EXPERIENCE", "APPLICATION_ANSWER", "DECLINED"]
    isDeclined: bool = False
    isFamiliarOnly: bool = False
    updateData: Dict[str, Any] = Field(default_factory=dict)
    feedback: Optional[str] = None


# ─────────────────────────────────────────────
# Production Resume Generation & Validation Models
# ─────────────────────────────────────────────

ResumeTemplateType = Literal["ATS_SINGLE_COLUMN", "TECHNICAL", "MODERN_PROFESSIONAL"]

class ProvenanceReference(BaseModel):
    sourceType: Literal[
        "PROFILE_PERSONAL",
        "PROFILE_SKILL",
        "PROFILE_EXPERIENCE",
        "PROFILE_EDUCATION",
        "PROFILE_PROJECT",
        "PROFILE_CERTIFICATION",
        "USER_CONFIRMED_GAP",
        "JOB_KEYWORD_ALIGNMENT"
    ]
    sourceId: Optional[str] = None
    originalText: Optional[str] = None
    confidence: float = 1.0

class TailoredBullet(BaseModel):
    text: str = Field(description="Action-oriented accomplishment statement")
    skillsReferenced: List[str] = Field(default_factory=list)
    provenance: Optional[ProvenanceReference] = None
    alignedKeywords: List[str] = Field(default_factory=list)
    metricPreserved: bool = True

class TailoredExperienceItem(BaseModel):
    id: str
    company: str
    title: str
    location: Optional[str] = None
    startDate: str
    endDate: str = "Present"
    isCurrent: bool = False
    highlights: List[TailoredBullet] = Field(default_factory=list)
    provenance: Optional[ProvenanceReference] = None

class TailoredEducationItem(BaseModel):
    id: str
    institution: str
    degree: str
    fieldOfStudy: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    gpa: Optional[str] = None
    provenance: Optional[ProvenanceReference] = None

class TailoredProjectItem(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)
    url: Optional[str] = None
    highlights: List[TailoredBullet] = Field(default_factory=list)
    provenance: Optional[ProvenanceReference] = None

class TailoredSkillGroup(BaseModel):
    category: str
    skills: List[str] = Field(default_factory=list)
    provenance: List[ProvenanceReference] = Field(default_factory=list)

class TailoredResumeContent(BaseModel):
    fullName: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    links: List[Dict[str, str]] = Field(default_factory=list)
    professionalSummary: str
    skillsByCategory: List[TailoredSkillGroup] = Field(default_factory=list)
    experience: List[TailoredExperienceItem] = Field(default_factory=list)
    education: List[TailoredEducationItem] = Field(default_factory=list)
    projects: List[TailoredProjectItem] = Field(default_factory=list)
    certifications: List[Dict[str, str]] = Field(default_factory=list)
    matchedKeywords: List[str] = Field(default_factory=list)
    provenanceMap: Dict[str, Any] = Field(default_factory=dict)

class ResumeGenerationRequest(BaseModel):
    profile: Dict[str, Any]
    jobTitle: str
    company: Optional[str] = None
    jobDescription: str
    jobMatchReport: Optional[JobMatchReport] = None
    templateId: ResumeTemplateType = "ATS_SINGLE_COLUMN"
    userConfirmedGaps: Optional[Dict[str, Any]] = Field(default_factory=dict)
    maxPages: int = 1

class ResumeValidationReport(BaseModel):
    isValid: bool
    contactInfoVerified: bool = True
    datesVerified: bool = True
    skillsVerified: bool = True
    projectsVerified: bool = True
    metricsPreserved: bool = True
    pdfTextExtractable: bool = True
    violations: List[str] = Field(default_factory=list)
    unsupportedClaims: List[str] = Field(default_factory=list)
    extractedPdfWordCount: int = 0
    pageCount: int = 1

class GeneratedResumeResult(BaseModel):
    success: bool
    resumeContent: Optional[TailoredResumeContent] = None
    latexSource: str = ""
    pdfBase64: Optional[str] = None
    pdfSizeBytes: int = 0
    pageCount: int = 1
    templateId: str = "ATS_SINGLE_COLUMN"
    validationReport: ResumeValidationReport
    matchedKeywords: List[str] = Field(default_factory=list)
    tailoredSummary: str = ""
    warnings: List[str] = Field(default_factory=list)



