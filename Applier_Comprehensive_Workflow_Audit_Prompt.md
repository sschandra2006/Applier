# Comprehensive End-to-End Workflow Audit Prompt for Applier

## Role

You are acting as a **Principal Software Architect**, **Principal AI
Architect**, **Senior Backend Engineer**, **Senior Frontend Engineer**,
**Senior Browser Automation Engineer**, **Lead QA Engineer**, **Product
Architect**, and **Systems Auditor**.

Your mission is to perform a **complete end-to-end architectural,
functional, AI, automation, and workflow audit** of the entire Applier
codebase.

Do **not** assume any implementation is correct. Treat every module as
potentially incomplete until verified.

Your responsibilities are to:

-   Audit the entire repository.
-   Verify every workflow.
-   Detect architectural flaws.
-   Identify duplicate logic.
-   Verify AI architecture.
-   Verify browser automation.
-   Verify document handling.
-   Verify security.
-   Verify scalability.
-   Refactor any violations while preserving functionality.

------------------------------------------------------------------------

# Core Architectural Principles

The architecture **must** follow these rules.

1.  AI performs reasoning only.
2.  Browser Automation performs execution only.
3.  Node.js is the API Gateway and System of Record.
4.  Python AI Service contains the AI Orchestrator and specialized AI
    agents.
5.  Every AI capability has exactly one owner.
6.  Playwright (or equivalent) contains zero AI reasoning.
7.  AI agents never manipulate documents directly.
8.  Document transformations are handled only by the Document Processing
    Engine.
9.  All workflows are resumable.
10. Every user action is traceable through logs.

------------------------------------------------------------------------

# Expected End-to-End Product Workflow

User → Authentication → Dashboard → New Application → Paste URL / Select
Portal → Website Analysis → Portal Understanding → Workflow Generation →
AI Conversation → Profile Reuse → Collect Missing Information → Detect
Required Documents → Extract Upload Requirements → Request Documents →
Document Validation → Document Preparation Plan → Document Processing
Engine → Business Rule Validation → Review → User Confirmation →
Execution Planning → Browser Automation → OTP / CAPTCHA / Payment →
Resume → Submission → Receipt Collection → Application History → Status
Tracking → Recommendations

Every module must support this lifecycle.

------------------------------------------------------------------------

# Mandatory AI Architecture

The audit must verify:

-   AI Orchestrator
-   Conversation Agent
-   Website Intelligence Agent
-   Workflow Planning Agent
-   Validation Agent
-   Document Intelligence Agent
-   Execution Planner
-   Error Recovery Agent
-   Explanation Agent
-   Recommendation Agent
-   Memory Manager
-   Prompt Manager

No duplicated responsibilities.

------------------------------------------------------------------------

# Document Processing Pipeline

Verify a dedicated Document Processing Engine exists.

The AI must extract upload requirements such as:

-   accepted formats
-   maximum file size
-   dimensions
-   page limits
-   orientation

The Document Processing Engine must perform:

-   compression
-   resize
-   format conversion
-   PDF optimization
-   merge
-   split
-   verification

The Browser Automation layer must upload only verified documents.

No document manipulation may occur inside AI agents or browser
automation.

(OCR is intentionally out of scope for this version.)

------------------------------------------------------------------------

# Audit Checklist

Audit and validate:

1.  Repository structure
2.  Dependency graph
3.  Frontend workflow
4.  Backend workflow
5.  AI workflow
6.  Browser automation workflow
7.  Document workflow
8.  Validation workflow
9.  Review workflow
10. Submission workflow
11. Application history
12. Status tracking
13. Recommendation engine
14. Memory management
15. Configuration
16. Security
17. Performance
18. Scalability
19. Code quality
20. Error recovery
21. Notifications
22. Logging
23. Analytics

For every issue found:

-   Explain the problem.
-   Explain the impact.
-   Refactor the implementation.
-   Verify the fix.
-   Document the change.

------------------------------------------------------------------------

# Acceptance Criteria

The audit is complete only if all of the following are true:

-   Every module contributes to the intended workflow.
-   Every workflow transition is connected.
-   No lifecycle step is missing.
-   No duplicate responsibilities exist.
-   No dead code remains.
-   AI performs reasoning only.
-   Browser automation performs execution only.
-   Document uploads always pass through the Document Processing Engine.
-   Upload requirements are extracted automatically.
-   Validation occurs before automation.
-   Review occurs before submission.
-   Recovery and resume mechanisms function correctly.
-   Application history is complete.
-   Security best practices are enforced.
-   Configuration is centralized.
-   Performance bottlenecks are identified or resolved.
-   The architecture is modular and scalable.

------------------------------------------------------------------------

# Required Deliverables

Produce:

1.  Current architecture diagram.
2.  Proposed architecture diagram.
3.  Dependency graph.
4.  Current workflow.
5.  Expected workflow.
6.  Workflow gap analysis.
7.  Missing features.
8.  Missing AI capabilities.
9.  Missing automation capabilities.
10. Missing document-processing capabilities.
11. Security findings.
12. Performance findings.
13. Duplicate logic report.
14. Refactoring summary.
15. Files modified.
16. Regression test results.
17. Remaining technical debt.
18. Final workflow compliance score (0--100%) with justification.
19. Confirmation that the complete repository now conforms to the
    intended architecture.

Do not conclude the audit until the **entire repository** has been
inspected, every workflow has been validated, every architectural
violation has been addressed or documented, and the complete system has
been verified end-to-end.
