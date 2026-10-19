# REST API & Message Protocol Reference — Applier 3.0

This specification details all HTTP REST endpoints exposed by the Applier 3.0 backend, as well as the internal Chrome Extension messaging protocol.

---

## 1. Authentication & Headers

All protected endpoints require an `Authorization` header containing a valid JWT bearer token:
```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

---

## 2. Professional Profile Endpoints

### `GET /api/v1/profile`
Retrieves the authenticated user's canonical professional profile.
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "670c1a2f...",
    "userId": "670c1a1e...",
    "fullName": "Alex Vance",
    "email": "alex.vance@example.com",
    "phone": "+1-555-0144",
    "skills": [
      { "name": "Go", "proficiency": "EXPERT", "verified": true },
      { "name": "Kubernetes", "proficiency": "ADVANCED", "verified": true }
    ],
    "experience": [
      {
        "title": "Senior Infrastructure Engineer",
        "company": "CloudStream Systems",
        "startDate": "2021-03-01",
        "endDate": "2024-08-31",
        "current": false,
        "description": "Designed high-availability microservices.",
        "verified": true
      }
    ],
    "verificationStatus": "VERIFIED"
  }
}
```

### `PUT /api/v1/profile`
Updates candidate profile attributes.
* **Payload:** Partial or full `ProfessionalProfile` schema.

---

## 3. Resume Vault Endpoints

### `POST /api/v1/vault/resumes/upload`
Uploads a master resume (PDF or DOCX), validates file integrity and magic bytes, extracts text, and generates initial profile records.
* **Request:** `multipart/form-data` with field `resume`.
* **Max Size:** 10 MB.
* **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "masterResumeId": "6713e...",
    "status": "PARSED",
    "extractedProfile": { "fullName": "Alex Vance", "skillsCount": 15 }
  }
}
```

### `GET /api/v1/vault/resumes/tailored/:resumeId/preview`
Streams decrypted PDF bytes for display in the extension or download.
* **Response (200 OK):** Binary `application/pdf`.

---

## 4. Missing-Info & Workflow Orchestrator Endpoints

### `POST /api/v1/missing-info/session/init`
Initializes the 23-step workflow for a job description. Matches requirements against the candidate profile and creates a durable session.
* **Payload:**
```json
{
  "jobTitle": "Senior Site Reliability Engineer",
  "companyName": "Datadog",
  "jobDescription": "We are seeking an experienced SRE to scale our distributed tracing infrastructure...",
  "jobUrl": "https://careers.datadog.com/jobs/12345",
  "atsType": "GREENHOUSE",
  "applicationQuestions": ["Will you require visa sponsorship?"]
}
```
* **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "sessionId": "mis_1792426795_abcd",
    "workflowState": "QUESTIONS_PENDING",
    "questionsCount": 2,
    "questions": [
      {
        "id": "q_kafka",
        "category": "REQUIRED",
        "fieldName": "Kafka",
        "questionText": "Do you have hands-on experience architecting Apache Kafka pipelines?"
      }
    ]
  }
}
```

### `POST /api/v1/missing-info/session/:sessionId/submit-answer`
Submits the user's answer to a gap clarification question.
* **Payload:**
```json
{
  "questionId": "q_kafka",
  "answer": "Yes, 3 years experience tuning Kafka brokers and consumer group offsets.",
  "targetEntity": "skill",
  "fieldName": "Kafka"
}
```
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessionId": "mis_1792426795_abcd",
    "workflowState": "READY_FOR_RESUME_GENERATION",
    "remainingQuestions": 0
  }
}
```

### `POST /api/v1/missing-info/session/:sessionId/fill-status`
Records extension form-detection, autofill mappings, and resume attachment status.
* **Payload:**
```json
{
  "detectedFields": [{ "id": "first_name", "label": "First Name" }],
  "fieldMappings": [{ "fieldId": "first_name", "targetValue": "Alex" }],
  "fillResults": { "filled": 8, "total": 8 },
  "attachmentStatus": { "attached": true, "fileName": "Alex_Vance_Resume.pdf" }
}
```

### `GET /api/v1/missing-info/session/:sessionId/review`
Generates the authoritative Pre-Submission Review Manifest for user confirmation.
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessionId": "mis_1792426795_abcd",
    "candidate": { "fullName": "Alex Vance", "email": "alex@example.com" },
    "tailoredResume": { "resumeId": "res_123", "matchedKeywords": ["Kafka", "Kubernetes"] },
    "fieldMappings": [...],
    "readyForSubmission": false,
    "requiresExplicitConfirmation": true
  }
}
```

### `POST /api/v1/missing-info/session/:sessionId/confirm-submission`
Enforces the Pre-Submission Review Barrier. Moves the session into `SUBMITTING` and creates an idempotency key.
* **Payload:** `{ "userConfirmed": true }`
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "workflowState": "SUBMITTING",
    "idempotencyKey": "idemp_alex_mis_1792426795_abcd"
  }
}
```

### `POST /api/v1/missing-info/session/:sessionId/record-submission`
Records final submission outcome (`SUBMITTED`, `SUBMISSION_STATUS_UNKNOWN`, or `FAILED`) and creates an audit record.
* **Payload:**
```json
{
  "status": "SUBMITTED",
  "referenceNumber": "APP-2026-9812",
  "confirmationUrl": "https://boards.greenhouse.io/datadog/thanks",
  "receipt": { "submittedAt": "2026-10-19T21:40:00Z" }
}
```

### `GET /api/v1/missing-info/session/:sessionId/recover`
Restores workflow session state after Chrome Service Worker suspension or tab reloads.

---

## 5. Chrome Extension Messaging Protocol

Internal messages between the Side Panel / Service Worker and Content Scripts use `chrome.runtime.sendMessage`:

```javascript
// ExtensionAction Enum Definition
export const ExtensionAction = {
  CHECK_PAGE_STATUS: 'CHECK_PAGE_STATUS',
  PAGE_CONTEXT_DETECTED: 'PAGE_CONTEXT_DETECTED',
  EXTRACT_JOB_DETAILS: 'EXTRACT_JOB_DETAILS',
  DETECT_FORM_FIELDS: 'DETECT_FORM_FIELDS',
  MAP_FORM_FIELDS: 'MAP_FORM_FIELDS',
  AUTOFILL_APPLICATION: 'AUTOFILL_APPLICATION',
  ATTACH_RESUME_FILE: 'ATTACH_RESUME_FILE',
  SUBMIT_APPLICATION: 'SUBMIT_APPLICATION'
};
```
