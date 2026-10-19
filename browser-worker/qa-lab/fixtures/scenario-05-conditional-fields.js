/**
 * QA Lab Scenario 05: Conditional Fields
 * Dynamic branching forms where selecting radio options or checkboxes
 * conditionally reveals extra required inputs into the DOM.
 */

export const scenario05 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-05-conditional-fields',
  scenarioNumber: 5,
  name: 'Conditional Branching Fields',
  description: 'Form containing conditional sections that dynamically mount or display based on preceding user selections.',
  category: 'DYNAMIC_UI',
  failureClass: 'NONE',
  breakMechanism: 'Breaks static form analyzers that map fields prior to triggering conditional dependencies.',
  resilienceStrategy: 'Interleaved observe-fill loops that re-observe the page after triggering interactive selections.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Conditional Fields</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input, select, textarea { width: 100%; padding: 8px; box-sizing: border-box; }
    .conditional-panel { display: none; background: #f4f8fa; padding: 15px; border-left: 4px solid #0066cc; margin-top: 10px; margin-bottom: 15px; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; }
    #conditionalSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Job Application Questionnaire</h1>

  <form id="conditionalForm">
    <div class="form-group">
      <label for="applicantName">Applicant Name</label>
      <input type="text" id="applicantName" name="applicantName" required />
    </div>

    <!-- Branch 1: Prior Employment -->
    <div class="form-group">
      <label>Have you previously worked at this organization?</label>
      <div style="display: flex; gap: 20px;">
        <label><input type="radio" name="hasPriorWork" value="yes" id="priorWorkYes" /> Yes</label>
        <label><input type="radio" name="hasPriorWork" value="no" id="priorWorkNo" checked /> No</label>
      </div>

      <div id="priorWorkSection" class="conditional-panel">
        <div class="form-group">
          <label for="prevEmployeeId">Previous Employee ID</label>
          <input type="text" id="prevEmployeeId" name="prevEmployeeId" placeholder="EMP-12345" />
        </div>
        <div class="form-group">
          <label for="prevDepartment">Previous Department</label>
          <input type="text" id="prevDepartment" name="prevDepartment" placeholder="e.g. Engineering" />
        </div>
      </div>
    </div>

    <!-- Branch 2: Accommodations -->
    <div class="form-group">
      <label><input type="checkbox" id="needsAccommodationCheck" name="needsAccommodation" /> Do you require special accommodations for the interview?</label>

      <div id="accommodationSection" class="conditional-panel">
        <label for="accommodationDetails">Please describe the requested accommodations</label>
        <textarea id="accommodationDetails" name="accommodationDetails" rows="3"></textarea>
      </div>
    </div>

    <button type="submit" id="submitConditionalBtn">Submit Application</button>
  </form>

  <div id="conditionalSuccess">
    <h3>Application Submitted with Conditional Details!</h3>
    <p>Status: <span id="condStatus">RECORDED</span></p>
  </div>

  <script>
    const priorWorkYes = document.getElementById('priorWorkYes');
    const priorWorkNo = document.getElementById('priorWorkNo');
    const priorWorkSection = document.getElementById('priorWorkSection');
    const needsAccCheck = document.getElementById('needsAccommodationCheck');
    const accSection = document.getElementById('accommodationSection');

    function updateConditions() {
      priorWorkSection.style.display = priorWorkYes.checked ? 'block' : 'none';
      accSection.style.display = needsAccCheck.checked ? 'block' : 'none';
    }

    priorWorkYes.addEventListener('change', updateConditions);
    priorWorkNo.addEventListener('change', updateConditions);
    needsAccCheck.addEventListener('change', updateConditions);

    document.getElementById('conditionalForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('conditionalForm').style.display = 'none';
      document.getElementById('conditionalSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
