/**
 * Document Evidence and Understanding Tests
 * Applier 2.0 — Phase 7
 *
 * Strictly verifies:
 * 1. Separation of Document Processing, Document Understanding, and Applicant Truth
 * 2. All 7 required test scenarios:
 *    - PDF processing
 *    - Image processing
 *    - Multi-page PDF
 *    - Poor quality document (blur / crop)
 *    - Wrong document type detection
 *    - Conflicting values handling
 *    - Low-confidence OCR uncertainty barrier
 * 3. Strict Safety Principle: Never convert an uncertain extraction into a verified applicant value automatically.
 * 4. Conformance to canonical DocumentEvidence contract schema.
 */

import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import {
  DocumentUnderstandingEngine,
  CANONICAL_DOCUMENT_TYPES,
  SUPPORTED_MIME_TYPES
} from '../src/documents/index.js';
import {
  ApplicantKnowledgeGraphService
} from '../src/knowledge/index.js';
import {
  validateDocumentEvidence
} from '../../shared/validators/index.js';
import {
  KnowledgeSourceType,
  KnowledgeVerificationStatus
} from '../../shared/enums/index.js';

describe('Phase 7: Document Evidence and Extraction', () => {
  let engine;
  let knowledgeService;
  let graph;

  beforeEach(() => {
    engine = new DocumentUnderstandingEngine();
    knowledgeService = new ApplicantKnowledgeGraphService();
    graph = knowledgeService.createEmptyGraph({
      userId: 'user_doc_test',
      applicantId: 'app_doc_test'
    });
  });

  // Helper to create synthetic PDF in memory
  async function createSyntheticPdf(pages = 1, text = 'Aadhaar Card UIDAI 1234 5678 9012 DOB: 14/08/2006 Name: Aarav Sharma') {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) {
      const page = pdfDoc.addPage([595, 842]);
      page.drawText(`${text} [Page ${i + 1}]`, {
        x: 50,
        y: 800,
        size: 12,
        color: rgb(0, 0, 0)
      });
    }
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // Helper to create synthetic JPEG image in memory
  async function createSyntheticImage(width = 600, height = 400) {
    return await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 240, g: 240, b: 240 }
      }
    }).jpeg().toBuffer();
  }

  test('Scenario 1: PDF Document Processing & Evidence Extraction', async () => {
    const rawPdfText = 'Government of India Unique Identification Authority of India Mera Aadhaar UIDAI 1234 5678 9012 DOB: 14/08/2006 Name: Aarav Sharma';
    const pdfBuffer = await createSyntheticPdf(1, rawPdfText);

    const result = await engine.processAndUnderstand({
      buffer: pdfBuffer,
      mimeType: 'application/pdf',
      fileName: 'aadhaar_front.pdf',
      expectedType: CANONICAL_DOCUMENT_TYPES.AADHAAR,
      rawText: rawPdfText
    });

    expect(result.success).toBe(true);
    expect(result.validation.valid).toBe(true);
    expect(result.validation.mimeType).toBe('application/pdf');

    // Classification
    expect(result.classification.detectedType).toBe(CANONICAL_DOCUMENT_TYPES.AADHAAR);
    expect(result.classification.isTypeMatch).toBe(true);

    // Evidences generated
    expect(result.evidences.length).toBeGreaterThanOrEqual(2);

    const dobEvidence = result.evidences.find(e => e.fieldKey === 'identity.dateOfBirth');
    expect(dobEvidence).toBeDefined();
    expect(dobEvidence.normalizedValue).toBe('14-08-2006');
    expect(dobEvidence.confidence).toBeGreaterThanOrEqual(0.85);
    expect(dobEvidence.extractionMethod).toBe('OCR');
    expect(dobEvidence.page).toBe(1);

    // Contract validation
    const validation = validateDocumentEvidence(dobEvidence);
    expect(validation.valid).toBe(true);

    // Bridge to Knowledge Graph
    const bridgeResult = engine.bridgeToKnowledgeGraph(knowledgeService, graph, result.evidences, {
      isTypeMatch: result.classification.isTypeMatch
    });

    expect(bridgeResult.length).toBeGreaterThanOrEqual(2);
    expect(graph.identity.dateOfBirth.value).toBe('14-08-2006');
    expect(graph.identity.dateOfBirth.verificationStatus).toBe(KnowledgeVerificationStatus.VERIFIED);
  });

  test('Scenario 2: Image Processing (JPEG/PNG) & Normalization', async () => {
    const imgBuffer = await createSyntheticImage(800, 500);
    const rawPanText = 'INCOME TAX DEPARTMENT GOVT OF INDIA Permanent Account Number ABCDE1234F Father Name: Rajesh Sharma DOB: 14-08-2006';

    const result = await engine.processAndUnderstand({
      buffer: imgBuffer,
      mimeType: 'image/jpeg',
      fileName: 'pan_card.jpg',
      expectedType: CANONICAL_DOCUMENT_TYPES.PAN,
      rawText: rawPanText
    });

    expect(result.success).toBe(true);
    expect(result.classification.detectedType).toBe(CANONICAL_DOCUMENT_TYPES.PAN);
    expect(result.classification.isTypeMatch).toBe(true);

    // Quality check on clean image
    expect(result.qualityReport.isCropped).toBe(false);
    expect(result.qualityReport.isBlurry).toBe(false);
    expect(result.qualityReport.qualityScore).toBeGreaterThanOrEqual(0.80);

    const panEvidence = result.evidences.find(e => e.fieldKey === 'identity.panNumber');
    expect(panEvidence).toBeDefined();
    expect(panEvidence.normalizedValue).toBe('ABCDE1234F');
    expect(panEvidence.confidence).toBeGreaterThanOrEqual(0.90);
  });

  test('Scenario 3: Multi-page PDF Inspection & Missing Pages Detection', async () => {
    const multiPagePdf = await createSyntheticPdf(3, 'Marksheet Secondary School Board Examination CGPA: 9.2 College: National High School');

    // Case A: 3-page PDF with expectedPages = 3 (Valid)
    const validResult = await engine.processAndUnderstand({
      buffer: multiPagePdf,
      mimeType: 'application/pdf',
      fileName: 'marksheet_full.pdf',
      expectedType: CANONICAL_DOCUMENT_TYPES.MARKSHEET,
      rawText: 'Marksheet Secondary School Board CGPA: 9.2 College: National High School',
      metadata: { expectedPages: 3 }
    });

    expect(validResult.qualityReport.missingPages).toBe(false);
    expect(validResult.classification.detectedType).toBe(CANONICAL_DOCUMENT_TYPES.MARKSHEET);

    // Case B: 3-page PDF when 5 pages were expected (Missing Pages)
    const missingResult = await engine.processAndUnderstand({
      buffer: multiPagePdf,
      mimeType: 'application/pdf',
      fileName: 'marksheet_partial.pdf',
      expectedType: CANONICAL_DOCUMENT_TYPES.MARKSHEET,
      rawText: 'Marksheet Secondary School Board CGPA: 9.2 College: National High School',
      metadata: { expectedPages: 5 }
    });

    expect(missingResult.qualityReport.missingPages).toBe(true);
    expect(missingResult.qualityReport.warnings.some(w => w.includes('Missing pages'))).toBe(true);
    expect(missingResult.qualityReport.qualityScore).toBeLessThan(0.70);
  });

  test('Scenario 4: Poor Quality Document (Blur / Crop) & Uncertainty Barrier', async () => {
    const croppedBuffer = await createSyntheticImage(80, 80); // Severely small cropped dimensions
    const rawText = 'UIDAI 1234 5678 9012 DOB: 14/08/2006';

    const result = await engine.processAndUnderstand({
      buffer: croppedBuffer,
      mimeType: 'image/jpeg',
      fileName: 'blurry_crop.jpg',
      expectedType: CANONICAL_DOCUMENT_TYPES.AADHAAR,
      rawText,
      metadata: { forceBlurry: true, forceCropped: true }
    });

    expect(result.qualityReport.isBlurry).toBe(true);
    expect(result.qualityReport.isCropped).toBe(true);
    expect(result.qualityReport.qualityScore).toBeLessThan(0.50);

    // Evidences must be penalized due to poor quality
    for (const ev of result.evidences) {
      expect(ev.confidence).toBeLessThan(0.70);
    }

    // STRICT TEST: Poor quality extraction MUST NOT automatically become VERIFIED in Knowledge Graph
    engine.bridgeToKnowledgeGraph(knowledgeService, graph, result.evidences, {
      isTypeMatch: result.classification.isTypeMatch
    });

    const dobStatus = knowledgeService.getFieldStatus(graph, 'identity.dateOfBirth');
    expect(dobStatus.status).not.toBe(KnowledgeVerificationStatus.VERIFIED);
    expect(dobStatus.status).toBe(KnowledgeVerificationStatus.CONFIRMATION_REQUIRED);
  });

  test('Scenario 5: Wrong Document Type Detection', async () => {
    // User claims to upload AADHAAR, but uploads a PAN card!
    const panText = 'INCOME TAX DEPARTMENT Permanent Account Number ABCDE1234F';
    const pdfBuffer = await createSyntheticPdf(1, panText);

    const result = await engine.processAndUnderstand({
      buffer: pdfBuffer,
      mimeType: 'application/pdf',
      fileName: 'document.pdf',
      expectedType: CANONICAL_DOCUMENT_TYPES.AADHAAR, // Expected Aadhaar
      rawText: panText
    });

    expect(result.classification.detectedType).toBe(CANONICAL_DOCUMENT_TYPES.PAN);
    expect(result.classification.isTypeMatch).toBe(false);
    expect(result.classification.reason).toContain('mismatch');

    // STRICT TEST: Type mismatch MUST NOT automatically become VERIFIED in Knowledge Graph
    engine.bridgeToKnowledgeGraph(knowledgeService, graph, result.evidences, {
      isTypeMatch: result.classification.isTypeMatch
    });

    if (graph.identity.panNumber) {
      expect(graph.identity.panNumber.verificationStatus).not.toBe(KnowledgeVerificationStatus.VERIFIED);
    }
  });

  test('Scenario 6: Conflicting Values Within and Across Documents', async () => {
    // A: Internal conflict detection within document
    const internalContradictoryEvidences = [
      {
        schemaVersion: '2.0.0',
        evidenceId: 'evi_p1',
        documentId: 'doc_1',
        fieldKey: 'identity.dateOfBirth',
        page: 1,
        rawValue: '14-08-2006',
        normalizedValue: '14-08-2006',
        confidence: 0.90,
        quality: { isBlurry: false, isCropped: false, isUnreadable: false }
      },
      {
        schemaVersion: '2.0.0',
        evidenceId: 'evi_p2',
        documentId: 'doc_1',
        fieldKey: 'identity.dateOfBirth',
        page: 2,
        rawValue: '15-08-2006',
        normalizedValue: '15-08-2006',
        confidence: 0.88,
        quality: { isBlurry: false, isCropped: false, isUnreadable: false }
      }
    ];

    const internalConflicts = engine.detectInternalDocumentConflicts(internalContradictoryEvidences);
    expect(internalConflicts).toHaveLength(1);
    expect(internalConflicts[0].fieldKey).toBe('identity.dateOfBirth');

    // B: Cross-document conflict against Applicant Knowledge Graph
    // Ingest initial verified value: 14-08-2006
    knowledgeService.ingestValue(graph, {
      path: 'identity.dateOfBirth',
      value: '14-08-2006',
      source: KnowledgeSourceType.DOCUMENT,
      confidence: 0.98
    });

    // Ingest conflicting second document: 15-08-2006
    const conflictEv = [
      {
        schemaVersion: '2.0.0',
        evidenceId: 'evi_doc2',
        documentId: 'doc_2',
        fieldKey: 'identity.dateOfBirth',
        page: 1,
        rawValue: '15-08-2006',
        normalizedValue: '15-08-2006',
        confidence: 0.95,
        quality: { isBlurry: false, isCropped: false, isUnreadable: false }
      }
    ];

    engine.bridgeToKnowledgeGraph(knowledgeService, graph, conflictEv, { isTypeMatch: true });

    // Must trigger FIELD_CONFLICT
    expect(graph.conflicts).toHaveLength(1);
    expect(graph.conflicts[0].reason).toBe('FIELD_CONFLICT');
    expect(graph.identity.dateOfBirth.verificationStatus).toBe(KnowledgeVerificationStatus.CONFLICT);
  });

  test('Scenario 7: Low-Confidence OCR strictly remains Unverified', async () => {
    const rawNoisyText = 'Government of India Mera Aadhaar DOB : 14/08/2006 low confidence scan noise ??? #';
    const pdfBuffer = await createSyntheticPdf(1, rawNoisyText);

    const result = await engine.processAndUnderstand({
      buffer: pdfBuffer,
      mimeType: 'application/pdf',
      fileName: 'noisy_scan.pdf',
      expectedType: CANONICAL_DOCUMENT_TYPES.AADHAAR,
      rawText: rawNoisyText,
      metadata: { lowConfidenceOcr: true }
    });

    const dobEvidence = result.evidences.find(e => e.fieldKey === 'identity.dateOfBirth');
    expect(dobEvidence).toBeDefined();
    expect(dobEvidence.confidence).toBeLessThan(0.70);

    // Bridge to Knowledge Graph
    engine.bridgeToKnowledgeGraph(knowledgeService, graph, [dobEvidence], {
      isTypeMatch: true
    });

    const status = knowledgeService.getFieldStatus(graph, 'identity.dateOfBirth');
    // STRICT: Low-confidence extraction must NEVER be VERIFIED
    expect(status.status).toBe(KnowledgeVerificationStatus.CONFIRMATION_REQUIRED);
    expect(graph.identity.dateOfBirth.verificationStatus).not.toBe(KnowledgeVerificationStatus.VERIFIED);
  });
});
