/**
 * QA Lab Scenario 18: Multi-Hop Redirect
 * Simulates portal entryways that perform automated redirects before landing
 * on the actual form destination.
 */

export const scenario18 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-18-redirect',
  scenarioNumber: 18,
  name: 'Multi-Hop Gateway Redirection',
  description: 'Initial entry page automatically redirects to a downstream application form, testing navigation event handling and final URL resolution.',
  category: 'NETWORK_ASYNC',
  failureClass: 'NAVIGATION_FAILURE',
  breakMechanism: 'Attempting observation while page is transitioning or navigating across redirect boundaries.',
  resilienceStrategy: 'PageManager framenavigated tracking and waiting for final stable document readiness.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Redirect Gate</title>
  <style>
    body { font-family: sans-serif; padding: 20px; text-align: center; }
    .status-msg { margin-top: 30px; font-size: 18px; color: #555; }
    #targetFormContainer { display: none; text-align: left; max-width: 500px; margin: 30px auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
    #redirectSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; }
  </style>
</head>
<body>
  <h1>State Gateway Entry</h1>

  <div id="redirectBanner" class="status-msg">
    Redirecting to secure application subportal in <span id="countdown">1</span> second...
  </div>

  <div id="targetFormContainer">
    <h2>Secure Destination Portal</h2>
    <form id="destForm">
      <div class="form-group">
        <label for="destApplicant">Applicant Registration Number</label>
        <input type="text" id="destApplicant" name="regNumber" placeholder="APP-998812" required />
      </div>
      <button type="submit" id="destSubmitBtn">Confirm Registration</button>
    </form>
    <div id="redirectSuccess">
      <h3>Registration Confirmed at Final Destination!</h3>
    </div>
  </div>

  <script>
    // Simulate multi-hop client-side redirect landing
    setTimeout(() => {
      document.getElementById('redirectBanner').style.display = 'none';
      document.getElementById('targetFormContainer').style.display = 'block';
      window.history.pushState({}, 'Final Destination', '#/portal/final-step');
    }, 400);

    document.getElementById('destForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('destForm').style.display = 'none';
      document.getElementById('redirectSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
