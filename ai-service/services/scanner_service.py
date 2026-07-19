from services.browser_manager import BrowserManager
from bs4 import BeautifulSoup
import base64

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
                input_info = {
                    "tag": input_tag.name,
                    "type": input_tag.get('type', 'text') if input_tag.name == 'input' else None,
                    "name": input_tag.get('name', ''),
                    "id": input_tag.get('id', ''),
                    "placeholder": input_tag.get('placeholder', '')
                }
                form_info["inputs"].append(input_info)
                
            forms_data.append(form_info)
            
        return {
            "title": page_title,
            "url": url,
            "forms": forms_data,
            "screenshot": f"data:image/png;base64,{screenshot_b64}"
        }
    finally:
        await page.close()
        await context.close()
