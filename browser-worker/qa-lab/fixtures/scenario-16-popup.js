/**
 * QA Lab Scenario 16: Popup Window
 * Form requiring interaction with a window.open() popup modal that sends
 * an authentication token back to the parent window via postMessage.
 */

export const scenario16 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-16-popup',
  scenarioNumber: 16,
  name: 'Popup Window Authentication Dialogue',
  description: 'Application requiring opening an auxiliary popup window, verifying credentials in popup, and returning back to main page.',
  category: 'NETWORK_ASYNC',
  failureClass: 'UNEXPECTED_MODAL',
  breakMechanism: 'Breaks single-page automations unaware of newly spawned browser window contexts.',
  resilienceStrategy: 'PageManager listens to popup events, switches focus to new page, and returns to opener after completion.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Popup Dialogue</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .status-box { padding: 10px; background: #f0f0f0; margin: 15px 0; border-radius: 4px; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    #popupFinalSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Partner Verification Portal</h1>

  <div class="status-box">
    Authorization Status: <strong id="authStatusText">UNVERIFIED</strong>
  </div>

  <button type="button" id="openPopupBtn">Launch Verification Popup</button>

  <form id="popupForm" style="margin-top: 20px;">
    <input type="hidden" id="authTokenInput" name="authToken" value="" />
    <button type="submit" id="popupSubmitBtn" disabled>Complete Verified Application</button>
  </form>

  <div id="popupFinalSuccess">
    <h3>Application Completed via Popup Verification!</h3>
    <p>Token Received: <strong id="tokenDisplay"></strong></p>
  </div>

  <script>
    const popupHtml = \`<!DOCTYPE html>
<html>
<head><title>Identity Verification Popup</title></head>
<body style="font-family:sans-serif; padding:20px; text-align:center;">
  <h3>Third-Party Verification Gateway</h3>
  <p>Click below to sign the agreement and authorize this application.</p>
  <button id="confirmPopupBtn" style="padding:10px 20px; background:green; color:white; border:none; cursor:pointer;">
    Confirm & Authorize
  </button>
  <script>
    document.getElementById('confirmPopupBtn').addEventListener('click', () => {
      if (window.opener) {
        window.opener.postMessage({ type: 'POPUP_VERIFIED', token: 'AUTH-POPUP-SUCCESS-9912' }, '*');
      }
      window.close();
    });
  <\/script>
</body>
</html>\`;

    document.getElementById('openPopupBtn').addEventListener('click', () => {
      const popup = window.open('', 'authPopup', 'width=450,height=350');
      if (popup) {
        popup.document.write(popupHtml);
        popup.document.close();
      }
    });

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'POPUP_VERIFIED') {
        document.getElementById('authStatusText').innerText = 'AUTHORIZED';
        document.getElementById('authTokenInput').value = event.data.token;
        document.getElementById('popupSubmitBtn').disabled = false;
        document.getElementById('openPopupBtn').style.display = 'none';
      }
    });

    document.getElementById('popupForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('popupForm').style.display = 'none';
      document.getElementById('tokenDisplay').innerText = document.getElementById('authTokenInput').value;
      document.getElementById('popupFinalSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
