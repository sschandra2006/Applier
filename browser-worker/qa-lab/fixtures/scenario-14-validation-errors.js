/**
 * QA Lab Scenario 14: Validation Errors
 * Form with strict dynamic validation that displays inline error messages
 * and aria-invalid attributes upon invalid or missing inputs.
 */

export const scenario14 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-14-validation-errors',
  scenarioNumber: 14,
  name: 'Dynamic Client-Side Validation Errors',
  description: 'Form enforcing strict validation rules; invalid submissions trigger inline error spans, aria-invalid flags, and prevent submission.',
  category: 'FORM_PARSING',
  failureClass: 'VALIDATION_FAILURE',
  breakMechanism: 'Submitting invalid values triggers validation rejection; automations must detect error messages and rectify.',
  resilienceStrategy: 'Action verifier detects failure via inline validation alerts and triggers adaptive recovery/rectification.',
  testLevels: ['Unit', 'Integration', 'Browser', 'Recovery', 'Failure injection'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Validation Errors</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    input.is-invalid { border: 2px solid #d93025; background: #fff5f5; }
    .error-msg { color: #d93025; font-size: 13px; margin-top: 4px; display: none; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; }
    #validSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Candidate Credential Validation</h1>

  <form id="strictValidationForm" novalidate>
    <div class="form-group">
      <label for="valEmail">Registered Email</label>
      <input type="email" id="valEmail" name="email" placeholder="name@domain.com" />
      <span id="emailError" class="error-msg" role="alert">Please provide a valid email containing '@' and domain.</span>
    </div>

    <div class="form-group">
      <label for="valPhone">Mobile Phone (10 digits)</label>
      <input type="tel" id="valPhone" name="phone" placeholder="9876543210" />
      <span id="phoneError" class="error-msg" role="alert">Phone must be exactly 10 numeric digits.</span>
    </div>

    <div class="form-group">
      <label for="valPincode">Postal Code (6 digits)</label>
      <input type="text" id="valPincode" name="pincode" placeholder="560001" />
      <span id="pinError" class="error-msg" role="alert">Postal code must be exactly 6 digits.</span>
    </div>

    <button type="submit" id="submitStrictBtn">Validate & Submit</button>
  </form>

  <div id="validSuccess">
    <h3>All Credentials Validated!</h3>
    <p>Application accepted without errors.</p>
  </div>

  <script>
    const form = document.getElementById('strictValidationForm');
    const email = document.getElementById('valEmail');
    const phone = document.getElementById('valPhone');
    const pin = document.getElementById('valPincode');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let hasError = false;

      // Validate email
      const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
      document.getElementById('emailError').style.display = isEmailValid ? 'none' : 'block';
      email.classList.toggle('is-invalid', !isEmailValid);
      email.setAttribute('aria-invalid', isEmailValid ? 'false' : 'true');
      if (!isEmailValid) hasError = true;

      // Validate phone
      const isPhoneValid = /^\d{10}$/.test(phone.value.trim());
      document.getElementById('phoneError').style.display = isPhoneValid ? 'none' : 'block';
      phone.classList.toggle('is-invalid', !isPhoneValid);
      phone.setAttribute('aria-invalid', isPhoneValid ? 'false' : 'true');
      if (!isPhoneValid) hasError = true;

      // Validate pin
      const isPinValid = /^\d{6}$/.test(pin.value.trim());
      document.getElementById('pinError').style.display = isPinValid ? 'none' : 'block';
      pin.classList.toggle('is-invalid', !isPinValid);
      pin.setAttribute('aria-invalid', isPinValid ? 'false' : 'true');
      if (!isPinValid) hasError = true;

      if (!hasError) {
        form.style.display = 'none';
        document.getElementById('validSuccess').style.display = 'block';
      }
    });
  </script>
</body>
</html>`
};
