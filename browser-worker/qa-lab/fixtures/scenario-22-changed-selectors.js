/**
 * QA Lab Scenario 22: Changed Selectors
 * Anti-scraping / A-B test DOM where static IDs and CSS classes dynamically mutate
 * after initial load, breaking static selectors while semantic locators remain resilient.
 */

export const scenario22 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-22-changed-selectors',
  scenarioNumber: 22,
  name: 'Dynamic Mutating DOM Selectors',
  description: 'Simulates portals that randomly rewrite HTML element IDs and CSS class names after initial page load to obstruct brittle scraping.',
  category: 'DYNAMIC_UI',
  failureClass: 'SELECTOR_FAILURE',
  breakMechanism: 'Hardcoded CSS ID/class selectors (e.g. #applicant_name_v1) break completely as attributes mutate.',
  resilienceStrategy: 'Runtime semantic locator resolver relies on accessible roles, labels, and semantic context rather than static CSS IDs.',
  testLevels: ['Unit', 'Integration', 'Browser', 'Recovery', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Mutating Selectors</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
    #dynSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Dynamic Adaptive Application</h1>

  <form id="mutatingForm">
    <div class="form-group">
      <label for="initialNameId" id="nameLabel">Full Legal Name</label>
      <input
        type="text"
        id="initialNameId"
        name="initial_name_field"
        class="static-class-v1"
        placeholder="Enter your full legal name"
        aria-labelledby="nameLabel"
        required
      />
    </div>

    <div class="form-group">
      <label for="initialEmailId" id="emailLabel">Primary Email</label>
      <input
        type="email"
        id="initialEmailId"
        name="initial_email_field"
        class="static-class-v1"
        placeholder="applicant@domain.com"
        aria-labelledby="emailLabel"
        required
      />
    </div>

    <button type="submit" id="initialSubmitBtn" class="btn-submit-v1">Submit Application</button>
  </form>

  <div id="dynSuccess">
    <h3>Submitted Successfully Despite Mutated Selectors!</h3>
    <p>Captured Values: <strong id="capturedValues"></strong></p>
  </div>

  <script>
    // Mutate IDs and class names dynamically after 150ms
    setTimeout(() => {
      const nameInput = document.querySelector('input[placeholder*="legal name"]');
      const emailInput = document.querySelector('input[placeholder*="applicant@domain.com"]');
      const submitBtn = document.querySelector('button[type="submit"]');

      if (nameInput) {
        nameInput.id = 'obfuscated_name_' + Math.random().toString(36).substring(2, 8);
        nameInput.className = 'scrambled_cls_' + Math.random().toString(36).substring(2, 8);
        document.getElementById('nameLabel').setAttribute('for', nameInput.id);
      }
      if (emailInput) {
        emailInput.id = 'obfuscated_email_' + Math.random().toString(36).substring(2, 8);
        emailInput.className = 'scrambled_cls_' + Math.random().toString(36).substring(2, 8);
        document.getElementById('emailLabel').setAttribute('for', emailInput.id);
      }
      if (submitBtn) {
        submitBtn.id = 'obfuscated_btn_' + Math.random().toString(36).substring(2, 8);
        submitBtn.className = 'scrambled_btn_' + Math.random().toString(36).substring(2, 8);
      }
    }, 150);

    document.getElementById('mutatingForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.querySelector('input[placeholder*="legal name"]').value;
      const email = document.querySelector('input[placeholder*="applicant@domain.com"]').value;
      document.getElementById('mutatingForm').style.display = 'none';
      document.getElementById('capturedValues').innerText = name + ' (' + email + ')';
      document.getElementById('dynSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
