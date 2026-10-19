"""
LaTeX Template Registry for Applier 3.0
Provides ATS-friendly, technical, and modern professional LaTeX templates
with strict LaTeX character escaping and structured JSON-to-LaTeX rendering.
"""

import re
from typing import Dict, Any, List, Optional
from core.models import TailoredResumeContent, TailoredExperienceItem, TailoredEducationItem, TailoredProjectItem, TailoredSkillGroup


def escape_latex(text: Optional[str]) -> str:
    """
    Safely escapes LaTeX special characters in user text to prevent macro injection
    and compilation crashes.
    """
    if text is None:
        return ""
    
    s = str(text)
    
    # Use pure alphanumeric sentinel tokens without underscores
    BS_SENTINEL = "\x00LATEXBS\x00"
    TILDE_SENTINEL = "\x00LATEXTILDE\x00"
    CARET_SENTINEL = "\x00LATEXCARET\x00"
    
    s = s.replace('\\', BS_SENTINEL)
    s = s.replace('~', TILDE_SENTINEL)
    s = s.replace('^', CARET_SENTINEL)
    
    # Standard special characters (including braces)
    special_chars = [
        ('{', r'\{'),
        ('}', r'\}'),
        ('&', r'\&'),
        ('%', r'\%'),
        ('$', r'\$'),
        ('#', r'\#'),
        ('_', r'\_'),
        ('<', r'\textless{}'),
        ('>', r'\textgreater{}'),
    ]
    for char, replacement in special_chars:
        s = s.replace(char, replacement)
        
    # Replace sentinels with target LaTeX commands
    s = s.replace(BS_SENTINEL, r'\textbackslash{}')
    s = s.replace(TILDE_SENTINEL, r'\textasciitilde{}')
    s = s.replace(CARET_SENTINEL, r'\textasciicircum{}')
    
    return s


def escape_latex_url(url: Optional[str]) -> str:
    """Escapes special characters in URLs for hyperref."""
    if not url:
        return ""
    u = str(url)
    u = u.replace('%', r'\%').replace('#', r'\#').replace('&', r'\&')
    return u


