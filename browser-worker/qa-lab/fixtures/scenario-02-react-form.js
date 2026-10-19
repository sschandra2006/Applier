/**
 * QA Lab Scenario 02: React Form
 * Emulates React 18 SPA controlled components with synthetic event requirements,
 * data-testid attributes, ARIA roles, and controlled state rendering.
 */

export const scenario02 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-02-react-form',
  scenarioNumber: 2,
  name: 'React Controlled Form',
  description: 'React 18 SPA emulation where inputs are strictly controlled; values only commit when real input/change events are triggered.',
  category: 'SPA_FRAMEWORK',
  failureClass: 'NONE',
  breakMechanism: 'Breaks naive DOM value assignment (.value = ...) that fails to trigger React synthetic event dispatchers.',
  resilienceStrategy: 'Playwright locator.fill() which naturally dispatches input and change events, triggering React state updates.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: React Form</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input, select { width: 100%; padding: 8px; box-sizing: border-box; }
    .state-badge { background: #f0f0f0; padding: 10px; margin-top: 20px; font-family: monospace; font-size: 12px; }
    button { padding: 10px 20px; background: #61dafb; color: #000; border: none; font-weight: bold; cursor: pointer; }
    #reactConfirmation { display: none; padding: 15px; background: #e6ffe6; border: 1px solid #00aa00; margin-top: 15px; }
  </style>
</head>
<body>
  <div id="root">
    <h1>React Candidate Portal</h1>
    <div data-testid="react-form-container" role="form" aria-label="Job Application Form">
      <div class="form-group">
        <label for="candidateName">Candidate Legal Name</label>
        <input
          id="candidateName"
          data-testid="input-candidate-name"
          name="candidateName"
          type="text"
          placeholder="e.g. Sarah Connor"
          autocomplete="off"
        />
      </div>

      <div class="form-group">
        <label for="candidateEmail">Primary Email</label>
        <input
          id="candidateEmail"
          data-testid="input-candidate-email"
          name="candidateEmail"
          type="email"
          placeholder="sarah@resistance.org"
          autocomplete="off"
        />
      </div>

      <div class="form-group">
        <label for="experienceLevel">Years of Relevant Experience</label>
        <select id="experienceLevel" data-testid="select-experience" name="experienceLevel">
          <option value="">Choose experience level...</option>
          <option value="junior">0 - 2 Years (Junior)</option>
          <option value="mid">3 - 5 Years (Mid-level)</option>
          <option value="senior">6+ Years (Senior)</option>
        </select>
      </div>

      <button id="reactSubmitBtn" data-testid="btn-react-submit" type="button">Submit Application</button>

      <div class="state-badge">
        <strong>React Synthetic State:</strong>
        <div id="stateViewer" data-testid="react-state-viewer">{"name":"","email":"","experience":""}</div>
      </div>

      <div id="reactConfirmation" data-testid="react-confirmation-box">
        <h3>Application Received</h3>
        <p>Reference: <span id="reactRefId">APP-REACT-2026-8819</span></p>
      </div>
    </div>
  </div>

  <script>
    // Emulate React 18 controlled component store
    const reactState = {
      name: '',
      email: '',
      experience: ''
    };

    function updateStateView() {
      document.getElementById('stateViewer').innerText = JSON.stringify(reactState);
    }

    const nameInput = document.getElementById('candidateName');
    nameInput.addEventListener('input', function(e) {
      reactState.name = e.target.value;
      updateStateView();
    });

    const emailInput = document.getElementById('candidateEmail');
    emailInput.addEventListener('input', function(e) {
      reactState.email = e.target.value;
      updateStateView();
    });

    const expSelect = document.getElementById('experienceLevel');
    expSelect.addEventListener('change', function(e) {
      reactState.experience = e.target.value;
      updateStateView();
    });

    document.getElementById('reactSubmitBtn').addEventListener('click', function() {
      if (!reactState.name || !reactState.email) {
        alert('Validation Error: Form state is empty. Ensure change events were dispatched.');
        return;
      }
      document.getElementById('reactConfirmation').style.display = 'block';
    });
  </script>
</body>
</html>`
};
