/**
 * QA Lab Scenario 25: Conflicting Documents
 * Discrepancy between evidence extracted from multiple documents (Passport vs Driver License),
 * testing evidence reconciliation, confidence scoring, and human interview escalation.
 */

export const scenario25 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-25-conflicting-documents',
  scenarioNumber: 25,
  name: 'Conflicting Document Evidence Discrepancy',
  description: 'Scenario where multiple uploaded applicant documents contain contradictory values (e.g. mismatched DOB or legal name spelling).',
  category: 'AMBIGUITY_RESOLUTION',
  failureClass: 'VALIDATION_FAILURE',
  breakMechanism: 'Naïve extraction blindly chooses whichever document was parsed last, causing silent submission of incorrect data.',
  resilienceStrategy: 'Knowledge graph detects conflicting confidence scores and escalates to conversational interview or human review.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End', 'Recovery'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Conflicting Documents</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .evidence-card { border: 1px solid #ccc; padding: 15px; border-radius: 6px; margin-bottom: 15px; }
    .mismatch-badge { background: #fff3cd; color: #856404; padding: 8px 12px; border-radius: 4px; margin-bottom: 15px; font-weight: bold; }
    .form-group { margin-bottom: 12px; }
    label { display: block; margin-bottom: 4px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
    #conflictSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Identity Discrepancy Resolution</h1>

  <div class="mismatch-badge">
    &#9888; Document Evidence Conflict Detected: Passport DOB (1995-04-12) differs from Driver License DOB (1994-04-12).
  </div>

  <form id="discrepancyForm">
    <div class="form-group">
      <label for="verifiedLegalName">Confirmed Legal Name</label>
      <input type="text" id="verifiedLegalName" name="legalName" value="Johnathan Alexander Smith" required />
    </div>

    <div class="form-group">
      <label for="verifiedDob">Confirmed Date of Birth (YYYY-MM-DD)</label>
      <input type="date" id="verifiedDob" name="dateOfBirth" value="1995-04-12" required />
    </div>

    <div class="form-group">
      <label for="reconciliationNote">Discrepancy Justification / Attestation</label>
      <input type="text" id="reconciliationNote" name="justification" placeholder="Passport reflects official birth registry" required />
    </div>

    <button type="submit" id="submitReconciledBtn">Confirm Reconciled Identity</button>
  </form>

  <div id="conflictSuccess">
    <h3>Discrepancy Reconciled & Saved!</h3>
    <p>Canonical DOB: <strong id="outDob"></strong></p>
  </div>

  <script>
    document.getElementById('discrepancyForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('discrepancyForm').style.display = 'none';
      document.getElementById('outDob').innerText = document.getElementById('verifiedDob').value;
      document.getElementById('conflictSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