class LatexTemplateRegistry:
    """
    Manages LaTeX templates and compiles structured TailoredResumeContent into
    clean, valid, and ATS-compliant LaTeX source.
    """

    TEMPLATES = {
        "ATS_SINGLE_COLUMN": "ATS-friendly Single-Column",
        "TECHNICAL": "Technical & Engineering Resume",
        "MODERN_PROFESSIONAL": "Modern Professional Resume"
    }

    def __init__(self):
        pass

    def render(self, template_id: str, content: TailoredResumeContent) -> str:
        """
        Renders structured resume content into safe LaTeX source using the requested template.
        """
        tid = template_id.upper() if template_id else "ATS_SINGLE_COLUMN"
        if tid not in self.TEMPLATES:
            tid = "ATS_SINGLE_COLUMN"

        if tid == "ATS_SINGLE_COLUMN":
            return self._render_ats_single_column(content)
        elif tid == "TECHNICAL":
            return self._render_technical(content)
        elif tid == "MODERN_PROFESSIONAL":
            return self._render_modern_professional(content)
        else:
            return self._render_ats_single_column(content)

    def _render_ats_single_column(self, content: TailoredResumeContent) -> str:
        """
        ATS-Friendly Single-Column Template:
        Prioritizes maximum ATS parseability: standard margins, clean standard fonts,
        no multi-column hacks, explicit section headings.
        """
        # Header contact items
        contact_parts = []
        if content.email:
            contact_parts.append(f"\\href{{mailto:{escape_latex_url(content.email)}}}{{{escape_latex(content.email)}}}")
        if content.phone:
            contact_parts.append(escape_latex(content.phone))
        if content.location:
            contact_parts.append(escape_latex(content.location))
        for link in content.links:
            label = link.get("label", "Link")
            url = link.get("url", "")
            if url:
                contact_parts.append(f"\\href{{{escape_latex_url(url)}}}{{{escape_latex(label)}}}")
        contact_line = " $\\mid$ ".join(contact_parts)

        # Skills section
        skills_lines = []
        for group in content.skillsByCategory:
            cat_name = escape_latex(group.category)
            skills_str = escape_latex(", ".join(group.skills))
            skills_lines.append(f"\\textbf{{{cat_name}:}} {skills_str} \\\\")
        skills_block = "\n".join(skills_lines)

        # Experience section
        exp_blocks = []
        for exp in content.experience:
            dates = f"{escape_latex(exp.startDate)} -- {escape_latex(exp.endDate)}"
            loc = f", {escape_latex(exp.location)}" if exp.location else ""
            title_line = f"\\textbf{{{escape_latex(exp.title)}}} \\hfill {{{dates}}}\\\\"
            company_line = f"\\textit{{{escape_latex(exp.company)}{loc}}} \\hfill"
            
            bullet_items = []
            for b in exp.highlights:
                bullet_items.append(f"  \\item {escape_latex(b.text)}")
            bullets_block = "\n".join(bullet_items)

            exp_blocks.append(f"""
{title_line}
{company_line}
\\begin{{itemize}}[leftmargin=1.5em, itemsep=1pt, parsep=0pt, topsep=2pt]
{bullets_block}
\\end{{itemize}}
\\vspace{{3pt}}
""")
        experience_rendered = "\n".join(exp_blocks)

        # Projects section
        proj_blocks = []
        for proj in content.projects:
            tech_str = f" \\textit{{({escape_latex(', '.join(proj.technologies))})}}" if proj.technologies else ""
            url_str = f" [\\href{{{escape_latex_url(proj.url)}}}{{Link}}]" if proj.url else ""
            title_line = f"\\textbf{{{escape_latex(proj.title)}}}{tech_str}{url_str} \\hfill"
            
            bullet_items = []
            if proj.description and not proj.highlights:
                bullet_items.append(f"  \\item {escape_latex(proj.description)}")
            for b in proj.highlights:
                bullet_items.append(f"  \\item {escape_latex(b.text)}")
            bullets_block = "\n".join(bullet_items)

            proj_blocks.append(f"""
{title_line}
\\begin{{itemize}}[leftmargin=1.5em, itemsep=1pt, parsep=0pt, topsep=2pt]
{bullets_block}
\\end{{itemize}}
\\vspace{{3pt}}
""")
        projects_rendered = "\n".join(proj_blocks)

        # Education section
        edu_blocks = []
        for edu in content.education:
            dates = f"{escape_latex(edu.startDate or '')} -- {escape_latex(edu.endDate or '')}".strip(" -")
            gpa_str = f" $\\mid$ GPA: {escape_latex(edu.gpa)}" if edu.gpa else ""
            degree_str = escape_latex(edu.degree)
            if edu.fieldOfStudy:
                degree_str += f" in {escape_latex(edu.fieldOfStudy)}"
            edu_blocks.append(f"""
\\textbf{{{escape_latex(edu.institution)}}} \\hfill {{{dates}}}\\\\
\\textit{{{degree_str}}}{gpa_str}
\\vspace{{3pt}}
""")
        education_rendered = "\n".join(edu_blocks)

        # Certifications section
        cert_blocks = []
        for cert in content.certifications:
            name = escape_latex(cert.get("name", ""))
            org = escape_latex(cert.get("issuingOrganization", ""))
            date = escape_latex(cert.get("issueDate", ""))
            detail = f" -- {org}" if org else ""
            date_str = f" \\hfill {{{date}}}" if date else ""
            cert_blocks.append(f"\\item \\textbf{{{name}}}{detail}{date_str}")
        certifications_rendered = "\n".join(cert_blocks)

        # Assemble full LaTeX document
        doc = f"""\\documentclass[10pt,letterpaper]{{article}}
\\usepackage[margin=0.65in]{{geometry}}
\\usepackage{{enumitem}}
\\usepackage{{hyperref}}
\\usepackage{{titlesec}}
\\usepackage{{parskip}}

\\hypersetup{{
    colorlinks=true,
    linkcolor=black,
    urlcolor=black
}}

\\titleformat{{\\section}}{{\\large\\bfseries\\uppercase}}{{}}{{0em}}{{}}[\\titlerule]
\\titlespacing*{{\\section}}{{0pt}}{{8pt}}{{4pt}}

\\pagestyle{{empty}}

\\begin{{document}}

% HEADER
\\begin{{center}}
    {{\\LARGE \\textbf{{{escape_latex(content.fullName)}}}}}\\\\
    \\vspace{{3pt}}
    {contact_line}
\\end{{center}}
\\vspace{{-4pt}}

% PROFESSIONAL SUMMARY
\\section*{{Professional Summary}}
{escape_latex(content.professionalSummary)}

% TECHNICAL SKILLS
\\section*{{Skills \\& Expertise}}
{skills_block}

% WORK EXPERIENCE
\\section*{{Professional Experience}}
{experience_rendered}

% PROJECTS
\\section*{{Key Projects}}
{projects_rendered}

% EDUCATION
\\section*{{Education}}
{education_rendered}
"""
        if cert_blocks:
            doc += f"""
% CERTIFICATIONS
\\section*{{Certifications}}
\\begin{{itemize}}[leftmargin=1.5em, itemsep=1pt, parsep=0pt, topsep=2pt]
{certifications_rendered}
\\end{{itemize}}
"""
        doc += "\n\\end{document}\n"
        return doc

    def _render_technical(self, content: TailoredResumeContent) -> str:
        """
        Technical Resume Template:
        Optimized for software/cloud/systems engineers, putting skills and project architectures front and center.
        """
        contact_parts = []
        if content.email:
            contact_parts.append(f"\\href{{mailto:{escape_latex_url(content.email)}}}{{{escape_latex(content.email)}}}")
        if content.phone:
            contact_parts.append(escape_latex(content.phone))
        if content.location:
            contact_parts.append(escape_latex(content.location))
        for link in content.links:
            label = link.get("label", "Code")
            url = link.get("url", "")
            if url:
                contact_parts.append(f"\\href{{{escape_latex_url(url)}}}{{{escape_latex(label)}}}")
        contact_line = " $\\cdot$ ".join(contact_parts)

        # Technical skills tabular format
        skills_lines = []
        for group in content.skillsByCategory:
            cat_name = escape_latex(group.category)
            skills_str = escape_latex(", ".join(group.skills))
            skills_lines.append(f"\\textbf{{{cat_name}:}} & {skills_str} \\\\")
        skills_block = "\n".join(skills_lines)

        # Experience
        exp_blocks = []
        for exp in content.experience:
            dates = f"{escape_latex(exp.startDate)} -- {escape_latex(exp.endDate)}"
            loc = f" | {escape_latex(exp.location)}" if exp.location else ""
            title_line = f"\\textbf{{{escape_latex(exp.company)}}} -- \\textit{{{escape_latex(exp.title)}}}{loc} \\hfill {{{dates}}}"
            
            bullet_items = []
            for b in exp.highlights:
                bullet_items.append(f"  \\item {escape_latex(b.text)}")
            bullets_block = "\n".join(bullet_items)

            exp_blocks.append(f"""
{title_line}
\\begin{{itemize}}[leftmargin=1.2em, itemsep=1pt, parsep=0pt, topsep=2pt]
{bullets_block}
\\end{{itemize}}
\\vspace{{2pt}}
""")
        experience_rendered = "\n".join(exp_blocks)

        # Projects
        proj_blocks = []
        for proj in content.projects:
            tech_str = f" \\textbar\\ \\textit{{{escape_latex(', '.join(proj.technologies))}}}" if proj.technologies else ""
            url_str = f" [\\href{{{escape_latex_url(proj.url)}}}{{Source}}]" if proj.url else ""
            title_line = f"\\textbf{{{escape_latex(proj.title)}}}{tech_str}{url_str} \\hfill"
            
            bullet_items = []
            if proj.description and not proj.highlights:
                bullet_items.append(f"  \\item {escape_latex(proj.description)}")
            for b in proj.highlights:
                bullet_items.append(f"  \\item {escape_latex(b.text)}")
            bullets_block = "\n".join(bullet_items)

            proj_blocks.append(f"""
{title_line}
\\begin{{itemize}}[leftmargin=1.2em, itemsep=1pt, parsep=0pt, topsep=2pt]
{bullets_block}
\\end{{itemize}}
\\vspace{{2pt}}
""")
        projects_rendered = "\n".join(proj_blocks)

        # Education
        edu_blocks = []
        for edu in content.education:
            dates = f"{escape_latex(edu.startDate or '')} -- {escape_latex(edu.endDate or '')}".strip(" -")
            gpa_str = f" (GPA: {escape_latex(edu.gpa)})" if edu.gpa else ""
            degree_str = escape_latex(edu.degree)
            if edu.fieldOfStudy:
                degree_str += f" in {escape_latex(edu.fieldOfStudy)}"
            edu_blocks.append(f"\\textbf{{{escape_latex(edu.institution)}}}, {degree_str}{gpa_str} \\hfill {{{dates}}}\\\\")
        education_rendered = "\n".join(edu_blocks)

        doc = f"""\\documentclass[10pt,letterpaper]{{article}}
\\usepackage[margin=0.5in]{{geometry}}
\\usepackage{{enumitem}}
\\usepackage{{hyperref}}
\\usepackage{{titlesec}}
\\usepackage{{parskip}}

\\hypersetup{{
    colorlinks=true,
    linkcolor=black,
    urlcolor=black
}}

\\titleformat{{\\section}}{{\\large\\bfseries\\scshape}}{{}}{{0em}}{{}}[\\titlerule]
\\titlespacing*{{\\section}}{{0pt}}{{6pt}}{{3pt}}

\\pagestyle{{empty}}

\\begin{{document}}

% HEADER
\\begin{{center}}
    {{\\LARGE \\textbf{{{escape_latex(content.fullName)}}}}}\\\\
    \\vspace{{2pt}}
    {contact_line}
\\end{{center}}
\\vspace{{-4pt}}

% SUMMARY
\\section*{{Technical Profile}}
{escape_latex(content.professionalSummary)}

% SKILLS
\\section*{{Technical Skills}}
\\begin{{tabular}}{{@{{}}p{{3.2cm}} p{{13.5cm}}@{{}}}}
{skills_block}
\\end{{tabular}}

% EXPERIENCE
\\section*{{Experience}}
{experience_rendered}

% PROJECTS
\\section*{{Systems \\& Projects}}
{projects_rendered}

% EDUCATION
\\section*{{Education}}
{education_rendered}

\\end{{document}}
"""
        return doc

    def _render_modern_professional(self, content: TailoredResumeContent) -> str:
        """
        Modern Professional Resume Template:
        Clean executive style with refined typography and balanced whitespace.
        """
        contact_parts = []
        if content.email:
            contact_parts.append(f"\\href{{mailto:{escape_latex_url(content.email)}}}{{{escape_latex(content.email)}}}")
        if content.phone:
            contact_parts.append(escape_latex(content.phone))
        if content.location:
            contact_parts.append(escape_latex(content.location))
        for link in content.links:
            label = link.get("label", "Portfolio")
            url = link.get("url", "")
            if url:
                contact_parts.append(f"\\href{{{escape_latex_url(url)}}}{{{escape_latex(label)}}}")
        contact_line = " $\\mid$ ".join(contact_parts)

        # Skills
        skills_lines = []
        for group in content.skillsByCategory:
            cat_name = escape_latex(group.category)
            skills_str = escape_latex(", ".join(group.skills))
            skills_lines.append(f"\\textbf{{{cat_name}:}} {skills_str} \\\\")
        skills_block = "\n".join(skills_lines)

        # Experience
        exp_blocks = []
        for exp in content.experience:
            dates = f"{escape_latex(exp.startDate)} -- {escape_latex(exp.endDate)}"
            loc = f" -- {escape_latex(exp.location)}" if exp.location else ""
            title_line = f"\\textbf{{{escape_latex(exp.title)}}} \\hfill {{{dates}}}\\\\"
            company_line = f"\\textsc{{{escape_latex(exp.company)}}}{loc} \\hfill"
            
            bullet_items = []
            for b in exp.highlights:
                bullet_items.append(f"  \\item {escape_latex(b.text)}")
            bullets_block = "\n".join(bullet_items)

            exp_blocks.append(f"""
{title_line}
{company_line}
\\begin{{itemize}}[leftmargin=1.5em, itemsep=1.5pt, parsep=0pt, topsep=2pt]
{bullets_block}
\\end{{itemize}}
\\vspace{{3pt}}
""")
        experience_rendered = "\n".join(exp_blocks)

        # Projects
        proj_blocks = []
        for proj in content.projects:
            tech_str = f" \\textit{{({escape_latex(', '.join(proj.technologies))})}}" if proj.technologies else ""
            title_line = f"\\textbf{{{escape_latex(proj.title)}}}{tech_str} \\hfill"
            
            bullet_items = []
            if proj.description and not proj.highlights:
                bullet_items.append(f"  \\item {escape_latex(proj.description)}")
            for b in proj.highlights:
                bullet_items.append(f"  \\item {escape_latex(b.text)}")
            bullets_block = "\n".join(bullet_items)

            proj_blocks.append(f"""
{title_line}
\\begin{{itemize}}[leftmargin=1.5em, itemsep=1.5pt, parsep=0pt, topsep=2pt]
{bullets_block}
\\end{{itemize}}
\\vspace{{3pt}}
""")
        projects_rendered = "\n".join(proj_blocks)

        # Education
        edu_blocks = []
        for edu in content.education:
            dates = f"{escape_latex(edu.startDate or '')} -- {escape_latex(edu.endDate or '')}".strip(" -")
            gpa_str = f" $\\mid$ GPA: {escape_latex(edu.gpa)}" if edu.gpa else ""
            degree_str = escape_latex(edu.degree)
            if edu.fieldOfStudy:
                degree_str += f" in {escape_latex(edu.fieldOfStudy)}"
            edu_blocks.append(f"""
\\textbf{{{escape_latex(edu.institution)}}} \\hfill {{{dates}}}\\\\
\\textit{{{degree_str}}}{gpa_str}
\\vspace{{3pt}}
""")
        education_rendered = "\n".join(edu_blocks)

        doc = f"""\\documentclass[11pt,letterpaper]{{article}}
\\usepackage[margin=0.7in]{{geometry}}
\\usepackage{{enumitem}}
\\usepackage{{hyperref}}
\\usepackage{{titlesec}}
\\usepackage{{parskip}}

\\hypersetup{{
    colorlinks=true,
    linkcolor=black,
    urlcolor=black
}}

\\titleformat{{\\section}}{{\\large\\bfseries}}{{}}{{0em}}{{}}[\\titlerule]
\\titlespacing*{{\\section}}{{0pt}}{{8pt}}{{4pt}}

\\pagestyle{{empty}}

\\begin{{document}}

% HEADER
\\begin{{center}}
    {{\\huge \\textbf{{{escape_latex(content.fullName)}}}}}\\\\
    \\vspace{{4pt}}
    {contact_line}
\\end{{center}}
\\vspace{{-2pt}}

% SUMMARY
\\section*{{Executive Profile}}
{escape_latex(content.professionalSummary)}

% SKILLS
\\section*{{Core Competencies}}
{skills_block}

% EXPERIENCE
\\section*{{Experience \\& Achievements}}
{experience_rendered}

% PROJECTS
\\section*{{Selected Initiatives}}
{projects_rendered}

% EDUCATION
\\section*{{Education}}
{education_rendered}

\\end{{document}}
"""
        return doc


latex_template_registry = LatexTemplateRegistry()
