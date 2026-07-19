import asyncio
from playwright.async_api import async_playwright, Page, BrowserContext, Browser

class BrowserManager:
    _playwright = None
    _browser: Browser = None
    _context: BrowserContext = None
    _page: Page = None

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
    async def get_page(cls) -> Page:
        """Returns the active page, initializing browser and context if needed."""
        if not cls._page or cls._page.is_closed():
            if not cls._context:
                cls._context = await cls.create_context()
            cls._page = await cls._context.new_page()
        return cls._page

    @classmethod
    async def close_browser(cls):
        if cls._context:
            await cls._context.close()
            cls._context = None
        if cls._browser:
            await cls._browser.close()
            cls._browser = None
        if cls._playwright:
            await cls._playwright.stop()
            cls._playwright = None
