from playwright.async_api import async_playwright, Page, BrowserContext, Browser

class BrowserManager:
    _playwright = None
    _browser: Browser = None

    @classmethod
    async def get_browser(cls) -> Browser:
        if not cls._playwright:
            cls._playwright = await async_playwright().start()
        if not cls._browser:
            cls._browser = await cls._playwright.chromium.launch(headless=True)
        return cls._browser

    @classmethod
    async def create_context(cls) -> BrowserContext:
        browser = await cls.get_browser()
        return await browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

    @classmethod
    async def close_browser(cls):
        if cls._browser:
            await cls._browser.close()
            cls._browser = None
        if cls._playwright:
            await cls._playwright.stop()
            cls._playwright = None
