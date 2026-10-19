/**
 * QA Lab Scenario 04: Multi-page Wizard
 * Form split across multiple sequential steps with validation guards,
 * progress tabs, forward/backward navigation, and state preservation.
 */

export const scenario04 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-04-multipage-wizard',
  scenarioNumber: 4,
  name: 'Multi-page Application Wizard',
  description: 'Sequential 3-step wizard (Personal -> Academic -> Review) requiring inter-step navigation and maintaining input state across step transitions.',
  category: 'DYNAMIC_UI',
  failureClass: 'NONE',
  breakMechanism: 'Breaks automations assuming all fields exist on a single DOM page or that fail to step through sequential screens.',
  resilienceStrategy: 'Multi-step workflow planning, dynamic stage observation, and state persistence between pages.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Multi-page Wizard</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .step-indicator { display: flex; justify-content: space-between; margin-bottom: 25px; }
    .step-badge { padding: 8px 12px; border-radius: 4px; background: #eee; font-weight: bold; }
    .step-badge.active { background: #0066cc; color: white; }
    .wizard-step { display: none; }
    .wizard-step.active { display: block; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input, select { width: 100%; padding: 8px; box-sizing: border-box; }
    .btn-group { display: flex; justify-content: space-between; margin-top: 20px; }
    button { padding: 10px 20px; cursor: pointer; border: none; font-weight: bold; }
    .btn-primary { background: #0066cc; color: white; }
    .btn-secondary { background: #e0e0e0; color: #333; }
    #wizardCompleted { display: none; padding: 20px; background: #e6ffe6; border: 1px solid green; }
    .review-item { margin-bottom: 8px; }
  </style>
</head>
<body>
  <h1>Scholarship Application Wizard</h1>

  <div class="step-indicator">
    <div id="badgeStep1" class="step-badge active">1. Personal</div>
    <div id="badgeStep2" class="step-badge">2. Academic</div>
    <div id="badgeStep3" class="step-badge">3. Review</div>
  </div>

  <form id="wizardForm">
    <!-- Step 1: Personal Profile -->
    <div id="step1" class="wizard-step active">
      <h3>Step 1: Personal Details</h3>
      <div class="form-group">
        <label for="wizardFirstName">First Name</label>
        <input type="text" id="wizardFirstName" name="firstName" placeholder="First Name" required />
      </div>
      <div class="form-group">
        <label for="wizardLastName">Last Name</label>
        <input type="text" id="wizardLastName" name="lastName" placeholder="Last Name" required />
      </div>
      <div class="form-group">
        <label for="wizardEmail">Contact Email</label>
        <input type="email" id="wizardEmail" name="email" placeholder="email@domain.com" required />
      </div>
      <div class="btn-group">
        <div></div>
        <button type="button" id="nextToStep2" class="btn-primary">Next: Academic Details &rarr;</button>
      </div>
    </div>

    <!-- Step 2: Academic Details -->
    <div id="step2" class="wizard-step">
      <h3>Step 2: Academic Background</h3>
      <div class="form-group">
        <label for="wizardDegree">Current Degree</label>
        <select id="wizardDegree" name="degree">
          <option value="B.Tech" selected>Bachelor of Technology</option>
          <option value="B.Sc">Bachelor of Science</option>
          <option value="M.Tech">Master of Technology</option>
        </select>
      </div>
      <div class="form-group">
        <label for="wizardUniversity">University Name</label>
        <input type="text" id="wizardUniversity" name="university" placeholder="Enter university" required />
      </div>
      <div class="form-group">
        <label for="wizardGradYear">Graduation Year</label>
        <input type="number" id="wizardGradYear" name="gradYear" value="2026" required />
      </div>
      <div class="btn-group">
        <button type="button" id="prevToStep1" class="btn-secondary">&larr; Back</button>
        <button type="button" id="nextToStep3" class="btn-primary">Next: Review &rarr;</button>
      </div>
    </div>

    <!-- Step 3: Review & Submit -->
    <div id="step3" class="wizard-step">
      <h3>Step 3: Review Application Summary</h3>
      <div class="review-box" style="background:#f9f9f9; padding:15px; margin-bottom:20px;">
        <div class="review-item"><strong>Full Name:</strong> <span id="revName"></span></div>
        <div class="review-item"><strong>Email:</strong> <span id="revEmail"></span></div>
        <div class="review-item"><strong>Degree:</strong> <span id="revDegree"></span></div>
        <div class="review-item"><strong>University:</strong> <span id="revUniv"></span></div>
        <div class="review-item"><strong>Graduation Year:</strong> <span id="revYear"></span></div>
      </div>
      <div class="btn-group">
        <button type="button" id="prevToStep2" class="btn-secondary">&larr; Back</button>
        <button type="button" id="submitWizardBtn" class="btn-primary">Confirm & Submit Application</button>
      </div>
    </div>
  </form>

  <div id="wizardCompleted">
    <h2>Application Successfully Completed!</h2>
    <p>Application ID: <strong id="wizardRefNum">WIZ-2026-9931</strong></p>
  </div>

  <script>
    let currentStep = 1;

    function showStep(step) {
      currentStep = step;
      document.querySelectorAll('.wizard-step').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.step-badge').forEach(el => el.classList.remove('active'));

      document.getElementById('step' + step).classList.add('active');
      document.getElementById('badgeStep' + step).classList.add('active');

      if (step === 3) {
        document.getElementById('revName').innerText = document.getElementById('wizardFirstName').value + ' ' + document.getElementById('wizardLastName').value;
        document.getElementById('revEmail').innerText = document.getElementById('wizardEmail').value;
        document.getElementById('revDegree').innerText = document.getElementById('wizardDegree').value;
        document.getElementById('revUniv').innerText = document.getElementById('wizardUniversity').value;
        document.getElementById('revYear').innerText = document.getElementById('wizardGradYear').value;
      }
    }

    document.getElementById('nextToStep2').addEventListener('click', () => {
      const fName = document.getElementById('wizardFirstName').value.trim();
      const email = document.getElementById('wizardEmail').value.trim();
      if (!fName || !email) {
        alert('Please fill out Step 1 fields before proceeding.');
        return;
      }
      showStep(2);
    });

    document.getElementById('prevToStep1').addEventListener('click', () => showStep(1));

    document.getElementById('nextToStep3').addEventListener('click', () => {
      const univ = document.getElementById('wizardUniversity').value.trim();
      if (!univ) {
        alert('Please enter your university.');
        return;
      }
      showStep(3);
    });

    document.getElementById('prevToStep2').addEventListener('click', () => showStep(2));

    document.getElementById('submitWizardBtn').addEventListener('click', () => {
      document.getElementById('wizardForm').style.display = 'none';
      document.querySelector('.step-indicator').style.display = 'none';
      document.getElementById('wizardCompleted').style.display = 'block';
    });
  </script>
</body>
</html>`
};
