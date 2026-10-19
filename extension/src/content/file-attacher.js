/**
 * File Attacher Module — Production Grade
 * Programmatically attaches tailored resume PDF binaries to HTML5 <input type="file">
 * using standard DataTransfer and File APIs, strictly adhering to browser security constraints.
 *
 * Enforces:
 * 1. Never attempts to assign local filesystem paths as strings to file inputs (which causes browser SecurityError).
 * 2. Uses in-memory Uint8Array decoded from Base64 into standard HTML5 File objects.
 * 3. Verifies that the correct generated resume is attached (name, size, MIME type).
 * 4. Detects post-attachment DOM upload errors (file size limits, unsupported extensions).
 */

export class FileAttacher {
  /**
   * Attaches base64-encoded PDF to file input element and verifies attachment.
   *
   * @param {string} fileInputSelector - CSS selector for target file input
   * @param {string} pdfBase64 - Base64 encoded PDF binary data
   * @param {string} expectedFileName - Expected file name (e.g. "Jane_Doe_Tailored_Resume.pdf")
   * @returns {Promise<Object>} Verification and attachment results
   */
  static async attachPdf(fileInputSelector, pdfBase64, expectedFileName = 'Tailored_Resume.pdf') {
    if (!pdfBase64) {
      return {
        success: false,
        verified: false,
        error: 'No PDF binary data provided for resume attachment.'
      };
    }

    // 1. Locate file input in DOM
    const input = document.querySelector(fileInputSelector) ||
                  document.querySelector('input[type="file"][name*="resume" i]') ||
                  document.querySelector('input[type="file"][id*="resume" i]') ||
                  document.querySelector('input[type="file"][accept*="pdf" i]') ||
                  document.querySelector('input[type="file"]');

    if (!input) {
      return {
        success: false,
        verified: false,
        error: `Resume file input element not found in DOM with selector: "${fileInputSelector}"`
      };
    }

    if (input.disabled) {
      return {
        success: false,
        verified: false,
        error: 'Target resume file input is currently disabled in the DOM.'
      };
    }

    try {
      // 2. Decode Base64 binary into typed array
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Check PDF magic header (%PDF-)
      const isPdfHeader = bytes.length >= 4 &&
                          bytes[0] === 0x25 && // %
                          bytes[1] === 0x50 && // P
                          bytes[2] === 0x44 && // D
                          bytes[3] === 0x46;   // F

      if (!isPdfHeader) {
        return {
          success: false,
          verified: false,
          error: 'Provided file data does not conform to valid PDF format (%PDF header missing).'
        };
      }

      // 3. Construct standard HTML5 File object
      const file = new File([bytes], expectedFileName, {
        type: 'application/pdf',
        lastModified: Date.now()
      });

      // 4. Populate files list via DataTransfer API
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;

      // 5. Dispatch full event lifecycle for reactive framework listeners
      input.dispatchEvent(new Event('focus', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));

      // 6. Post-attachment Verification
      const filesCount = input.files ? input.files.length : 0;
      const attachedFile = filesCount > 0 ? input.files[0] : null;

      const verified = Boolean(
        attachedFile &&
        attachedFile.name === expectedFileName &&
        attachedFile.size === bytes.length &&
        attachedFile.type === 'application/pdf'
      );

      if (!verified) {
        return {
          success: false,
          verified: false,
          error: 'Attachment verification failed: File input files collection did not retain the attached file.'
        };
      }

      // 7. Check for immediate portal upload validation errors
      const uploadError = FileAttacher._detectUploadError(input);
      if (uploadError) {
        return {
          success: false,
          verified: true,
          fileName: expectedFileName,
          fileSizeBytes: bytes.length,
          error: `Portal rejected file upload: ${uploadError}`
        };
      }

      // 8. Apply visual indicator to upload container
      const container = input.closest('.dropzone, .file-upload, [class*="upload"], .field, div') || input;
      container.style.outline = '2px dashed #10b981';
      container.style.transition = 'outline 0.3s ease';

      return {
        success: true,
        verified: true,
        fileName: expectedFileName,
        fileSizeBytes: bytes.length,
        attachedTo: input.id || input.name || 'input[type="file"]'
      };

    } catch (err) {
      return {
        success: false,
        verified: false,
        error: `Exception during file attachment: ${err.message}`
      };
    }
  }

  /**
   * Scans surrounding DOM for portal file rejection messages.
   */
  static _detectUploadError(inputEl) {
    const container = inputEl.closest('.field, .form-group, .file-upload, [class*="upload"], div');
    if (!container) return null;

    const errorEl = container.querySelector(
      '.upload-error, .file-error, .invalid-feedback, .error-message, [role="alert"]'
    );

    if (errorEl && errorEl.innerText.trim() && errorEl.offsetParent !== null) {
      return errorEl.innerText.trim();
    }

    return null;
  }
}
