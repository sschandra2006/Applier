/**
 * QA Lab Scenario 13: Multiple File Upload
 * Multi-file upload (<input type="file" multiple>) supporting multiple
 * attachments with a dynamic list of attached files.
 */

export const scenario13 = {
  schemaVersion: '2.0.0',
  scenarioId: 'qa-13-multiple-file-upload',
  scenarioNumber: 13,
  name: 'Multi-File Document Attachments',
  description: 'Multi-file upload control accepting multiple certificates and portfolios simultaneously, displaying a dynamic attachment list.',
  category: 'FORM_PARSING',
  failureClass: 'NONE',
  breakMechanism: 'Breaks single-file uploaders that only provide one file or replace earlier files on second upload.',
  resilienceStrategy: 'Passing multiple file paths to setInputFiles() and verifying DOM count of attached documents.',
  testLevels: ['Unit', 'Integration', 'Browser', 'End-to-End'],
  htmlFixture: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>QA Portal: Multiple File Upload</title>
  <style>
    body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    .upload-zone { border: 2px dashed #0066cc; padding: 20px; text-align: center; border-radius: 6px; background: #f8fbfe; }
    #attachmentsList { list-style: none; padding: 0; margin-top: 15px; }
    #attachmentsList li { padding: 6px 10px; background: #eee; margin-bottom: 5px; border-radius: 4px; display: flex; justify-content: space-between; }
    button { padding: 10px 20px; background: #0066cc; color: #fff; border: none; cursor: pointer; }
    #multiSuccess { display: none; padding: 15px; background: #e6ffe6; border: 1px solid green; margin-top: 15px; }
  </style>
</head>
<body>
  <h1>Supporting Documentation Dossier</h1>

  <form id="multiUploadForm">
    <div class="form-group">
      <label for="portfolioFiles">Upload Supporting Documents (Certificates, Transcripts, ID)</label>
      <div class="upload-zone">
        <input
          type="file"
          id="portfolioFiles"
          name="documents"
          multiple
          accept=".pdf,.png,.jpg,.jpeg"
          required
        />
        <ul id="attachmentsList"></ul>
      </div>
    </div>

    <button type="submit" id="submitMultiBtn">Submit Complete Dossier</button>
  </form>

  <div id="multiSuccess">
    <h3>Dossier Submitted Successfully!</h3>
    <p>Total Documents Uploaded: <strong id="docCountBadge"></strong></p>
  </div>

  <script>
    const fileInput = document.getElementById('portfolioFiles');
    const attachmentsList = document.getElementById('attachmentsList');

    fileInput.addEventListener('change', () => {
      attachmentsList.innerHTML = '';
      if (fileInput.files) {
        for (let i = 0; i < fileInput.files.length; i++) {
          const file = fileInput.files[i];
          const li = document.createElement('li');
          li.innerHTML = '<span>' + file.name + '</span><span>' + Math.round(file.size / 1024) + ' KB</span>';
          attachmentsList.appendChild(li);
        }
      }
    });

    document.getElementById('multiUploadForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const count = fileInput.files ? fileInput.files.length : 0;
      if (count === 0) {
        alert('Please attach at least one document.');
        return;
      }
      document.getElementById('multiUploadForm').style.display = 'none';
      document.getElementById('docCountBadge').innerText = count + ' files';
      document.getElementById('multiSuccess').style.display = 'block';
    });
  </script>
</body>
</html>`
};
