/**
 * QA Lab Scenario 19: Session Expiration
 * Portal where the active session expires after a short inactivity period,
 * locking the form with a blocking modal and disabling all inputs.
 */

export const scenario19 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-19-session-expiration',
  scenarioNumber: 19,
  name: 'Session Expiration Inactivity Lockout',
  description: 'Simulates portals that invalidate active sessions after a timeout, rendering a blocking modal and disabling inputs.',
  category: 'AUTHENTICATION_BARRIER',
  failureClass: 'SESSION_EXPIRED',
  breakMechanism: 'Session invalidation prevents form submission; automations attempting action throw session expired errors.',
  resilienceStrategy: 'Multi-level recovery engine identifies session expiration and invokes session refresh/recovery.',
  testLevels: ['Unit', 'Integration', 'Browser', 'Recovery', 'Failure injection'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Session Expiration</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
    #sessionModal {
      display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); z-index: 1000; justify-content: center; align-items: center;
    }
    .modal-card { background: white; padding: 25px; border-radius: 8px; max-width: 400px; text-align: center; }
    #sessionSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Banking Benefit Application</h1>

  <form id="sessionForm">
    <div class="form-group">
      <label for="accHolder">Account Holder Name</label>
      <input type="text" id="accHolder" name="accountHolder" placeholder="Name" required />
    </div>

    <div class="form-group">
      <label for="bankAccNumber">Bank Account Number</label>
      <input type="text" id="bankAccNumber" name="accountNumber" placeholder="981029381" required />
    </div>

    <button type="submit" id="submitSessionBtn">Submit Application</button>
  </form>

  <div id="sessionModal" role="dialog" aria-modal="true">
    <div class="modal-card">
      <h3 style="color:#d93025;">Session Expired</h3>
      <p id="sessionTimeoutNotice">Your secure banking session has expired due to inactivity. Please refresh the page or renew your session to continue.</p>
      <button type="button" id="renewSessionBtn" style="background:#28a745;">Renew Session</button>
    </div>
  </div>

  <div id="sessionSuccess">
    <h3>Application Accepted After Session Refresh!</h3>
  </div>

  <script>
    let sessionTimer;

    function startTimer() {
      sessionTimer = setTimeout(() => {
        document.getElementById('sessionModal').style.display = 'flex';
        document.querySelectorAll('#sessionForm input, #sessionForm button').forEach(el => el.disabled = true);
      }, 500); // Trigger session expiry after 500ms
    }

    startTimer();

    document.getElementById('renewSessionBtn').addEventListener('click', () => {
      document.getElementById('sessionModal').style.display = 'none';
      document.querySelectorAll('#sessionForm input, #sessionForm button').forEach(el => el.disabled = false);
      clearTimeout(sessionTimer);
    });

    document.getElementById('sessionForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('sessionForm').style.display = 'none';
      document.getElementById('sessionSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
