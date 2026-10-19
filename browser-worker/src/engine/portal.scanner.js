/**
 * Portal DOM Scanner & Web Crawler
 * Phase 2: Distributed Browser Worker Architecture
 *
 * Extracted from automation.service.js. Runs inside browser-worker to extract DOM,
 * forms, and screenshots for AI Workflow Planning.
 */

import { defaultBrowserManager } from './browser.manager.js';

export class PortalScanner {
  constructor(browserManager = defaultBrowserManager) {
    this.browserManager = browserManager;
  }

  async scan(url, options = {}) {
    const maxPages = options.maxPages || 10;
    const maxDepth = options.maxDepth || 2;

    const browser = await this.browserManager.launchBrowser();

    try {
      const parsedStart = new URL(url);
      const baseOrigin = parsedStart.origin;
      const visitedUrls = new Set();
      const queue = [{ url, depth: 0 }];
      const scannedPages = [];
      let landingScreenshot = null;
      let landingTitle = '';

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      while (queue.length > 0 && scannedPages.length < maxPages) {
        const { url: currentUrl, depth } = queue.shift();

        let normalizedUrl;
        try {
          const u = new URL(currentUrl);
          u.hash = '';
          normalizedUrl = u.toString();
        } catch (e) {
          continue;
        }

        if (visitedUrls.has(normalizedUrl)) continue;
        visitedUrls.add(normalizedUrl);

        const page = await context.newPage();
        try {
          await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          try {
            await page.waitForLoadState('networkidle', { timeout: 8000 });
          } catch (e) {
            // Soft fallback if networkidle times out
          }

          const pageTitle = await page.title();
          const pageHtml = await page.content();
          let screenshotBase64 = null;

          if (scannedPages.length === 0) {
            landingTitle = pageTitle;
            const screenshotBuf = await page.screenshot({ fullPage: true });
            screenshotBase64 = screenshotBuf.toString('base64');
            landingScreenshot = screenshotBase64;
          }

          scannedPages.push({
            url: normalizedUrl,
            title: pageTitle,
            depth,
            html: pageHtml,
            screenshot: screenshotBase64
          });

          // Discovered links crawl
          if (depth < maxDepth) {
            const discovered = await page.evaluate(() => {
              const links = [];
              const elements = document.querySelectorAll('a[href], form[action], button[onclick], nav a');
              for (const el of elements) {
                const href = el.getAttribute('href') || el.getAttribute('action');
                const text = el.textContent ? el.textContent.trim() : '';
                if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                  links.push({ href, text });
                }
              }
              return links;
            });

            const ctaKeywords = /apply|register|portal|scholarship|fresh|renewal|epass|buddy4study|admission|login/i;

            for (const { href, text } of discovered) {
              try {
                const absUrl = new URL(href, normalizedUrl);
                const isSameOrigin = absUrl.origin === baseOrigin;
                const isKeywordMatch = ctaKeywords.test(text) || ctaKeywords.test(absUrl.pathname);

                if (isSameOrigin && isKeywordMatch) {
                  absUrl.hash = '';
                  const cleanHref = absUrl.toString();
                  if (!visitedUrls.has(cleanHref) && !queue.some((q) => q.url === cleanHref)) {
                    queue.push({ url: cleanHref, depth: depth + 1 });
                  }
                }
              } catch (_) {}
            }
          }
        } catch (pageErr) {
          // Log page crawl error and continue with remaining queue
        } finally {
          await page.close().catch(() => {});
        }
      }

      await context.close().catch(() => {});

      const combinedHtml = scannedPages.map((p) => `<!-- URL: ${p.url} -->\n${p.html}`).join('\n\n');

      return {
        url,
        title: landingTitle,
        pages: scannedPages,
        html: combinedHtml,
        screenshot: landingScreenshot,
        landingScreenshot
      };
    } finally {
      await this.browserManager.closeBrowser(browser);
    }
  }
}

export const defaultPortalScanner = new PortalScanner();
export default defaultPortalScanner;
