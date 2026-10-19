/**
 * QA Lab Scenario 23: Missing Labels
 * Form with zero <label> tags, zero 'for' attributes, and zero 'aria-label' markup,
 * testing placeholder and surrounding context resolution.
 */

export const scenario23 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-23-missing-labels',
  scenarioNumber: 23,
  name: 'Unlabeled Fields Without Semantic Markup',
  description: 'Unlabeled input fields with no <label> or aria-label attributes, relying strictly on placeholders and icon context.',
  category: 'AMBIGUITY_RESOLUTION',
  failureClass: 'ELEMENT_MISSING',
  breakMechanism: 'Breaks label-based query strategies (getByLabel returns 0 matches).',
  resilienceStrategy: 'Runtime locator resolver prioritizes placeholder matching and preceding text context.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Missing Labels</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; }
    .input-row { display: flex; align-items: center; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px; padding: 5px 10px; }
    .icon { font-size: 18px; margin-right: 10px; color: #666; }
    input { border: none; outline: none; width: 100%; font-size: 14px; padding: 6px; }
    button { width: 100%; padding: 10px; background: #0066cc; color: white; border: none; cursor: pointer; border-radius: 4px; }
    #unlabeledSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Quick Profile Registration</h1>
  <p style="color:#666; font-size:13px;">Please complete the form below:</p>

  <form id="unlabeledForm">
    <!-- No <label> element anywhere -->
    <div class="input-row">
      <span class="icon">&#128100;</span>
      <input type="text" name="u_name" placeholder="Full legal name" required />
    </div>

    <div class="input-row">
      <span class="icon">&#9993;</span>
      <input type="email" name="u_email" placeholder="applicant@domain.com" required />
    </div>

    <div class="input-row">
      <span class="icon">&#128222;</span>
      <input type="tel" name="u_phone" placeholder="10-digit mobile number" required />
    </div>

    <button type="submit" id="unlabeledSubmitBtn">Submit Information</button>
  </form>

  <div id="unlabeledSuccess">
    <h3>Information Submitted Successfully!</h3>
    <p>Values recorded from contextual placeholders.</p>
  </div>

  <script>
    document.getElementById('unlabeledForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('unlabeledForm').style.display = 'none';
      document.getElementById('unlabeledSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
