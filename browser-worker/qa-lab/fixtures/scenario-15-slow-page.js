/**
 * QA Lab Scenario 15: Slow Hydrating Page
 * Delayed page rendering where form elements mount only after an artificial
 * spinner/hydration delay of 1000ms.
 */

export const scenario15 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-15-slow-page',
  scenarioNumber: 15,
  name: 'Slow Hydrating SPA Portal',
  description: 'Page that delays mounting interactive form inputs behind a 1000ms loading spinner, testing timeout and readiness guards.',
  category: 'NETWORK_ASYNC',
  failureClass: 'TIMEOUT',
  breakMechanism: 'Premature observation or locator resolution attempts when page has not yet finished hydrating elements into DOM.',
  resilienceStrategy: 'Observation engine waits for DOM stability / network idle, and runtime locators use smart element polling.',
  testLevels: ['Unit', 'Integration', 'Browser', 'Recovery', 'Load'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Slow Page</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    #spinnerContainer { text-align: center; padding: 50px; }
    .loader {
      border: 6px solid #f3f3f3; border-top: 6px solid #0066cc; border-radius: 50%;
      width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    #hydratedForm { display: none; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; }
    #slowSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Government Public Service Portal</h1>

  <div id="spinnerContainer">
    <div class="loader"></div>
    <p>Connecting to regional server and initializing form components...</p>
  </div>

  <form id="hydratedForm">
    <div class="form-group">
      <label for="slowApplicantName">Applicant Legal Name</label>
      <input type="text" id="slowApplicantName" name="applicantName" placeholder="Full name" required />
    </div>

    <div class="form-group">
      <label for="slowReference">Pre-Registration Code</label>
      <input type="text" id="slowReference" name="preRegCode" placeholder="REG-8821" required />
    </div>

    <button type="submit" id="slowSubmitBtn">Complete Submission</button>
  </form>

  <div id="slowSuccess">
    <h3>Submission Completed After Hydration!</h3>
    <p>Reference: <strong id="slowRefOutput">SLOW-2026-COMPLETE</strong></p>
  </div>

  <script>
    // Simulate delayed SPA hydration (1000ms)
    setTimeout(() => {
      document.getElementById('spinnerContainer').style.display = 'none';
      document.getElementById('hydratedForm').style.display = 'block';
    }, 1000);

    document.getElementById('hydratedForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('hydratedForm').style.display = 'none';
      document.getElementById('slowSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
