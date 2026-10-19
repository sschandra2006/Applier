/**
 * QA Lab Scenario 20: OTP Checkpoint
 * Portal requiring multi-factor SMS / Email OTP verification modal,
 * triggering Applier's human checkpoint execution pause.
 */

export const scenario20 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-20-otp-checkpoint',
  scenarioNumber: 20,
  name: 'Multi-Factor OTP Checkpoint',
  description: 'Authentication modal presenting a 6-digit OTP code prompt, countdown timer, and verify action, requiring human intervention.',
  category: 'AUTHENTICATION_BARRIER',
  failureClass: 'UNEXPECTED_MODAL',
  breakMechanism: 'Blocks automated progress until the valid OTP token is provided by human applicant.',
  resilienceStrategy: 'Detection of OTP signature triggers HUMAN_CHECKPOINT / OTP_PAUSE, saves durable execution state, and resumes after input.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End', 'Recovery'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: OTP Checkpoint</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
    #otpModal {
      display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); z-index: 1000; justify-content: center; align-items: center;
    }
    .modal-box { background: white; padding: 25px; border-radius: 8px; max-width: 420px; text-align: center; }
    .otp-input { letter-spacing: 8px; font-size: 20px; text-align: center; font-weight: bold; width: 200px; margin: 10px auto; display: block; }
    #otpSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Tax Credit Registration</h1>

  <form id="taxForm">
    <div class="form-group">
      <label for="taxApplicant">Primary Applicant Name</label>
      <input type="text" id="taxApplicant" name="applicantName" value="Jordan Bell" required />
    </div>

    <div class="form-group">
      <label for="taxMobile">Registered Phone</label>
      <input type="tel" id="taxMobile" name="phone" value="9876543210" required />
    </div>

    <button type="submit" id="requestOtpBtn">Proceed with Application</button>
  </form>

  <div id="otpModal" role="dialog" aria-modal="true" aria-labelledby="otpHeading">
    <div class="modal-box">
      <h3 id="otpHeading">Verify Mobile Number</h3>
      <p>Enter the 6-digit One-Time Password (OTP) sent to your registered mobile ending in <strong>3210</strong>.</p>
      <input type="text" id="otpCodeField" class="otp-input" maxlength="6" placeholder="______" autocomplete="one-time-code" />
      <div style="margin-top: 15px;">
        <button type="button" id="confirmOtpBtn" style="background:#28a745;">Verify & Submit</button>
      </div>
      <p style="font-size: 12px; color: #666; margin-top: 10px;">Valid for: <span id="timerText">01:59</span></p>
    </div>
  </div>

  <div id="otpSuccess">
    <h3>Application Successfully Verified via OTP!</h3>
    <p>Reference: <strong id="otpRefId">OTP-VERIFIED-2026-7788</strong></p>
  </div>

  <script>
    document.getElementById('taxForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('otpModal').style.display = 'flex';
    });

    document.getElementById('confirmOtpBtn').addEventListener('click', () => {
      const code = document.getElementById('otpCodeField').value.trim();
      if (code === '123456' || code.length === 6) {
        document.getElementById('otpModal').style.display = 'none';
        document.getElementById('taxForm').style.display = 'none';
        document.getElementById('otpSuccess').style.display = 'block';
      } else {
        alert('Invalid OTP code. Please enter 6 digits.');
      }
    });
  </script>
</body>
</html>`
};
