/**
 * Observation Test Fixtures
 * Applier 2.0 — Phase 4: Live Browser Observation Engine
 *
 * Provides standalone HTML test fixtures for comprehensive observation verification:
 * 1. Simple HTML Form
 * 2. React Form (SPA / data-testid / ARIA)
 * 3. Dynamic Form (DOM mutation via JS)
 * 4. Custom Dropdown (ARIA combobox & listbox options)
 * 5. File Input (Accept constraints & labels)
 * 6. Iframe (Nested frame hierarchy)
 * 7. Hidden Elements (display:none, visibility:hidden, opacity:0, type="hidden")
 * 8. Disabled Fields (disabled attribute & aria-disabled="true")
 * 9. Validation Messages (Native HTML5 validation & ARIA error feedback)
 */

export const simpleHtmlFormHtml = `<!DOCTYPE html>
<html>
<head><title>Simple HTML Form</title></head>
<body>
  <h1>Scholarship Application</h1>
  <form id="scholarshipForm" action="/api/apply" method="POST">
    <div>
      <label for="fullName">Full Name</label>
      <input type="text" id="fullName" name="fullName" placeholder="Enter full name" required />
    </div>
    <div>
      <label for="userEmail">Email Address</label>
      <input type="email" id="userEmail" name="email" placeholder="name@domain.com" required />
    </div>
    <div>
      <label for="educationSelect">Level of Education</label>
      <select id="educationSelect" name="educationLevel">
        <option value="undergraduate" selected>Undergraduate</option>
        <option value="postgraduate">Postgraduate</option>
        <option value="doctorate">Doctorate</option>
      </select>
    </div>
    <div>
      <label><input type="radio" name="residence" value="hostel" checked /> Hosteler</label>
      <label><input type="radio" name="residence" value="dayscholar" /> Day Scholar</label>
    </div>
    <div>
      <label><input type="checkbox" id="termsCheck" name="agreeTerms" required /> I agree to terms</label>
    </div>
    <div>
      <button type="submit" id="submitBtn">Submit Application</button>
      <button type="reset" id="resetBtn">Reset</button>
    </div>
  </form>
</body>
</html>`;

export const reactFormHtml = `<!DOCTYPE html>
<html>
<head><title>React Controlled Form</title></head>
<body>
  <div id="root">
    <div data-testid="react-form-container" role="form" aria-label="Student Enrollment">
      <h2>React Student Portal</h2>
      <div class="form-group">
        <label for="studentIdInput">Student Registration ID</label>
        <input
          id="studentIdInput"
          data-testid="student-id-field"
          type="text"
          name="studentId"
          value="STU-99214"
          aria-required="true"
          autocomplete="off"
        />
      </div>
      <div class="form-group">
        <label id="cgpaLabel">Cumulative CGPA</label>
        <input
          data-testid="cgpa-field"
          type="number"
          step="0.01"
          name="cgpa"
          aria-labelledby="cgpaLabel"
          placeholder="0.00 - 10.00"
          value="8.75"
        />
      </div>
      <div class="action-bar">
        <button
          data-testid="save-btn"
          type="button"
          role="button"
          aria-label="Save Student Information"
        >
          Save Details
        </button>
      </div>
    </div>
  </div>
</body>
</html>`;

export const dynamicFormHtml = `<!DOCTYPE html>
<html>
<head><title>Dynamic Form</title></head>
<body>
  <h1>Family Members Form</h1>
  <form id="dynamicFamilyForm">
    <div id="memberList">
      <div class="member-entry">
        <label for="member_1">Member 1 Name</label>
        <input type="text" id="member_1" name="members[]" value="Parent" />
      </div>
    </div>
    <button type="button" id="addMemberBtn" onclick="
      const div = document.createElement('div');
      div.className = 'member-entry';
      div.innerHTML = '<label for=\\'member_2\\'>Member 2 Name</label><input type=\\'text\\' id=\\'member_2\\' name=\\'members[]\\' value=\\'Sibling\\' />';
      document.getElementById('memberList').appendChild(div);
      this.setAttribute('data-added', 'true');
    ">Add Another Member</button>
    <button type="submit" id="submitFamilyBtn">Submit Family Details</button>
  </form>
</body>
</html>`;

export const customDropdownHtml = `<!DOCTYPE html>
<html>
<head><title>Custom ARIA Dropdown</title></head>
<body>
  <h1>Select Community</h1>
  <div class="custom-combobox-wrapper">
    <label id="communityLabel">Community Group</label>
    <div
      id="customCommunityDropdown"
      role="combobox"
      aria-labelledby="communityLabel"
      aria-expanded="true"
      aria-haspopup="listbox"
      aria-controls="communityListbox"
      tabindex="0"
    >
      <span class="selected-value">Minority Community</span>
      <ul id="communityListbox" role="listbox" aria-labelledby="communityLabel">
        <li role="option" id="opt-1" data-value="GEN" aria-selected="false">General Merit</li>
        <li role="option" id="opt-2" data-value="MIN" aria-selected="true" class="selected">Minority Community</li>
        <li role="option" id="opt-3" data-value="EWS" aria-selected="false">Economically Weaker Section</li>
      </ul>
    </div>
  </div>
</body>
</html>`;

