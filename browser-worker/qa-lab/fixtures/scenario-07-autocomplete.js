/**
 * QA Lab Scenario 07: Autocomplete
 * Real-time asynchronous text filter that produces a floating suggestion
 * list requiring dynamic selection to populate hidden form tokens.
 */

export const scenario07 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-07-autocomplete',
  scenarioNumber: 7,
  name: 'Autocomplete Search Input',
  description: 'Search input that dynamically fetches and renders a floating listbox; clicking a suggestion populates input and hidden identifier.',
  category: 'DYNAMIC_UI',
  failureClass: 'NONE',
  breakMechanism: 'Breaks automations that merely fill text without clicking/selecting from the rendered suggestion listbox.',
  resilienceStrategy: 'Typing input, observing dynamic listbox appearance, and clicking the matching item to commit selection.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Autocomplete</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 15px; position: relative; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input[type="text"] { width: 100%; padding: 8px; box-sizing: border-box; }
    .suggestions-list {
      position: absolute; top: 100%; left: 0; right: 0; background: white;
      border: 1px solid #ccc; max-height: 150px; overflow-y: auto; list-style: none;
      padding: 0; margin: 0; display: none; z-index: 100;
    }
    .suggestions-list li { padding: 8px 12px; cursor: pointer; }
    .suggestions-list li:hover { background: #f0f4f8; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; }
    #univSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>University Search & Admission</h1>

  <form id="autocompleteForm">
    <div class="form-group">
      <label for="universitySearch">University / College</label>
      <input
        type="text"
        id="universitySearch"
        name="universitySearch"
        placeholder="Type university name (e.g. Stanford)..."
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="false"
      />
      <input type="hidden" id="selectedUniversityId" name="universityId" value="" />
      <ul id="universitySuggestions" class="suggestions-list" role="listbox"></ul>
    </div>

    <div class="form-group">
      <label for="studentMajor">Target Major</label>
      <input type="text" id="studentMajor" name="major" value="Computer Science" required />
    </div>

    <button type="submit" id="submitAutocompleteBtn">Submit Application</button>
  </form>

  <div id="univSuccess">
    <h3>University Application Submitted!</h3>
    <p>Target: <strong id="univSummary"></strong> (ID: <span id="univIdBadge"></span>)</p>
  </div>

  <script>
    const universities = [
      { id: 'UNI-001', name: 'Stanford University' },
      { id: 'UNI-002', name: 'Harvard University' },
      { id: 'UNI-003', name: 'Massachusetts Institute of Technology (MIT)' },
      { id: 'UNI-004', name: 'University of California, Berkeley' },
      { id: 'UNI-005', name: 'Carnegie Mellon University' }
    ];

    const searchInput = document.getElementById('universitySearch');
    const hiddenId = document.getElementById('selectedUniversityId');
    const suggestionsUl = document.getElementById('universitySuggestions');

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      suggestionsUl.innerHTML = '';

      if (query.length < 2) {
        suggestionsUl.style.display = 'none';
        searchInput.setAttribute('aria-expanded', 'false');
        return;
      }

      const matches = universities.filter(u => u.name.toLowerCase().includes(query));
      if (matches.length === 0) {
        suggestionsUl.style.display = 'none';
        searchInput.setAttribute('aria-expanded', 'false');
        return;
      }

      matches.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.name;
        li.setAttribute('role', 'option');
        li.dataset.id = item.id;
        li.addEventListener('click', () => {
          searchInput.value = item.name;
          hiddenId.value = item.id;
          suggestionsUl.style.display = 'none';
          searchInput.setAttribute('aria-expanded', 'false');
        });
        suggestionsUl.appendChild(li);
      });

      suggestionsUl.style.display = 'block';
      searchInput.setAttribute('aria-expanded', 'true');
    });

    document.getElementById('autocompleteForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!hiddenId.value) {
        alert('Please select a university from the suggestion list.');
        return;
      }
      document.getElementById('autocompleteForm').style.display = 'none';
      document.getElementById('univSummary').innerText = searchInput.value;
      document.getElementById('univIdBadge').innerText = hiddenId.value;
      document.getElementById('univSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
