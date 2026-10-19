/**
 * QA Lab Scenario 24: Ambiguous Fields
 * Form containing multiple pairs of confusingly similar fields in separate sections:
 * (Permanent Address vs Mailing Address, Applicant Phone vs Emergency Phone).
 */

export const scenario24 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-24-ambiguous-fields',
  scenarioNumber: 24,
  name: 'Ambiguous & Near-Duplicate Fields',
  description: 'Form containing near-identical field names situated in distinct sections (Permanent vs Mailing Address, Personal vs Emergency Phone).',
  category: 'AMBIGUITY_RESOLUTION',
  failureClass: 'NONE',
  breakMechanism: 'Naïve single-keyword matching maps applicant data into the wrong section or confuses emergency contact with applicant.',
  resilienceStrategy: 'Section-aware hierarchical semantic understanding resolves field groups and parent container context.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Ambiguous Fields</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 650px; margin: 0 auto; }
    fieldset { margin-bottom: 20px; padding: 15px; border: 1px solid #ccc; border-radius: 4px; }
    legend { font-weight: bold; color: #0066cc; }
    .form-group { margin-bottom: 12px; }
    label { display: block; margin-bottom: 4px; font-weight: bold; }
    input { width: 100%; padding: 8px; box-sizing: border-box; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
    #ambigSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Dual Address & Contact Form</h1>

  <form id="ambiguousForm">
    <!-- Section 1: Permanent Address -->
    <fieldset id="permanentAddressSection">
      <legend>Permanent Residential Address</legend>
      <div class="form-group">
        <label for="permStreet">Street Address</label>
        <input type="text" id="permStreet" name="permanent_street" placeholder="Permanent Street" required />
      </div>
      <div class="form-group">
        <label for="permPincode">Postal / PIN Code</label>
        <input type="text" id="permPincode" name="permanent_pincode" placeholder="560001" required />
      </div>
    </fieldset>

    <!-- Section 2: Mailing Address -->
    <fieldset id="mailingAddressSection">
      <legend>Mailing / Correspondence Address</legend>
      <div class="form-group">
        <label for="mailStreet">Street Address</label>
        <input type="text" id="mailStreet" name="mailing_street" placeholder="Current Mailing Street" required />
      </div>
      <div class="form-group">
        <label for="mailPincode">Postal / PIN Code</label>
        <input type="text" id="mailPincode" name="mailing_pincode" placeholder="110001" required />
      </div>
    </fieldset>

    <!-- Section 3: Contact Details -->
    <fieldset id="phoneNumbersSection">
      <legend>Telecommunication Numbers</legend>
      <div class="form-group">
        <label for="applicantPhone">Applicant Personal Mobile</label>
        <input type="tel" id="applicantPhone" name="applicant_phone" placeholder="9876543210" required />
      </div>
      <div class="form-group">
        <label for="emergencyPhone">Emergency Contact Mobile</label>
        <input type="tel" id="emergencyPhone" name="emergency_phone" placeholder="9123456789" required />
      </div>
    </fieldset>

    <button type="submit" id="submitAmbigBtn">Submit Addresses & Contacts</button>
  </form>

  <div id="ambigSuccess">
    <h3>Submitted with Clean Disambiguation!</h3>
    <p>Permanent Street: <strong id="outPermStreet"></strong></p>
    <p>Mailing Street: <strong id="outMailStreet"></strong></p>
    <p>Applicant Mobile: <strong id="outAppPhone"></strong></p>
    <p>Emergency Mobile: <strong id="outEmgPhone"></strong></p>
  </div>

  <script>
    document.getElementById('ambiguousForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('ambiguousForm').style.display = 'none';
      document.getElementById('outPermStreet').innerText = document.getElementById('permStreet').value;
      document.getElementById('outMailStreet').innerText = document.getElementById('mailStreet').value;
      document.getElementById('outAppPhone').innerText = document.getElementById('applicantPhone').value;
      document.getElementById('outEmgPhone').innerText = document.getElementById('emergencyPhone').value;
      document.getElementById('ambigSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
