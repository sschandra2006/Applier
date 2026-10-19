/**
 * QA Lab Scenario 26: Definitive Submission Success
 * Canonical success screen providing multi-signal proof of successful submission:
 * explicit success text, unique reference number, submitted timestamp, and receipt download.
 */

export const scenario26 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-26-submission-success',
  scenarioNumber: 26,
  name: 'Multi-Signal Verified Submission Success',
  description: 'Canonical post-submission success landing page exhibiting all 5 success signals: success text, reference number, timestamp, receipt link, and print button.',
  category: 'SUBMISSION_VERIFICATION',
  failureClass: 'NONE',
  breakMechanism: 'Baseline benchmark verification screen — verifies robust detection of genuine submission success.',
  resilienceStrategy: 'Verified submission engine evaluates multiple independent success signals (DOM text, application ID, receipt link, URL transition).',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Submission Confirmed</title>
  <style>
    body { font-family: sans-serif; padding: 30px; max-width: 650px; margin: 0 auto; text-align: center; }
    .success-card { border: 2px solid #28a745; border-radius: 8px; padding: 25px; background: #fafffa; }
    .icon-check { font-size: 48px; color: #28a745; margin-bottom: 10px; }
    .ref-badge { font-size: 20px; font-weight: bold; color: #0066cc; background: #eef6fc; padding: 8px 16px; border-radius: 4px; display: inline-block; margin: 15px 0; }
    .btn-action { padding: 10px 20px; background: #28a745; color: white; border: none; cursor: pointer; border-radius: 4px; text-decoration: none; display: inline-block; margin: 5px; }
  </style>
</head>
<body>
  <div class="success-card" id="submissionSuccessContainer">
    <div class="icon-check">&#10004;</div>
    <h1 id="successHeading">Application Submitted Successfully!</h1>
    <p>Your official application has been received and verified by the Admissions Directorate.</p>

    <div class="ref-badge">
      Application Number: <span id="applicationRefNumber">APP-2026-99881</span>
    </div>

    <p style="color:#555; font-size:14px;">
      Submitted At: <span id="submittedAtTimestamp">2026-10-07T14:30:00Z</span>
    </p>

    <div style="margin-top: 20px;">
      <a href="data:application/pdf;base64,JVBERi0xLjQK" id="downloadReceiptLink" class="btn-action" download="receipt.pdf">
        Download Receipt (PDF)
      </a>
      <button type="button" id="printReceiptBtn" class="btn-action" style="background:#0066cc;">
        Print Confirmation
      </button>
    </div>
  </div>
</body>
</html>`
};
