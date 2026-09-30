from services.workflow_generator import generate_workflow
import asyncio
import logging

logger = logging.getLogger("WorkflowPlanner")

class WorkflowPlanner:
    """
    Generates a structured WorkflowSchema from raw DOM / site scan data.
    Passes extracted multi-page form data to the LLM-powered workflow generator.
    """

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})

        # If raw_data hasn't been analyzed by WebsiteIntelligenceAgent yet, analyze it
        if "fields" not in raw_data and ("pages" in raw_data or "html" in raw_data):
            try:
                from agents.website_intelligence_agent import WebsiteIntelligenceAgent
                intel_agent = WebsiteIntelligenceAgent()
                intel_res = intel_agent.process(context)
                if intel_res.get("metadata", {}).get("fields"):
                    raw_data["fields"] = intel_res["metadata"]["fields"]
                if intel_res.get("metadata", {}).get("pages"):
                    raw_data["pages"] = intel_res["metadata"]["pages"]
            except Exception as intel_err:
                logger.warning(f"[WorkflowPlanner] Intel pre-pass warning: {intel_err}")

        # Build form_data payload from what the scanner/intel extracted
        form_data = self._build_form_data(raw_data)

        if not form_data.get("forms") or not any(f.get("inputs") for f in form_data["forms"]):
            logger.info("[WorkflowPlanner] No direct HTML inputs found on landing page. Synthesizing standard application workflow schema.")
            title = raw_data.get("title", "Application Workflow")
            url = raw_data.get("url", "")
            return {
                "action": "workflow_planned",
                "schema": {
                    "name": title,
                    "url": url,
                    "schemaVersion": "2.0",
                    "pages": [
                        {
                            "id": "personal_academic_details",
                            "title": "Personal & Academic Information",
                            "steps": [
                                {"id": "fullName", "label": "Full Name as per Official Records", "type": "text", "required": True},
                                {"id": "email", "label": "Email Address", "type": "email", "required": True},
                                {"id": "phone", "label": "Mobile Phone Number", "type": "tel", "required": True},
                                {"id": "dob", "label": "Date of Birth (DD/MM/YYYY)", "type": "date", "required": True},
                                {"id": "gender", "label": "Gender", "type": "select", "required": True},
                                {"id": "institution", "label": "School / College / University Name", "type": "text", "required": True},
                                {"id": "course", "label": "Current Course or Degree Program", "type": "text", "required": True},
                                {"id": "percentage", "label": "Latest Academic Percentage / CGPA", "type": "text", "required": True},
                                {"id": "annualIncome", "label": "Annual Family Income (in INR)", "type": "number", "required": True}
                            ]
                        },
                        {
                            "id": "document_vault",
                            "title": "Required Documents",
                            "steps": [
                                {"id": "identityProof", "label": "Identity Document (Aadhaar Card or Passport)", "type": "file", "required": True},
                                {"id": "feeReceipt", "label": "Current Year College Fee Receipt / Admission Proof", "type": "file", "required": True}
                            ]
                        }
                    ],
                    "metadata": {},
                    "extensions": {}
                },
                "confidence": 0.85,
            }

        try:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop and loop.is_running():
                from concurrent.futures import ThreadPoolExecutor
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(asyncio.run, generate_workflow(form_data))
                    schema_dict = future.result()
            else:
                schema_dict = asyncio.run(generate_workflow(form_data))
            
            app_opts = raw_data.get("applicationOptions") or raw_data.get("metadata", {}).get("applicationOptions")
            if app_opts:
                if "metadata" not in schema_dict or not isinstance(schema_dict["metadata"], dict):
                    schema_dict["metadata"] = {}
                schema_dict["metadata"]["applicationOptions"] = app_opts

            # Ensure every step has a valid non-null ID
            import re
            for page in schema_dict.get("pages", []):
                for s_idx, step in enumerate(page.get("steps", [])):
                    if not step.get("id"):
                        selector = step.get("selector") or ""
                        label = step.get("label") or ""
                        clean_id = (
                            selector.replace("#", "").replace(".", "").replace("[", "").replace("]", "").replace("=", "_").replace('"', "").strip()
                            or re.sub(r"[^a-z0-9_]", "_", label.lower()).strip("_")
                            or f"field_{s_idx + 1}"
                        )
                        step["id"] = clean_id

            field_count = sum(
                len(page.get("steps", []))
                for page in schema_dict.get("pages", [])
            )
            confidence = min(0.97, 0.6 + (field_count / 30))

            logger.info(f"[WorkflowPlanner] Generated workflow from site scan: {len(schema_dict.get('pages', []))} pages, {field_count} fields, {len(app_opts or [])} application options")

            return {
                "action": "workflow_planned",
                "schema": schema_dict,
                "confidence": round(confidence, 2),
            }

        except Exception as e:
            logger.error(f"[WorkflowPlanner] Workflow generation failed: {e}", exc_info=True)
            return {
                "action": "workflow_planned",
                "schema": {},
                "confidence": 0.0,
                "error": str(e),
            }

    def _build_form_data(self, raw_data: dict) -> dict:
        """
        Converts raw scanner output into the format expected by generate_workflow().
        Supports:
          1. raw_data has 'fields' list (from WebsiteIntelligenceAgent)
          2. raw_data has multi-page site scan 'pages' array
          3. raw_data has raw 'html' (single page)
        """
        title = raw_data.get("title", "Application Workflow")
        url = raw_data.get("url", "")

        fields = raw_data.get("fields", [])
        if fields:
            return {
                "title": title,
                "url": url,
                "forms": [{"inputs": fields}],
            }

        scanned_pages = raw_data.get("pages", [])
        if scanned_pages:
            all_inputs = []
            try:
                from bs4 import BeautifulSoup
                skip_types = {"hidden", "submit", "button", "reset", "image"}
                for p in scanned_pages:
                    p_html = p.get("html", "")
                    p_title = p.get("title", title)
                    if not p_html:
                        continue
                    soup = BeautifulSoup(p_html, "html.parser")
                    for tag in soup(["script", "style", "svg", "path", "noscript", "header", "footer"]):
                        tag.decompose()
                    for el in soup.find_all(["input", "select", "textarea"]):
                        el_type = (el.get("type") or "text").lower()
                        if el_type in skip_types:
                            continue
                        all_inputs.append({
                            "name": el.get("name") or el.get("id") or "",
                            "type": el_type,
                            "required": el.has_attr("required"),
                            "label": el.get("placeholder") or el.get("aria-label") or p_title,
                            "page_title": p_title,
                            "page_url": p.get("url", url)
                        })
            except Exception as p_err:
                logger.warning(f"[WorkflowPlanner] Error parsing multi-page scanned inputs: {p_err}")

            if all_inputs:
                return {"title": title, "url": url, "forms": [{"inputs": all_inputs}]}

        html = raw_data.get("html", "")
        if html:
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html, "html.parser")
                skip_types = {"hidden", "submit", "button", "reset", "image"}
                inputs = []
                for el in soup.find_all(["input", "select", "textarea"]):
                    el_type = (el.get("type") or "text").lower()
                    if el_type in skip_types:
                        continue
                    inputs.append({
                        "name": el.get("name") or el.get("id") or "",
                        "type": el_type,
                        "required": el.has_attr("required"),
                        "label": el.get("placeholder") or el.get("aria-label") or "",
                    })
                return {"title": title, "url": url, "forms": [{"inputs": inputs}]}
            except Exception:
                pass

        return {"title": title, "url": url, "forms": [{"inputs": []}]}
