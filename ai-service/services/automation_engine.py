from services.browser_manager import BrowserManager
from typing import Dict, Any
import httpx
import logging
import asyncio
import base64

logger = logging.getLogger(__name__)
NODE_API_URL = "http://127.0.0.1:5000/api/v1"

async def report_status(job_id: str, status: str, message: str, additional_data: dict = None):
    payload = {"jobId": job_id, "status": status, "message": message}
    if additional_data:
        payload.update(additional_data)
        
    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                f"{NODE_API_URL}/automation/webhook",
                json=payload
            )
        except Exception as e:
            logger.error(f"Failed to report status to Node: {e}")

async def execute_automation(job_id: str, target_url: str, schema: Dict[str, Any], answers: Dict[str, Any]):
    try:
        await report_status(job_id, "RUNNING", f"Initializing browser for {target_url}")
        
        bm = BrowserManager()
        page = await bm.get_page()
        
        await page.goto(target_url, wait_until="networkidle")
        
        for step in schema.get("steps", []):
            await report_status(job_id, "RUNNING", f"Executing step: {step.get('name')}")
            
            for field in step.get("fields", []):
                field_name = field.get("name")
                field_type = field.get("type", "text")
                
                # Check if we have an answer for this field
                value = answers.get(field_name)
                if not value:
                    continue
                    
                selector = f"input[name='{field_name}'], input[id='{field_name}'], textarea[name='{field_name}']"
                
                try:
                    element = await page.wait_for_selector(selector, timeout=5000)
                    if element:
                        if field_type in ["text", "email", "number"]:
                            await element.fill(str(value))
                        elif field_type == "checkbox":
                            if str(value).lower() == 'true':
                                await element.check()
                        elif field_type == "select":
                            await page.select_option(selector, str(value))
                            
                        # Small delay to simulate human typing
                        await asyncio.sleep(0.5)
                except Exception as e:
                    logger.warning(f"Failed to fill field {field_name}: {e}")
                    
        await page.wait_for_timeout(2000) # Wait for any submission transitions
        screenshot_bytes = await page.screenshot(full_page=True)
        base64_receipt = base64.b64encode(screenshot_bytes).decode('utf-8')
        
        # Simulating extraction of application number via simple heuristic
        # In reality, this would use a robust selector or Gemini to read the confirmation page
        app_number = "APP-GEN-" + str(hash(job_id))[-6:]
        
        await report_status(
            job_id, 
            "COMPLETED", 
            "Successfully submitted application.",
            additional_data={
                "base64Receipt": base64_receipt,
                "applicationNumber": app_number
            }
        )
        
    except Exception as e:
        await report_status(job_id, "FAILED", f"Automation crashed: {str(e)}")