export const fileInputHtml = `<!DOCTYPE html>
<html>
<head><title>Document Upload Form</title></head>
<body>
  <h1>Identity Verification</h1>
  <form id="uploadForm" enctype="multipart/form-data">
    <div class="upload-zone">
      <label for="identityProofFile">Aadhaar / National ID (PDF or JPG only, max 2MB)</label>
      <input
        type="file"
        id="identityProofFile"
        name="identityDoc"
        accept=".pdf,.jpg,.jpeg"
        required
        data-testid="file-upload-input"
      />
    </div>
    <button type="submit" id="uploadSubmitBtn">Upload Document</button>
  </form>
</body>
</html>`;

export const iframeParentHtml = (childSrc) => `<!DOCTYPE html>
<html>
<head><title>Parent Page With Iframe</title></head>
<body>
  <h1>Main Portal Window</h1>
  <input type="text" id="parentInput" name="parentField" placeholder="Parent Form Field" />
  <iframe
    id="portalIframe"
    name="portalIframe"
    src="${childSrc}"
    style="width: 600px; height: 400px;"
  ></iframe>
</body>
</html>`;

export const iframeChildHtml = `<!DOCTYPE html>
<html>
<head><title>Embedded Verification Frame</title></head>
<body>
  <h2>DigiLocker Embedded Sign-In</h2>
  <form id="innerIframeForm">
    <label for="digiMobile">Registered Mobile Number</label>
    <input type="tel" id="digiMobile" name="mobileNumber" placeholder="9876543210" required />
    <button type="submit" id="requestOtpBtn">Request DigiLocker OTP</button>
  </form>
</body>
</html>`;

export const hiddenElementsHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Hidden & Invisible Elements</title>
  <style>
    .display-none { display: none; }
    .visibility-hidden { visibility: hidden; }
    .opacity-zero { opacity: 0; }
  </style>
</head>
<body>
  <h1>Visibility Audit</h1>
  <form id="visibilityForm">
    <!-- Visible controls -->
    <label for="visibleField">Visible Field</label>
    <input type="text" id="visibleField" name="visibleField" value="I am visible" />

    <!-- Hidden by type="hidden" -->
    <input type="hidden" id="hiddenCsrf" name="_csrf" value="secret_token_123" />

    <!-- Hidden by display: none -->
    <div class="display-none">
      <label for="displayNoneField">Display None</label>
      <input type="text" id="displayNoneField" name="displayNone" />
    </div>

    <!-- Hidden by visibility: hidden -->
    <div class="visibility-hidden">
      <label for="visibilityHiddenField">Visibility Hidden</label>
      <input type="text" id="visibilityHiddenField" name="visibilityHidden" />
    </div>

    <!-- Hidden by opacity: 0 -->
    <div class="opacity-zero">
      <label for="opacityZeroField">Opacity Zero</label>
      <input type="text" id="opacityZeroField" name="opacityZero" />
    </div>

    <!-- Hidden attribute -->
    <input type="text" id="hiddenAttrField" name="hiddenAttr" hidden />

    <button type="submit" id="visibleSubmitBtn">Submit</button>
  </form>
</body>
</html>`;

export const disabledFieldsHtml = `<!DOCTYPE html>
<html>
<head><title>Disabled Fields Audit</title></head>
<body>
  <h1>Account Settings</h1>
  <form id="accountForm">
    <div>
      <label for="editableName">Applicant Name</label>
      <input type="text" id="editableName" name="name" value="Jane Doe" />
    </div>
    <div>
      <label for="disabledAadhaar">Aadhaar Number (Locked after verification)</label>
      <input type="text" id="disabledAadhaar" name="aadhaar" value="XXXX-XXXX-1234" disabled />
    </div>
    <div>
      <label for="ariaDisabledField">Permanent Address (Verified)</label>
      <input type="text" id="ariaDisabledField" name="address" value="State Registered" aria-disabled="true" />
    </div>
    <div>
      <button type="button" id="disabledSaveBtn" disabled>Cannot Save</button>
      <button type="submit" id="activeSaveBtn">Submit Active</button>
    </div>
  </form>
</body>
</html>`;

export const validationMessagesHtml = `<!DOCTYPE html>
<html>
<head><title>Validation Messages Audit</title></head>
<body>
  <h1>Registration Form with Validation</h1>
  <form id="validationForm">
    <div>
      <label for="requiredField">Required Field</label>
      <input type="text" id="requiredField" name="requiredField" required />
    </div>
    <div>
      <label for="patternField">PIN Code (Must be 6 digits)</label>
      <input type="text" id="patternField" name="pincode" pattern="[0-9]{6}" value="INVALID" required />
    </div>
    <div>
      <label for="ariaInvalidField">Bank IFSC Code</label>
      <input
        type="text"
        id="ariaInvalidField"
        name="ifsc"
        value="SBIN000"
        aria-invalid="true"
        aria-describedby="ifscErrorText"
      />
      <span id="ifscErrorText" class="error-message" role="alert">IFSC code must be exactly 11 characters.</span>
    </div>
    <button type="submit" id="validateSubmitBtn">Validate & Submit</button>
  </form>
</body>
</html>`;

export default {
  simpleHtmlFormHtml,
  reactFormHtml,
  dynamicFormHtml,
  customDropdownHtml,
  fileInputHtml,
  iframeParentHtml,
  iframeChildHtml,
  hiddenElementsHtml,
  disabledFieldsHtml,
  validationMessagesHtml
};
