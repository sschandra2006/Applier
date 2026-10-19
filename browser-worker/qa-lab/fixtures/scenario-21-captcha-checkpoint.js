/**
 * QA Lab Scenario 21: CAPTCHA Checkpoint
 * Portal requiring CAPTCHA challenge resolution prior to accepting submissions,
 * triggering Applier's human checkpoint execution pause.
 */

export const scenario21 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-21-captcha-checkpoint',
  scenarioNumber: 21,
  name: 'Bot Protection CAPTCHA Checkpoint',
  description: 'Simulates interactive bot protection barriers (e.g. reCAPTCHA/hCaptcha challenge) requiring human resolution before submission.',
  category: 'AUTHENTICATION_BARRIER',
  failureClass: 'UNEXPECTED_MODAL',
  breakMechanism: 'Blocks automated submissions unless interactive challenge is solved.',
  resilienceStrategy: 'Detection of CAPTCHA signature triggers HUMAN_CHECKPOINT / CAPTCHA_PAUSE; resumes after user completes verification.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End', 'Recovery'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: CAPTCHA Checkpoint</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    .captcha-container { border: 1px solid #ccc; padding: 15px; background: #f9f9f9; border-radius: 4px; display: inline-flex; align-items: center; gap: 15px; }
    .captcha-checkbox { width: 24px; height: 24px; cursor: pointer; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
    #captchaSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Voter Registration Portal</h1>

  <form id="captchaForm">
    <div class="form-group">
      <label for="voterName">Voter Legal Name</label>
      <input type="text" id="voterName" name="voterName" value="Morgan Freeman" required />
    </div>

    <div class="form-group">
      <div class="captcha-container" id="captchaWidget" role="region" aria-label="Security verification challenge">
        <input type="checkbox" id="captchaCheckbox" class="captcha-checkbox" />
        <label for="captchaCheckbox" style="margin:0; cursor:pointer;">I am not a robot</label>
        <span style="font-size:10px; color:#888;">reCAPTCHA Protection</span>
      </div>
    </div>

    <button type="submit" id="submitCaptchaBtn">Submit Voter Form</button>
  </form>

  <div id="captchaSuccess">
    <h3>Registration Finalized After CAPTCHA Resolution!</h3>
    <p>Reference: <strong id="captchaRef">VOTER-2026-9901</strong></p>
  </div>

  <script>
    document.getElementById('captchaForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const isSolved = document.getElementById('captchaCheckbox').checked;
      if (!isSolved) {
        alert('Security Verification Required: Please complete the CAPTCHA before submitting.');
        return;
      }
      document.getElementById('captchaForm').style.display = 'none';
      document.getElementById('captchaSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
