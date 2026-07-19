from services.browser_manager import BrowserManager
from typing import Dict, Any
import httpx
import logging
import asyncio
import base64

logger = logging.getLogger(__name__)
NODE_API_URL = "http://127.0.0.1:5000/api/v1"

# In-memory store for paused jobs
ACTIVE_PAUSES: Dict[str, asyncio.Event] = {}
PAUSED_STATE: Dict[str, Any] = {}

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

async def resume_automation(job_id: str, new_answers: Dict[str, Any]):
    """Called by the API to resume a paused job with new answers (e.g. OTP)."""
    if job_id in ACTIVE_PAUSES:
        PAUSED_STATE[job_id].update(new_answers)
        ACTIVE_PAUSES[job_id].set()
        return True
    return False

async def execute_automation(job_id: str, target_url: str, schema: Dict[str, Any], answers: Dict[str, Any]):
    try:
        await report_status(job_id, "RUNNING", f"Initializing browser for {target_url}")
        
        bm = BrowserManager()
        page = await bm.get_page()
        
        await page.goto(target_url, wait_until="networkidle")
        PAUSED_STATE[job_id] = answers.copy()
        
        for step in schema.get("steps", []):
            await report_status(job_id, "RUNNING", f"Executing step: {step.get('name')}")
            
            for field in step.get("fields", []):
                field_name = field.get("name")
                field_type = field.get("type", "text")
                requires_human = field.get("requires_human", False) or field_type in ["otp", "captcha", "payment"]
                
                # PAUSE MECHANISM
                if requires_human:
                    await report_status(job_id, "PAUSED_FOR_USER_INPUT", f"Waiting for {field_name} (Human in the loop required)")
                    event = asyncio.Event()
                    ACTIVE_PAUSES[job_id] = event
                    await event.wait() # Block until the user submits the required info via the API
                    del ACTIVE_PAUSES[job_id]
                    await report_status(job_id, "RUNNING", "Resuming automation...")

                # Get latest answers (including anything injected during a pause)
                current_answers = PAUSED_STATE.get(job_id, {})
                value = current_answers.get(field_name)
                
                if not value:
                    continue
                    
                selector = f"input[name='{field_name}'], input[id='{field_name}'], textarea[name='{field_name}']"
                
                try:
                    element = await page.wait_for_selector(selector, timeout=5000)
                    if element:
                        if field_type in ["text", "email", "number", "otp", "password"]:
                            await element.fill(str(value))
                        elif field_type == "checkbox":
                            if str(value).lower() == 'true':
                                await element.check()
                        elif field_type == "select":
                            await page.select_option(selector, str(value))
                            
                        await asyncio.sleep(0.5)
                except Exception as e:
                    logger.warning(f"Failed to fill field {field_name}: {e}")
                    
        await page.wait_for_timeout(2000)
        screenshot_bytes = await page.screenshot(full_page=True)
        base64_receipt = base64.b64encode(screenshot_bytes).decode('utf-8')
        
        # Cleanup
        if job_id in PAUSED_STATE:
            del PAUSED_STATE[job_id]
            
        await report_status(
            job_id, 
            "COMPLETED", 
            "Successfully submitted application.",
            additional_data={
                "base64Receipt": base64_receipt,
                "applicationNumber": "PENDING_OCR_EXTRACTION"
            }
        )
        
    except Exception as e:
        await report_status(job_id, "FAILED", f"Automation crashed: {str(e)}")
