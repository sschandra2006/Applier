/**
 * QA Lab Scenario 06: Dynamic Dropdown
 * Cascading dropdowns where selecting a parent option triggers an async
 * network-like fetch to populate dependent child dropdowns.
 */

export const scenario06 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-06-dynamic-dropdown',
  scenarioNumber: 6,
  name: 'Dynamic Cascading Dropdown',
  description: 'Dependent select controls (Country -> State -> City) populated asynchronously after parent selection.',
  category: 'DYNAMIC_UI',
  failureClass: 'NONE',
  breakMechanism: 'Breaks automations that attempt to select child options immediately before async population completes.',
  resilienceStrategy: 'Awaiting network/DOM mutations and verifying option population before executing child select actions.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Dynamic Dropdown</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    select { width: 100%; padding: 8px; box-sizing: border-box; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; }
    #geoSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
    .spinner { display: none; color: #666; font-size: 12px; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>Location Verification Portal</h1>

  <form id="dynamicDropdownForm">
    <div class="form-group">
      <label for="countrySelect">Country</label>
      <select id="countrySelect" name="country" required>
        <option value="">-- Choose Country --</option>
        <option value="IN">India</option>
        <option value="US">United States</option>
        <option value="CA">Canada</option>
      </select>
    </div>

    <div class="form-group">
      <label for="stateSelect">State / Province</label>
      <select id="stateSelect" name="state" disabled required>
        <option value="">-- Select Country First --</option>
      </select>
      <div id="stateLoading" class="spinner">Loading regions...</div>
    </div>

    <div class="form-group">
      <label for="citySelect">City / District</label>
      <select id="citySelect" name="city" disabled required>
        <option value="">-- Select State First --</option>
      </select>
    </div>

    <button type="submit" id="submitGeoBtn">Confirm Location</button>
  </form>

  <div id="geoSuccess">
    <h3>Location Successfully Verified!</h3>
    <p>Selected: <strong id="geoSummary"></strong></p>
  </div>

  <script>
    const dataMap = {
      IN: {
        KA: { name: 'Karnataka', cities: ['Bengaluru', 'Mysuru', 'Hubballi'] },
        MH: { name: 'Maharashtra', cities: ['Mumbai', 'Pune', 'Nagpur'] }
      },
      US: {
        CA: { name: 'California', cities: ['San Francisco', 'Los Angeles', 'San Diego'] },
        NY: { name: 'New York', cities: ['New York City', 'Buffalo', 'Albany'] }
      },
      CA: {
        ON: { name: 'Ontario', cities: ['Toronto', 'Ottawa'] }
      }
    };

    const countrySel = document.getElementById('countrySelect');
    const stateSel = document.getElementById('stateSelect');
    const citySel = document.getElementById('citySelect');
    const stateLoading = document.getElementById('stateLoading');

    countrySel.addEventListener('change', () => {
      const country = countrySel.value;
      stateSel.innerHTML = '<option value="">-- Choose State --</option>';
      citySel.innerHTML = '<option value="">-- Select State First --</option>';
      citySel.disabled = true;

      if (!country || !dataMap[country]) {
        stateSel.disabled = true;
        return;
      }

      stateLoading.style.display = 'block';
      stateSel.disabled = true;

      // Simulate async network latency
      setTimeout(() => {
        stateLoading.style.display = 'none';
        const states = dataMap[country];
        for (const [code, info] of Object.entries(states)) {
          const opt = document.createElement('option');
          opt.value = code;
          opt.textContent = info.name;
          stateSel.appendChild(opt);
        }
        stateSel.disabled = false;
      }, 150);
    });

    stateSel.addEventListener('change', () => {
      const country = countrySel.value;
      const state = stateSel.value;
      citySel.innerHTML = '<option value="">-- Choose City --</option>';

      if (!state || !dataMap[country] || !dataMap[country][state]) {
        citySel.disabled = true;
        return;
      }

      const cities = dataMap[country][state].cities;
      for (const city of cities) {
        const opt = document.createElement('option');
        opt.value = city;
        opt.textContent = city;
        citySel.appendChild(opt);
      }
      citySel.disabled = false;
    });

    document.getElementById('dynamicDropdownForm').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('dynamicDropdownForm').style.display = 'none';
      document.getElementById('geoSummary').innerText = countrySel.value + ' > ' + stateSel.value + ' > ' + citySel.value;
      document.getElementById('geoSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
