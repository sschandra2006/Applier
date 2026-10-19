/**
 * QA Lab Scenario 17: New Tab Navigation
 * Application featuring external links that open in a new tab (target="_blank"),
 * testing multi-page session tracking and focus management.
 */

export const scenario17 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-17-new-tab',
  scenarioNumber: 17,
  name: 'Multi-Tab Navigation Context',
  description: 'Application featuring mandatory guidelines links opening in new browser tabs (target="_blank") without breaking current form state.',
  category: 'NETWORK_ASYNC',
  failureClass: 'PAGE_CHANGED',
  breakMechanism: 'Breaks automations that lose reference to the primary application tab upon background or foreground tab creation.',
  resilienceStrategy: 'PageManager isolates new tab events, keeping the primary application page active while allowing secondary tab inspection.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: New Tab</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input[type="text"] { width: 100%; padding: 8px; box-sizing: border-box; }
    a.new-tab-link { color: #0066cc; text-decoration: underline; display: inline-block; margin-bottom: 15px; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; }
    #tabSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Compliance Acknowledgment Portal</h1>

  <form id="newTabForm">
    <div class="form-group">
      <label for="applicantNameTab">Applicant Full Name</label>
      <input type="text" id="applicantNameTab" name="applicantName" placeholder="Full name" required />
    </div>

    <div>
      <a id="guidelinesLink" href="about:blank" target="_blank" class="new-tab-link">
        Open Mandatory Guidelines in New Tab &nearr;
      </a>
    </div>

    <div class="form-group">
      <label>
        <input type="checkbox" id="tabAckCheckbox" name="guidelinesAck" required />
        I have read and agree to all external terms in the new tab
      </label>
    </div>

    <button type="submit" id="submitTabBtn">Acknowledge & Submit</button>
  </form>

  <div id="tabSuccess">
    <h3>Compliance Recorded!</h3>
    <p>Application successfully finalized in primary tab.</p>
  </div>

  <script>
    document.getElementById('newTabForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('newTabForm').style.display = 'none';
      document.getElementById('tabSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
