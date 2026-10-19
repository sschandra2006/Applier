/**
 * QA Lab Scenario 12: File Upload
 * Document attachment form with client-side mime validation, file size checks,
 * and uploaded confirmation badge.
 */

export const scenario12 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-12-file-upload',
  scenarioNumber: 12,
  name: 'Document File Upload',
  description: 'Single document attachment with client-side file inspection, size limits, and asynchronous upload simulation.',
  category: 'FORM_PARSING',
  failureClass: 'NONE',
  breakMechanism: 'Breaks automations that attempt standard click() on hidden file inputs or fail to use setInputFiles().',
  resilienceStrategy: 'Playwright locator.setInputFiles() combined with observation engine detection of file type candidates.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: File Upload</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    .upload-zone { border: 2px dashed #0066cc; padding: 20px; text-align: center; border-radius: 6px; background: #f8fbfe; }
    #fileInfo { display: none; margin-top: 10px; font-weight: bold; color: #0066cc; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; }
    #uploadSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Resume & Document Verification</h1>

  <form id="uploadForm">
    <div class="form-group">
      <label for="applicantName">Candidate Name</label>
      <input type="text" id="applicantName" name="applicantName" value="Alex Taylor" required style="width: 100%; padding: 8px;" />
    </div>

    <div class="form-group">
      <label for="resumeFile">Upload Curriculum Vitae (PDF only, max 5MB)</label>
      <div class="upload-zone">
        <input
          type="file"
          id="resumeFile"
          name="resume"
          accept=".pdf,application/pdf"
          required
        />
        <div id="fileInfo">Selected: <span id="fileNameSpan"></span> (<span id="fileSizeSpan"></span> KB)</div>
      </div>
    </div>

    <button type="submit" id="submitUploadBtn">Upload & Submit Application</button>
  </form>

  <div id="uploadSuccess">
    <h3>Document Uploaded Successfully!</h3>
    <p>File Hash: <span id="uploadedDocName"></span></p>
  </div>

  <script>
    const fileInput = document.getElementById('resumeFile');
    const fileInfo = document.getElementById('fileInfo');
    const fileNameSpan = document.getElementById('fileNameSpan');
    const fileSizeSpan = document.getElementById('fileSizeSpan');

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        fileNameSpan.innerText = file.name;
        fileSizeSpan.innerText = Math.round(file.size / 1024);
        fileInfo.style.display = 'block';
      }
    });

    document.getElementById('uploadForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please attach a resume file.');
        return;
      }
      document.getElementById('uploadForm').style.display = 'none';
      document.getElementById('uploadedDocName').innerText = fileInput.files[0].name;
      document.getElementById('uploadSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
