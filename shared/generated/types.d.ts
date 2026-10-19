/**
 * Applier 2.0 Canonical Types
 * Generated contract interfaces for JavaScript/TypeScript developers.
 */

export type SchemaVersion = "2.0.0";

export type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "PAUSED_OTP"
  | "PAUSED_CAPTCHA"
  | "PAUSED_PAYMENT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ExecutionStepType =
  | "navigate"
  | "fill"
  | "click"
  | "select"
  | "upload"
  | "pause"
  | "wait"
  | "screenshot";

export type PauseReason = "OTP" | "CAPTCHA" | "PAYMENT" | "MANUAL_REVIEW";

export type InterviewStatus = "NOT_STARTED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";

export interface CanonicalWorkflowStep {
  id: string;
  type?: string;
  label?: string;
  selector?: string;
  required?: boolean;
  validation?: Record<string, any>;
  options?: any;
  metadata?: Record<string, any>;
  extensions?: Record<string, any>;
}

export interface CanonicalWorkflowPage {
  id: string;
  title: string;
  url?: string;
  steps: CanonicalWorkflowStep[];
}

export interface CanonicalWorkflow {
  schemaVersion: SchemaVersion;
  workflowId?: string;
  name: string;
  targetUrl: string;
  urlHash?: string;
  landingScreenshot?: string | null;
  pages: CanonicalWorkflowPage[];
  applicationOptions?: any[];
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface CanonicalExecutionStep {
  schemaVersion?: SchemaVersion;
  stepIndex?: number;
  type: ExecutionStepType;
  selector?: string | null;
  field?: string | null;
  value?: string | null;
  url?: string | null;
  description?: string | null;
  waitAfterMs?: number;
  constraints?: Record<string, any>;
  pauseReason?: PauseReason | null;
  captchaSelector?: string | null;
}

export interface CanonicalExecutionPlan {
  schemaVersion?: SchemaVersion;
  planId?: string;
  targetUrl: string;
  totalSteps?: number;
  steps: CanonicalExecutionStep[];
  confidence?: number;
  notes?: string | null;
  createdAt?: string;
}

export interface CanonicalInterviewState {
  schemaVersion: SchemaVersion;
  stateId: string;
  userId: string;
  workflowId: string;
  applicationId?: string | null;
  status: InterviewStatus;
  answers: Record<string, any>;
  pendingFields: string[];
  completedFields: string[];
  currentField?: string | null;
  currentStep?: number;
  confidenceScores?: Record<string, number>;
  validationErrors?: Record<string, string>;
  lastQuestionId?: string | null;
  updatedAt?: string;
}

export interface CanonicalHumanCheckpoint {
  schemaVersion?: SchemaVersion;
  checkpointId?: string;
  fieldName: string;
  pauseReason: PauseReason;
  captchaImageBase64?: string | null;
  pageScreenshotBase64?: string | null;
  stepIndex?: number;
  resumeFromIndex?: number;
  resolved?: boolean;
  resolvedValue?: string | null;
  createdAt?: string;
}

export interface CanonicalAutomationJob {
  schemaVersion: SchemaVersion;
  jobId: string;
  userId: string;
  interviewStateId: string;
  workflowId: string;
  status: JobStatus;
  progress: {
    currentStep: number;
    totalSteps: number;
  };
  currentStepIndex?: number;
  executionPlan: CanonicalExecutionStep[];
  pauseContext?: CanonicalHumanCheckpoint | null;
  errorDetails?: string | null;
  logs: Array<{
    timestamp?: string;
    level?: "INFO" | "WARNING" | "ERROR";
    message: string;
    additionalData?: Record<string, any>;
  }>;
  createdAt?: string;
  updatedAt?: string;
}
