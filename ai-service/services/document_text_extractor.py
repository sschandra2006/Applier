"""
Document Text Extractor Service
Extracts high-fidelity structured text from PDF and DOCX files.
Features automatic scanned-document detection with OCR fallback.
"""

import io
import logging
from typing import Dict, Any, Optional
import fitz  # PyMuPDF
import docx
from PIL import Image

logger = logging.getLogger("DocumentTextExtractor")

try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False


def extract_text_from_pdf(pdf_bytes: bytes, ocr_min_chars: int = 60) -> Dict[str, Any]:
    """
    Extracts text from a PDF buffer using PyMuPDF.
    If the document has virtually no extractable text (e.g. scanned image PDF),
    automatically attempts OCR on page pixmaps if pytesseract is available.
    """
    if not pdf_bytes:
        raise ValueError("PDF buffer is empty (0 bytes).")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)
    page_texts = []
    ocr_used = False

    for page_num in range(page_count):
        page = doc[page_num]
        text = page.get_text("text").strip()
        page_texts.append(text)

    combined_text = "\n\n".join(t for t in page_texts if t)
    alphanumeric_count = sum(c.isalnum() for c in combined_text)

    # Scanned PDF detection: if alphanumeric count is below threshold, attempt OCR
    if alphanumeric_count < ocr_min_chars:
        logger.info(f"PDF has low extractable text ({alphanumeric_count} chars). Attempting OCR fallback...")
        if PYTESSERACT_AVAILABLE:
            ocr_page_texts = []
            for page_num in range(page_count):
                try:
                    page = doc[page_num]
                    # Render page at 150 DPI for balance of speed and OCR clarity
                    pix = page.get_pixmap(dpi=150)
                    img = Image.open(io.BytesIO(pix.tobytes("png")))
                    ocr_text = pytesseract.image_to_string(img).strip()
                    if ocr_text:
                        ocr_page_texts.append(ocr_text)
                except Exception as ocr_err:
                    logger.warning(f"OCR failed for page {page_num + 1}: {ocr_err}")

            if ocr_page_texts:
                combined_text = "\n\n".join(ocr_page_texts)
                ocr_used = True
                logger.info(f"OCR successfully extracted {len(combined_text)} characters.")
        else:
            logger.warning("Pytesseract is not installed or available; cannot run OCR on scanned PDF.")

    words = combined_text.split()
    return {
        "text": combined_text,
        "pages": page_count,
        "wordCount": len(words),
        "ocrUsed": ocr_used,
        "mimeType": "application/pdf"
    }


def extract_text_from_docx(docx_bytes: bytes) -> Dict[str, Any]:
    """
    Extracts structured text from a DOCX buffer preserving paragraphs,
    bullet points, and tabular content.
    """
    if not docx_bytes:
        raise ValueError("DOCX buffer is empty (0 bytes).")

    file_stream = io.BytesIO(docx_bytes)
    doc = docx.Document(file_stream)

    paragraphs = []

    # 1. Extract paragraphs
    for p in doc.paragraphs:
        p_text = p.text.strip()
        if p_text:
            # Preserve bullet formatting if paragraph has a list style
            if p.style and "List" in p.style.name:
                paragraphs.append(f"• {p_text}")
            else:
                paragraphs.append(p_text)

    # 2. Extract tables (resumes often use borderless tables for headers/skills)
    for table in doc.tables:
        for row in table.rows:
            row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if row_cells:
                # Deduplicate repeated text across merged cells
                unique_cells = []
                for cell in row_cells:
                    if not unique_cells or cell != unique_cells[-1]:
                        unique_cells.append(cell)
                if unique_cells:
                    paragraphs.append(" | ".join(unique_cells))

    combined_text = "\n\n".join(paragraphs)
    words = combined_text.split()

    return {
        "text": combined_text,
        "pages": max(1, len(doc.sections)),
        "wordCount": len(words),
        "ocrUsed": False,
        "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }


def extract_text_from_document(
    file_bytes: bytes,
    file_name: str,
    mime_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Universal dispatcher that inspects file extension / MIME type
    and runs the appropriate text extraction pipeline.
    """
    name_lower = (file_name or "").lower()
    norm_mime = (mime_type or "").lower()

    if name_lower.endswith(".pdf") or "pdf" in norm_mime:
        return extract_text_from_pdf(file_bytes)
    elif name_lower.endswith(".docx") or "officedocument.wordprocessingml" in norm_mime:
        return extract_text_from_docx(file_bytes)
    elif name_lower.endswith(".txt") or "text/plain" in norm_mime:
        text = file_bytes.decode("utf-8", errors="replace").strip()
        return {
            "text": text,
            "pages": 1,
            "wordCount": len(text.split()),
            "ocrUsed": False,
            "mimeType": "text/plain"
        }
    else:
        # Default try PDF then DOCX
        if file_bytes.startswith(b"%PDF"):
            return extract_text_from_pdf(file_bytes)
        elif file_bytes.startswith(b"PK\x03\x04"):  # Zip archive header used by DOCX
            return extract_text_from_docx(file_bytes)
        else:
            raise ValueError(f"Unsupported file format for extraction: {file_name}")
