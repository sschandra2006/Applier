/**
 * QA Lab Scenario 08: Custom Select
 * Fully non-native custom dropdown constructed of div/button with
 * ARIA combobox and listbox roles, containing zero native <select> elements.
 */

export const scenario08 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-08-custom-select',
  scenarioNumber: 8,
  name: 'Non-Native Custom ARIA Select',
  description: 'Custom dropdown component using ARIA combobox and listbox options with no native HTML <select> tag in the DOM.',
  category: 'DYNAMIC_UI',
  failureClass: 'NONE',
  breakMechanism: 'Breaks automations looking strictly for <select> elements or attempting native selectOption() methods.',
  resilienceStrategy: 'Observation engine extracts ARIA comboboxes and listboxes as candidate dropdown options; triggers click on trigger and option.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Custom Select</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    .custom-select-wrapper { position: relative; width: 100%; user-select: none; }
    .custom-select-trigger {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px; border: 1px solid #ccc; background: #fff; cursor: pointer; border-radius: 4px;
    }
    .custom-select-options {
      position: absolute; top: 100%; left: 0; right: 0; background: white;
      border: 1px solid #ccc; border-radius: 4px; margin-top: 4px; max-height: 200px;
      overflow-y: auto; display: none; z-index: 50; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .custom-select-options.open { display: block; }
    .custom-option { padding: 10px; cursor: pointer; }
    .custom-option:hover, .custom-option.selected { background: #f0f4f8; color: #0066cc; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; border-radius: 4px; }
    #customSelectSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Candidate Profile Configuration</h1>

  <form id="customSelectForm">
    <div class="form-group">
      <label id="trackLabel">Specialization Track</label>
      <div class="custom-select-wrapper">
        <div
          id="customTrackTrigger"
          class="custom-select-trigger"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-labelledby="trackLabel"
          tabindex="0"
        >
          <span id="customTrackValue">Select a specialization...</span>
          <span class="arrow">&darr;</span>
        </div>

        <div id="customTrackOptions" class="custom-select-options" role="listbox" aria-labelledby="trackLabel">
          <div class="custom-option" role="option" data-value="ai_ml">Artificial Intelligence & Machine Learning</div>
          <div class="custom-option" role="option" data-value="cloud_devops">Cloud Infrastructure & DevOps</div>
          <div class="custom-option" role="option" data-value="cybersecurity">Information Security & Cryptography</div>
          <div class="custom-option" role="option" data-value="data_eng">Large-Scale Data Engineering</div>
        </div>
      </div>
      <input type="hidden" id="selectedTrackHidden" name="specializationTrack" value="" />
    </div>

    <button type="submit" id="submitTrackBtn">Save Preference</button>
  </form>

  <div id="customSelectSuccess">
    <h3>Preference Saved!</h3>
    <p>Selected Track: <strong id="savedTrackName"></strong> (Code: <span id="savedTrackCode"></span>)</p>
  </div>

  <script>
    const trigger = document.getElementById('customTrackTrigger');
    const optionsPanel = document.getElementById('customTrackOptions');
    const valueDisplay = document.getElementById('customTrackValue');
    const hiddenInput = document.getElementById('selectedTrackHidden');

    trigger.addEventListener('click', () => {
      const isOpen = optionsPanel.classList.toggle('open');
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    optionsPanel.querySelectorAll('.custom-option').forEach(opt => {
      opt.addEventListener('click', () => {
        optionsPanel.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        valueDisplay.innerText = opt.innerText;
        hiddenInput.value = opt.dataset.value;
        optionsPanel.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      });
    });

    document.getElementById('customSelectForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!hiddenInput.value) {
        alert('Please select a specialization track.');
        return;
      }
      document.getElementById('customSelectForm').style.display = 'none';
      document.getElementById('savedTrackName').innerText = valueDisplay.innerText;
      document.getElementById('savedTrackCode').innerText = hiddenInput.value;
      document.getElementById('customSelectSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
