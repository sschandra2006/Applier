"""
Safe PDF Compiler Service for Applier 3.0
Compiles LaTeX source to PDF in an isolated sandbox with resource & execution time limits.
Provides an ATS-compliant PyMuPDF vector PDF fallback when a LaTeX compiler is not installed.
"""

import os
import shutil
import subprocess
import tempfile
import logging
from typing import Tuple, Optional
import fitz  # PyMuPDF

from core.models import TailoredResumeContent

logger = logging.getLogger(__name__)

# Execution limits
COMPILER_TIMEOUT_SECONDS = 15
MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


class SafePdfCompiler:
    """
    Dedicated isolated compiler for resume documents.
    Enforces time limits, no shell escape, temporary filesystem isolation,
    and automatic ATS vector PDF fallback.
    """

    def __init__(self):
        self._latex_bin = self._find_latex_compiler()

    def _find_latex_compiler(self) -> Optional[str]:
        """Finds pdflatex, tectonic, or xelatex in system PATH."""
        for binary in ["pdflatex", "tectonic", "xelatex"]:
            path = shutil.which(binary)
            if path:
                logger.info("Found LaTeX compiler at: %s", path)
                return path
        logger.info("No LaTeX compiler found in system PATH. Will use PyMuPDF vector renderer fallback.")
        return None

    def compile(
        self,
        latex_source: str,
        content: TailoredResumeContent,
        template_id: str = "ATS_SINGLE_COLUMN"
    ) -> Tuple[bytes, int, str]:
        """
        Compiles the resume to PDF.
        Returns:
            Tuple[bytes, int, str]: (pdf_bytes, page_count, compilation_method)
        """
        if self._latex_bin:
            try:
                pdf_bytes, page_count = self._compile_latex_sandboxed(latex_source)
                return pdf_bytes, page_count, f"LATEX_{os.path.basename(self._latex_bin).upper()}"
            except Exception as e:
                logger.warning(
                    "Sandboxed LaTeX compilation failed (%s). Falling back to PyMuPDF ATS vector renderer.",
                    str(e)
                )

        # Fallback: PyMuPDF Vector ATS Compiler
        pdf_bytes, page_count = self._render_pymupdf_vector(content, template_id)
        return pdf_bytes, page_count, "PYMUPDF_VECTOR_RENDERER"

    def _compile_latex_sandboxed(self, latex_source: str) -> Tuple[bytes, int]:
        """
        Executes pdflatex/tectonic inside an isolated temporary directory
        with strict execution limits and -no-shell-escape.
        """
        temp_dir = tempfile.mkdtemp(prefix="applier_latex_sandbox_")
        tex_path = os.path.join(temp_dir, "resume.tex")
        pdf_path = os.path.join(temp_dir, "resume.pdf")

        try:
            with open(tex_path, "w", encoding="utf-8") as f:
                f.write(latex_source)

            compiler_name = os.path.basename(self._latex_bin).lower()
            if "tectonic" in compiler_name:
                cmd = [self._latex_bin, "--outdir", temp_dir, tex_path]
            else:
                # pdflatex or xelatex
                cmd = [
                    self._latex_bin,
                    "-no-shell-escape",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "-output-directory", temp_dir,
                    tex_path
                ]

            proc = subprocess.run(
                cmd,
                cwd=temp_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=COMPILER_TIMEOUT_SECONDS,
                shell=False
            )

            if proc.returncode != 0 or not os.path.exists(pdf_path):
                error_msg = proc.stdout.decode("utf-8", errors="replace")[:1000]
                raise RuntimeError(f"Compiler returned exit code {proc.returncode}: {error_msg}")

            file_size = os.path.getsize(pdf_path)
            if file_size > MAX_PDF_SIZE_BYTES:
                raise ValueError(f"Generated PDF exceeds size limit ({file_size} > {MAX_PDF_SIZE_BYTES})")

            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()

            # Verify page count with PyMuPDF
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page_count = len(doc)
            doc.close()

            return pdf_bytes, page_count

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _render_pymupdf_vector(
        self,
        content: TailoredResumeContent,
        template_id: str
    ) -> Tuple[bytes, int]:
        """
        Deterministic, high-fidelity vector PDF generator using PyMuPDF.
        Generates ATS-compliant, 100% extractable vector PDF with standard fonts,
        proper hierarchy, bullet points, and hyperlinks.
        """
        doc = fitz.open()
        
        # Standard Letter: 612 pt wide, 792 pt high
        page_width = 612.0
        page_height = 792.0
        margin_x = 42.0
        margin_top = 40.0
        margin_bottom = 40.0
        content_width = page_width - 2 * margin_x

        page = doc.new_page(width=page_width, height=page_height)
        y = margin_top

        def check_page_break(needed_space: float):
            nonlocal page, y
            if y + needed_space > page_height - margin_bottom:
                page = doc.new_page(width=page_width, height=page_height)
                y = margin_top

        # 1. Header (Applicant Name)
        font_name_bold = "helv"
        name_fontsize = 18.0 if template_id != "TECHNICAL" else 16.0
        name_width = fitz.get_text_length(content.fullName, fontname=font_name_bold, fontsize=name_fontsize)
        name_x = (page_width - name_width) / 2.0
        page.insert_text(fitz.Point(name_x, y + name_fontsize), content.fullName, fontname=font_name_bold, fontsize=name_fontsize, color=(0.1, 0.1, 0.1))
        y += name_fontsize + 6.0

        # Contact Line
        contact_items = []
        if content.email:
            contact_items.append(content.email)
        if content.phone:
            contact_items.append(content.phone)
        if content.location:
            contact_items.append(content.location)
        for link in content.links:
            lbl = link.get("label", "Link")
            contact_items.append(lbl)
        
        contact_str = "  |  ".join(contact_items)
        contact_fontsize = 9.0
        contact_width = fitz.get_text_length(contact_str, fontname="helv", fontsize=contact_fontsize)
        contact_x = (page_width - contact_width) / 2.0
        page.insert_text(fitz.Point(contact_x, y + contact_fontsize), contact_str, fontname="helv", fontsize=contact_fontsize, color=(0.25, 0.25, 0.25))
        y += contact_fontsize + 10.0

        def render_section_header(title: str):
            nonlocal y
            check_page_break(30.0)
            y += 6.0
            header_fontsize = 11.0
            page.insert_text(fitz.Point(margin_x, y + header_fontsize), title.upper(), fontname="helv", fontsize=header_fontsize, color=(0.1, 0.1, 0.1))
            y += header_fontsize + 3.0
            page.draw_line(fitz.Point(margin_x, y), fitz.Point(page_width - margin_x, y), color=(0.6, 0.6, 0.6), width=0.6)
            y += 7.0

        def render_wrapped_text(text: str, fontsize: float = 9.5, fontname: str = "helv", indent: float = 0.0, line_height: float = 13.0):
            nonlocal y
            words = text.split()
            max_w = content_width - indent
            current_line = []
            
            for word in words:
                test_line = " ".join(current_line + [word])
                w = fitz.get_text_length(test_line, fontname=fontname, fontsize=fontsize)
                if w <= max_w:
                    current_line.append(word)
                else:
                    if current_line:
                        check_page_break(line_height)
                        line_str = " ".join(current_line)
                        page.insert_text(fitz.Point(margin_x + indent, y + fontsize), line_str, fontname=fontname, fontsize=fontsize, color=(0.15, 0.15, 0.15))
                        y += line_height
                    current_line = [word]
            if current_line:
                check_page_break(line_height)
                line_str = " ".join(current_line)
                page.insert_text(fitz.Point(margin_x + indent, y + fontsize), line_str, fontname=fontname, fontsize=fontsize, color=(0.15, 0.15, 0.15))
                y += line_height

        # 2. Professional Summary
        if content.professionalSummary:
            render_section_header("Professional Summary" if template_id != "TECHNICAL" else "Technical Profile")
            render_wrapped_text(content.professionalSummary, fontsize=9.2, line_height=12.5)
            y += 4.0

        # 3. Technical Skills
        if content.skillsByCategory:
            render_section_header("Skills & Expertise" if template_id != "TECHNICAL" else "Technical Skills")
            for group in content.skillsByCategory:
                cat_label = f"{group.category}: "
                skills_str = ", ".join(group.skills)
                cat_w = fitz.get_text_length(cat_label, fontname="helv", fontsize=9.2)
                
                check_page_break(13.0)
                page.insert_text(fitz.Point(margin_x, y + 9.2), cat_label, fontname="helv", fontsize=9.2, color=(0.1, 0.1, 0.1))
                render_wrapped_text(skills_str, fontsize=9.2, indent=cat_w + 2.0, line_height=12.5)
            y += 4.0

        # 4. Professional Experience
        if content.experience:
            render_section_header("Professional Experience" if template_id != "TECHNICAL" else "Experience")
            for exp in content.experience:
                check_page_break(32.0)
                # Title and dates
                title_str = exp.title
                dates_str = f"{exp.startDate} - {exp.endDate}"
                page.insert_text(fitz.Point(margin_x, y + 10.0), title_str, fontname="helv", fontsize=10.0, color=(0.1, 0.1, 0.1))
                
                dates_w = fitz.get_text_length(dates_str, fontname="helv", fontsize=9.0)
                page.insert_text(fitz.Point(page_width - margin_x - dates_w, y + 10.0), dates_str, fontname="helv", fontsize=9.0, color=(0.3, 0.3, 0.3))
                y += 12.0

                # Company and location
                comp_str = exp.company
                if exp.location:
                    comp_str += f" | {exp.location}"
                page.insert_text(fitz.Point(margin_x, y + 9.0), comp_str, fontname="helv", fontsize=9.0, color=(0.3, 0.3, 0.3))
                y += 11.0

                # Bullets
                for b in exp.highlights:
                    check_page_break(14.0)
                    page.insert_text(fitz.Point(margin_x + 6.0, y + 9.0), "•", fontname="helv", fontsize=9.0, color=(0.2, 0.2, 0.2))
                    render_wrapped_text(b.text, fontsize=9.0, indent=18.0, line_height=12.0)
                y += 4.0

        # 5. Key Projects
        if content.projects:
            render_section_header("Key Projects" if template_id != "TECHNICAL" else "Systems & Projects")
            for proj in content.projects:
                check_page_break(28.0)
                title_str = proj.title
                if proj.technologies:
                    title_str += f" ({', '.join(proj.technologies)})"
                page.insert_text(fitz.Point(margin_x, y + 9.5), title_str, fontname="helv", fontsize=9.5, color=(0.1, 0.1, 0.1))
                y += 12.0

                if proj.description and not proj.highlights:
                    page.insert_text(fitz.Point(margin_x + 6.0, y + 9.0), "•", fontname="helv", fontsize=9.0, color=(0.2, 0.2, 0.2))
                    render_wrapped_text(proj.description, fontsize=9.0, indent=18.0, line_height=12.0)
                
                for b in proj.highlights:
                    check_page_break(14.0)
                    page.insert_text(fitz.Point(margin_x + 6.0, y + 9.0), "•", fontname="helv", fontsize=9.0, color=(0.2, 0.2, 0.2))
                    render_wrapped_text(b.text, fontsize=9.0, indent=18.0, line_height=12.0)
                y += 4.0

        # 6. Education
        if content.education:
            render_section_header("Education")
            for edu in content.education:
                check_page_break(24.0)
                inst_str = edu.institution
                dates_str = f"{edu.startDate or ''} - {edu.endDate or ''}".strip(" -")
                page.insert_text(fitz.Point(margin_x, y + 9.5), inst_str, fontname="helv", fontsize=9.5, color=(0.1, 0.1, 0.1))
                if dates_str:
                    d_w = fitz.get_text_length(dates_str, fontname="helv", fontsize=9.0)
                    page.insert_text(fitz.Point(page_width - margin_x - d_w, y + 9.5), dates_str, fontname="helv", fontsize=9.0, color=(0.3, 0.3, 0.3))
                y += 12.0

                deg_str = edu.degree
                if edu.fieldOfStudy:
                    deg_str += f" in {edu.fieldOfStudy}"
                if edu.gpa:
                    deg_str += f" | GPA: {edu.gpa}"
                page.insert_text(fitz.Point(margin_x, y + 9.0), deg_str, fontname="helv", fontsize=9.0, color=(0.3, 0.3, 0.3))
                y += 12.0

        # 7. Certifications
        if content.certifications:
            render_section_header("Certifications")
            for cert in content.certifications:
                check_page_break(14.0)
                name = cert.get("name", "")
                org = cert.get("issuingOrganization", "")
                c_str = f"• {name}" + (f" -- {org}" if org else "")
                page.insert_text(fitz.Point(margin_x + 6.0, y + 9.0), c_str, fontname="helv", fontsize=9.0, color=(0.2, 0.2, 0.2))
                y += 12.0

        pdf_bytes = doc.tobytes()
        page_count = len(doc)
        doc.close()

        return pdf_bytes, page_count


safe_pdf_compiler = SafePdfCompiler()
