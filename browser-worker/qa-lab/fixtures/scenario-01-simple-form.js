/**
 * QA Lab Scenario 01: Simple HTML Form
 * Standard native HTML form with common inputs, selects, radios, checkboxes, and validation.
 */

export const scenario01 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-01-simple-form',
  scenarioNumber: 1,
  name: 'Simple HTML Form',
  description: 'Standard native HTML form with standard input types, native select, radio buttons, checkboxes, and synchronous submission.',
  category: 'FORM_PARSING',
  failureClass: 'NONE',
  breakMechanism: 'Baseline benchmark form — verifies zero false-positives on standard semantic HTML.',
  resilienceStrategy: 'Direct semantic element resolution, standard fill actions, and native form submission.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End', 'Load'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Simple HTML Form</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input[type="text"], input[type="email"], input[type="tel"], select, textarea {
      width: 100%; padding: 8px; box-sizing: border-box;
    }
    .radio-group, .checkbox-group { display: flex; gap: 15px; margin-top: 5px; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; }
    #confirmationBox { display: none; margin-top: 20px; padding: 15px; background: #e6ffe6; border: 1px solid #00aa00; }
  </style>
</head>
<body>
  <h1>Scholarship Application Portal</h1>
  <form id="simpleApplicationForm" action="/api/apply" method="POST">
    <div class="form-group">
      <label for="fullName">Full Name</label>
      <input type="text" id="fullName" name="fullName" placeholder="Enter your full legal name" required />
    </div>

    <div class="form-group">
      <label for="email">Email Address</label>
      <input type="email" id="email" name="email" placeholder="applicant@example.com" required />
    </div>

    <div class="form-group">
      <label for="phoneNumber">Mobile Phone Number</label>
      <input type="tel" id="phoneNumber" name="phoneNumber" placeholder="9876543210" required />
    </div>

    <div class="form-group">
      <label for="educationLevel">Highest Education Level</label>
      <select id="educationLevel" name="educationLevel" required>
        <option value="">Select education level...</option>
        <option value="high_school">High School Diploma</option>
        <option value="undergraduate" selected>Undergraduate Degree</option>
        <option value="postgraduate">Postgraduate Degree</option>
        <option value="doctorate">Doctorate / PhD</option>
      </select>
    </div>

    <div class="form-group">
      <label>Citizenship Status</label>
      <div class="radio-group">
        <label><input type="radio" name="citizenship" value="citizen" checked /> Citizen</label>
        <label><input type="radio" name="citizenship" value="permanent_resident" /> Permanent Resident</label>
        <label><input type="radio" name="citizenship" value="international" /> International</label>
      </div>
    </div>

    <div class="form-group">
      <label for="notes">Statement of Purpose</label>
      <textarea id="notes" name="notes" rows="4" placeholder="Briefly state your academic objectives..."></textarea>
    </div>

    <div class="form-group">
      <div class="checkbox-group">
        <label><input type="checkbox" id="agreeTerms" name="agreeTerms" required checked /> I declare that all provided details are true and accurate</label>
      </div>
    </div>

    <button type="submit" id="submitBtn">Submit Application</button>
  </form>

  <div id="confirmationBox" role="status">
    <h2>Application Submitted Successfully</h2>
    <p>Reference ID: <strong id="refId">APP-2026-0001</strong></p>
    <p>Thank you for submitting your scholarship application.</p>
  </div>

  <script>
    document.getElementById('simpleApplicationForm').addEventListener('submit', function(e) {
      e.preventDefault();
      document.getElementById('simpleApplicationForm').style.display = 'none';
      const conf = document.getElementById('confirmationBox');
      conf.style.display = 'block';
    });
  </script>
</body>
</html>`
};
