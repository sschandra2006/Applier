from services.workflow_generator import generate_workflow
import asyncio
import logging

logger = logging.getLogger("WorkflowPlanner")

class WorkflowPlanner:
    """
    Generates a structured WorkflowSchema from raw DOM data.
    Passes the extracted form data from WebsiteIntelligenceAgent
    to the LLM-powered workflow generator.
    """

    def process(self, context: dict) -> dict:
        raw_data = context.get("raw_data", {})

        # Build form_data payload from what the scanner extracted
        # raw_data can contain: html, url, title, fields (from WebsiteIntelligenceAgent)
        form_data = self._build_form_data(raw_data)

        if not form_data.get("forms") or not any(f.get("inputs") for f in form_data["forms"]):
            logger.warning("[WorkflowPlanner] No form inputs found in raw_data. Returning minimal schema.")
            return {
                "action": "workflow_planned",
                "schema": {
                    "name": raw_data.get("title", "Application Workflow"),
                    "url": raw_data.get("url", ""),
                    "schemaVersion": "2.0",
                    "pages": [],
                    "metadata": {},
                    "extensions": {}
                },
                "confidence": 0.3,
            }

        try:
            schema_dict = asyncio.get_event_loop().run_until_complete(
                generate_workflow(form_data)
            )
            field_count = sum(
                len(page.get("steps", []))
                for page in schema_dict.get("pages", [])
            )
            confidence = min(0.97, 0.6 + (field_count / 30))

            logger.info(f"[WorkflowPlanner] Generated workflow: {len(schema_dict.get('pages', []))} pages, {field_count} fields")

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
        Supports two shapes:
          1. raw_data has 'fields' list (from WebsiteIntelligenceAgent)
          2. raw_data has raw 'html' (passed directly from Node.js scanUrl)
        """
        title = raw_data.get("title", "Application Workflow")
        url = raw_data.get("url", "")

        # If WebsiteIntelligenceAgent already extracted fields, use them directly
        fields = raw_data.get("fields", [])
        if fields:
            return {
                "title": title,
                "url": url,
                "forms": [{"inputs": fields}],
            }

        # If only HTML is provided, extract a lightweight field list from it
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
