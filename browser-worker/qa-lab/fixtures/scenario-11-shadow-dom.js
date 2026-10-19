/**
 * QA Lab Scenario 11: Shadow DOM
 * Custom Web Components encapsulating form inputs inside open Shadow Roots.
 */

export const scenario11 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-11-shadow-dom',
  scenarioNumber: 11,
  name: 'Encapsulated Shadow DOM Web Components',
  description: 'Custom elements hosting open shadow roots with encapsulated inputs and submit buttons invisible to shallow querySelector.',
  category: 'HIERARCHY_ISOLATION',
  failureClass: 'NONE',
  breakMechanism: 'Breaks automations that do not pierce shadow DOM boundaries; standard querySelector returns empty.',
  resilienceStrategy: 'Deep shadow root traversal in observation engine and Playwright shadow DOM piercing locators.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Shadow DOM</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
  </style>
</head>
<body>
  <h1>Custom Web Component Application</h1>

  <applicant-card id="applicantCardComponent"></applicant-card>

  <script>
    class ApplicantCard extends HTMLElement {
      connectedCallback() {
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.innerHTML = \`
          <style>
            :host { display: block; padding: 15px; border: 1px solid #ccc; border-radius: 6px; }
            .field-box { margin-bottom: 12px; }
            label { display: block; font-weight: bold; margin-bottom: 4px; }
            input { width: 90%; padding: 8px; }
            button { padding: 8px 16px; background: #673ab7; color: white; border: none; cursor: pointer; border-radius: 4px; }
            #shadowSuccess { display: none; margin-top: 10px; color: green; font-weight: bold; }
          </style>
          <div class="card-root">
            <h3>Shadow Root Profile Input</h3>
            <div class="field-box">
              <label for="shadowFullName">Candidate Full Legal Name</label>
              <input type="text" id="shadowFullName" name="fullName" placeholder="Legal full name" />
            </div>
            <div class="field-box">
              <label for="shadowPhone">Mobile Contact</label>
              <input type="tel" id="shadowPhone" name="phoneNumber" placeholder="9876543210" />
            </div>
            <button type="button" id="shadowSubmitBtn">Save In Shadow DOM</button>
            <div id="shadowSuccess">Saved within Shadow DOM boundary!</div>
          </div>
        \`;

        const btn = shadow.getElementById('shadowSubmitBtn');
        const nameInput = shadow.getElementById('shadowFullName');
        const successBox = shadow.getElementById('shadowSuccess');

        btn.addEventListener('click', () => {
          if (!nameInput.value.trim()) {
            alert('Name is required inside shadow component!');
            return;
          }
          successBox.style.display = 'block';
        });
      }
    }

    customElements.define('applicant-card', ApplicantCard);
  </script>
</body>
</html>`
};
