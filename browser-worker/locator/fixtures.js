/**
 * Runtime Semantic Locator Test Fixtures
 * Applier 2.0 — Phase 9
 *
 * Provides real DOM HTML fixtures covering all 8 required resolution scenarios:
 * 1. normal label
 * 2. different label (synonym / different wording)
 * 3. custom input (contenteditable, role="textbox", ARIA)
 * 4. custom dropdown (role="combobox", ARIA listbox)
 * 5. React form (controlled wrappers, data-testid)
 * 6. dynamic IDs (auto-generated random/hash IDs)
 * 7. nested elements (deep fieldsets, tables, cards)
 * 8. iframe (nested frame document traversal)
 */

export const normalLabelHtml = `
<!DOCTYPE html>
<html>
<head><title>Normal Label Form</title></head>
<body>
  <form id="portal-form">
    <div class="form-group">
      <label for="applicant_full_name">Full Name</label>
      <input id="applicant_full_name" type="text" name="fullName" autocomplete="name" placeholder="Enter your full name" />
    </div>
    <div class="form-group">
      <label for="applicant_email">Email Address</label>
      <input id="applicant_email" type="email" name="email" autocomplete="email" placeholder="name@example.com" />
    </div>
  </form>
</body>
</html>
`;

export const differentLabelHtml = `
<!DOCTYPE html>
<html>
<head><title>Different Label Form</title></head>
<body>
  <form id="portal-form-synonym">
    <div class="form-group">
      <label for="legal_cand_name">Candidate's Legal Name as in Record</label>
      <input id="legal_cand_name" type="text" name="txt_cand_name" placeholder="Official legal name" />
    </div>
    <div class="form-group">
      <label for="comm_mobile">Mobile Contact Number (10 digits)</label>
      <input id="comm_mobile" type="tel" name="mob_no" placeholder="9876543210" />
    </div>
  </form>
</body>
</html>
`;

export const customInputHtml = `
<!DOCTYPE html>
<html>
<head><title>Custom Input Form</title></head>
<body>
  <div class="custom-portal">
    <div class="field-container">
      <span id="lbl_email">Email Address</span>
      <div id="custom_email_input"
           role="textbox"
           aria-labelledby="lbl_email"
           contenteditable="true"
           tabindex="0"
           class="custom-editable-field"
           data-field-type="email"></div>
    </div>
    <div class="field-container">
      <div role="textbox"
           aria-label="Annual Family Income"
           contenteditable="true"
           class="custom-income-field"></div>
    </div>
  </div>
</body>
</html>
`;

export const customDropdownHtml = `
<!DOCTYPE html>
<html>
<head><title>Custom Dropdown Form</title></head>
<body>
  <div class="dropdown-portal">
    <div class="form-group">
      <span id="gender_label">Gender</span>
      <div id="custom-gender-select"
           role="combobox"
           aria-labelledby="gender_label"
           aria-expanded="false"
           tabindex="0"
           class="custom-select-trigger">
        Select Gender
      </div>
      <div id="gender-listbox" role="listbox" style="display:none">
        <div role="option" data-value="MALE" aria-selected="false">Male</div>
        <div role="option" data-value="FEMALE" aria-selected="false">Female</div>
        <div role="option" data-value="OTHER" aria-selected="false">Other</div>
      </div>
    </div>
  </div>
</body>
</html>
`;

export const reactFormHtml = `
<!DOCTYPE html>
<html>
<head><title>React Controlled Form</title></head>
<body>
  <div id="root" data-reactroot="">
    <div class="react-form-container">
      <div class="input-wrapper">
        <label for="react-phone">Mobile Phone</label>
        <input id="react-phone"
               type="tel"
               data-testid="input-applicant-phone"
               autocomplete="tel"
               placeholder="Enter 10-digit number" />
      </div>
      <div class="input-wrapper">
        <label for="react-college">College / University Name</label>
        <input id="react-college"
               type="text"
               data-testid="input-education-college"
               placeholder="Institute Name" />
      </div>
    </div>
  </div>
</body>
</html>
`;

export const dynamicIdsHtml = `
<!DOCTYPE html>
<html>
<head><title>Dynamic IDs Form</title></head>
<body>
  <form id="form_dyn_app">
    <!-- Unstable, dynamically generated random IDs & classes -->
    <div class="fld_css_x89a1">
      <label for="dyn_:r1:">Date of Birth</label>
      <input id="dyn_:r1:"
             name="gen_fld_837492_dob"
             type="date"
             autocomplete="bday"
             placeholder="DD/MM/YYYY" />
    </div>
    <div class="fld_css_y72b3">
      <label for="dyn_guid_4f3a_99">Aadhaar Number</label>
      <input id="dyn_guid_4f3a_99"
             name="gen_uid_4429"
             type="text"
             placeholder="12-digit Aadhaar" />
    </div>
  </form>
</body>
</html>
`;

export const nestedElementsHtml = `
<!DOCTYPE html>
<html>
<head><title>Nested Elements Form</title></head>
<body>
  <div class="container-fluid">
    <div class="card">
      <fieldset class="outer-fieldset">
        <legend>Parent / Guardian Particulars</legend>
        <div class="card-body">
          <table class="data-table">
            <tbody>
              <tr>
                <td>
                  <div class="nested-wrapper">
                    <label for="nested_father_name">Father's Full Name</label>
                    <span class="input-border">
                      <input id="nested_father_name" type="text" name="father_name" placeholder="Father's Name" />
                    </span>
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <div class="nested-wrapper">
                    <label for="nested_mother_name">Mother's Full Name</label>
                    <span class="input-border">
                      <input id="nested_mother_name" type="text" name="mother_name" placeholder="Mother's Name" />
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>
  </div>
</body>
</html>
`;

export const iframeHtml = `
<!DOCTYPE html>
<html>
<head><title>Iframe Container Page</title></head>
<body>
  <div class="portal-header">
    <h1>Scholarship Application System</h1>
  </div>
  <div class="frame-container">
    <iframe id="application-iframe"
            name="app_frame"
            srcdoc="<!DOCTYPE html><html><body><form id='inner-form'><div class='form-group'><label for='iframe_dob'>Date of Birth</label><input id='iframe_dob' type='date' name='dob' autocomplete='bday' /></div><div class='form-group'><label for='iframe_pincode'>Pincode / Postal Code</label><input id='iframe_pincode' type='text' name='pincode' autocomplete='postal-code' /></div></form></body></html>"
            style="width: 100%; height: 500px; border: 1px solid #ccc;">
    </iframe>
  </div>
</body>
</html>
`;
