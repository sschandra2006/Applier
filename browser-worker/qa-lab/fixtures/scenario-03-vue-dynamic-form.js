/**
 * QA Lab Scenario 03: Vue-like Dynamic Form
 * Emulates Vue 3 reactive proxy data-binding, live field validations,
 * reactive disabled states, and dynamic completion progress bars.
 */

export const scenario03 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-03-vue-dynamic-form',
  scenarioNumber: 3,
  name: 'Vue-like Dynamic Form',
  description: 'Reactive form framework emulation with live two-way data-binding, dynamic validation errors, and disabled submit button until valid.',
  category: 'SPA_FRAMEWORK',
  failureClass: 'NONE',
  breakMechanism: 'Breaks automations that try to click submit before reactive validation triggers or fails to satisfy reactivity hooks.',
  resilienceStrategy: 'Full typing simulation, event bubbling, and waiting for interactive element states.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Vue-like Dynamic Form</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    .vue-error { color: #d93025; font-size: 12px; margin-top: 4px; display: none; }
    .progress-container { width: 100%; height: 8px; background: #eee; border-radius: 4px; margin-bottom: 20px; overflow: hidden; }
    .progress-bar { width: 0%; height: 100%; background: #42b883; transition: width 0.3s; }
    button:disabled { background: #cccccc; cursor: not-allowed; }
    button:enabled { background: #42b883; color: white; cursor: pointer; }
    button { padding: 10px 20px; border: none; font-weight: bold; border-radius: 4px; }
    #vueSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid #42b883; margin-top: 15px; }
  </style>
</head>
<body>
  <div id="vue-app">
    <h1>Vue 3 Reactive Application</h1>

    <div class="progress-container">
      <div id="progressBar" class="progress-bar"></div>
    </div>

    <form id="vueForm">
      <div class="form-group">
        <label for="vueUsername">Desired Username (at least 4 chars)</label>
        <input type="text" id="vueUsername" name="username" placeholder="Choose username" autocomplete="off" />
        <span id="usernameError" class="vue-error" role="alert">Username must be at least 4 characters long.</span>
      </div>

      <div class="form-group">
        <label for="vueEmail">Account Email</label>
        <input type="email" id="vueEmail" name="email" placeholder="user@company.com" autocomplete="off" />
        <span id="emailError" class="vue-error" role="alert">Please enter a valid email address.</span>
      </div>

      <div class="form-group">
        <label for="vuePassword">Secure Passphrase (at least 6 chars)</label>
        <input type="password" id="vuePassword" name="password" placeholder="Passphrase" autocomplete="off" />
        <span id="passwordError" class="vue-error" role="alert">Password must be at least 6 characters.</span>
      </div>

      <button id="vueSubmitBtn" type="button" disabled>Register Account</button>
    </form>

    <div id="vueSuccess" role="status">
      <h3>Account Registered Successfully</h3>
      <p>Confirmation: <span id="vueRegId">VUE-REG-2026-4491</span></p>
    </div>
  </div>

  <script>
    const formValues = { username: '', email: '', password: '' };

    function validate() {
      let validCount = 0;
      const isUserValid = formValues.username.length >= 4;
      document.getElementById('usernameError').style.display = (formValues.username && !isUserValid) ? 'block' : 'none';
      if (isUserValid) validCount++;

      const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.email);
      document.getElementById('emailError').style.display = (formValues.email && !isEmailValid) ? 'block' : 'none';
      if (isEmailValid) validCount++;

      const isPassValid = formValues.password.length >= 6;
      document.getElementById('passwordError').style.display = (formValues.password && !isPassValid) ? 'block' : 'none';
      if (isPassValid) validCount++;

      const progress = (validCount / 3) * 100;
      document.getElementById('progressBar').style.width = progress + '%';

      const isValid = validCount === 3;
      document.getElementById('vueSubmitBtn').disabled = !isValid;
      return isValid;
    }

    document.getElementById('vueUsername').addEventListener('input', (e) => {
      formValues.username = e.target.value.trim();
      validate();
    });

    document.getElementById('vueEmail').addEventListener('input', (e) => {
      formValues.email = e.target.value.trim();
      validate();
    });

    document.getElementById('vuePassword').addEventListener('input', (e) => {
      formValues.password = e.target.value.trim();
      validate();
    });

    document.getElementById('vueSubmitBtn').addEventListener('click', () => {
      if (validate()) {
        document.getElementById('vueForm').style.display = 'none';
        document.getElementById('vueSuccess').style.display = 'block';
      }
    });
  </script>
</body>
</html>`
};
