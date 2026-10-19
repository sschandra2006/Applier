/**
 * QA Lab Scenario 09: Single Iframe Form
 * Application form embedded inside an inline frame boundary.
 */

export const scenario09 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-09-iframe',
  scenarioNumber: 9,
  name: 'Iframe-Embedded Application Portal',
  description: 'Application form rendered inside an iframe, requiring cross-frame locator traversal and coordinate mapping.',
  category: 'HIERARCHY_ISOLATION',
  failureClass: 'NONE',
  breakMechanism: 'Breaks automations that query only document.querySelector without traversing frame trees.',
  resilienceStrategy: 'Runtime locator resolver queries all attached frames; observation engine captures framePath annotations.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Iframe Form</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 700px; margin: 0 auto; }
    iframe { width: 100%; height: 350px; border: 2px dashed #0066cc; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Parent Host Application Page</h1>
  <p>Please complete your identity verification in the embedded window below:</p>

  <iframe
    id="identityIframe"
    name="identityIframe"
    srcdoc="<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 15px; background: #fafafa; }
    .form-group { margin-bottom: 12px; }
    label { display: block; margin-bottom: 4px; font-weight: bold; }
    input { width: 90%; padding: 6px; }
    button { padding: 8px 16px; background: #28a745; color: white; border: none; cursor: pointer; }
    #iframeResult { display: none; margin-top: 10px; color: green; font-weight: bold; }
  </style>
</head>
<body>
  <h3>Secure Embedded Verification</h3>
  <form id='innerFrameForm'>
    <div class='form-group'>
      <label for='nationalId'>National Identity Number</label>
      <input type='text' id='nationalId' name='nationalId' placeholder='ID-1002991' required />
    </div>
    <div class='form-group'>
      <label for='applicantEmail'>Verification Email</label>
      <input type='email' id='applicantEmail' name='applicantEmail' placeholder='test@domain.com' required />
    </div>
    <button type='submit' id='verifyIframeBtn'>Verify Identity</button>
  </form>
  <div id='iframeResult'>Identity Verified Successfully! Token: VERIFIED-9912</div>
  <script>
    document.getElementById('innerFrameForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('innerFrameForm').style.display = 'none';
      document.getElementById('iframeResult').style.display = 'block';
    });
  </script>
</body>
</html>"
  ></iframe>
</body>
</html>`
};
