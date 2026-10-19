/**
 * QA Lab Scenario 27: Ambiguous Submission
 * Post-submission state with ambiguous, uncertain outcome lacking definitive reference numbers
 * or receipts, designed to test false-success prevention (SUBMISSION_UNCERTAIN).
 */

export const scenario27 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-27-ambiguous-submission',
  scenarioNumber: 27,
  name: 'Ambiguous & Indeterminate Submission Outcome',
  description: 'Post-submission screen displaying uncertain status ("processing queue") with zero reference numbers and zero receipts, requiring escalation rather than false success.',
  category: 'SUBMISSION_VERIFICATION',
  failureClass: 'AMBIGUOUS_SUBMISSION',
  breakMechanism: 'Naïve automations that assume clicking submit means success will falsely report submission completed.',
  resilienceStrategy: 'Verified submission engine detects lack of definitive success signals and transitions job to SUBMISSION_UNCERTAIN for human review.',
  testLevels: ['Unit', 'Integration', 'Browser', 'Failure injection', 'Recovery'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Submission Pending Review</title>
  <style>
    body { font-family: sans-serif; padding: 30px; max-width: 600px; margin: 0 auto; text-align: center; }
    .ambig-card { border: 2px solid #ff9800; border-radius: 8px; padding: 25px; background: #fffdfa; }
    .icon-warn { font-size: 40px; color: #ff9800; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="ambig-card" id="ambiguousResultContainer">
    <div class="icon-warn">&#9888;</div>
    <h2 id="ambigHeading">Submission Received in Background Buffer</h2>
    <p>
      Your application packet has entered the batch ingestion queue. We cannot confirm whether your submission will be accepted or dropped at this time.
    </p>
    <p style="color:#777; font-size:13px;">
      No application tracking number has been generated. Please do not submit again or reload. Contact support after 48 hours if you do not receive an email.
    </p>
  </div>
</body>
</html>`
};
