from services.browser_manager import BrowserManager
from bs4 import BeautifulSoup
import base64
from playwright.async_api import TimeoutError as PlaywrightTimeoutError, Error as PlaywrightError
from fastapi import HTTPException

async def scan_url(url: str):
    context = await BrowserManager.create_context()
    page = await context.new_page()
    
    try:
        await page.goto(url, wait_until="networkidle", timeout=30000)
        
        screenshot_bytes = await page.screenshot(full_page=True)
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
        
        html_content = await page.content()
        page_title = await page.title()
        
        soup = BeautifulSoup(html_content, 'html.parser')
        
        forms_data = []
        for form in soup.find_all('form'):
            form_info = {
                "action": form.get('action', ''),
                "method": form.get('method', 'get'),
                "inputs": []
            }
            
            for input_tag in form.find_all(['input', 'textarea', 'select']):
                # Extract and truncate attributes to prevent prompt blowout from embedded base64 or massive strings
                name_attr = input_tag.get('name', '')
                id_attr = input_tag.get('id', '')
                placeholder_attr = input_tag.get('placeholder', '')
                
                input_info = {
                    "tag": input_tag.name,
                    "type": input_tag.get('type', 'text') if input_tag.name == 'input' else None,
                    "name": name_attr[:100] if isinstance(name_attr, str) else str(name_attr)[:100],
                    "id": id_attr[:100] if isinstance(id_attr, str) else str(id_attr)[:100],
                    "placeholder": placeholder_attr[:100] if isinstance(placeholder_attr, str) else str(placeholder_attr)[:100]
                }
                form_info["inputs"].append(input_info)
                
            forms_data.append(form_info)
            
        return {
            "title": page_title,
            "url": url,
            "forms": forms_data,
            "screenshot": f"data:image/png;base64,{screenshot_b64}"
        }
    except PlaywrightTimeoutError as e:
        raise HTTPException(status_code=408, detail=f"Playwright Timeout while scanning {url}. The page took too long to load.")
    except PlaywrightError as e:
        raise HTTPException(status_code=400, detail=f"Playwright Browser Error scanning {url}: {e.message}")
    finally:
        await page.close()
        await context.close()
