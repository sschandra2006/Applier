/**
 * QA Laboratory Embedded HTTP Test Server
 * Serves synthetic websites with deterministic endpoints, redirect chains,
 * mock file downloads, and customizable network latencies.
 */

import http from 'http';
import { QA_SCENARIOS, getScenarioByNumber, getScenarioById } from './fixtures/index.js';

export class QaLabServer {
  constructor(options = {}) {
    this.port = options.port || 0; // 0 for OS-assigned free port
    this.server = null;
    this.baseUrl = null;
    this.requestLog = [];
  }

  /**
   * Starts the embedded QA HTTP server
   * @returns {Promise<string>} Base URL (e.g. "http://127.0.0.1:54321")
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this._handleRequest(req, res));
      this.server.listen(this.port, '127.0.0.1', () => {
        const addr = this.server.address();
        this.baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve(this.baseUrl);
      });
      this.server.on('error', reject);
    });
  }

  /**
   * Closes the server cleanly
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.baseUrl = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Request routing
   */
  _handleRequest(req, res) {
    this.requestLog.push({
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    });

    const parsedUrl = new URL(req.url, this.baseUrl || 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    // CORS & Content Security Headers for synthetic testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Healthcheck
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'OK', scenariosCount: QA_SCENARIOS.length }));
      return;
    }

    // Multi-Hop Redirect Endpoints (Scenario 18)
    if (pathname === '/redirect-gate-1') {
      res.writeHead(302, { Location: '/redirect-gate-2' });
      res.end();
      return;
    }
    if (pathname === '/redirect-gate-2') {
      res.writeHead(302, { Location: '/scenarios/18' });
      res.end();
      return;
    }

    // Mock PDF Receipt Download (Scenario 26)
    if (pathname === '/receipt.pdf') {
      const mockPdf = Buffer.from('%PDF-1.4\n%QA-LAB-RECEIPT-VALID-BUFFER\n%%EOF');
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="application_receipt.pdf"'
      });
      res.end(mockPdf);
      return;
    }

    // Generic Mock Form Submit API
    if (pathname === '/api/apply' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          referenceId: 'APP-QA-2026-SUBMITTED',
          timestamp: new Date().toISOString()
        }));
      });
      return;
    }

    // Scenario Routes by Number: /scenarios/:number
    const numMatch = pathname.match(/^\/scenarios\/([0-9]+)$/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      const scenario = getScenarioByNumber(num);
      if (scenario) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(scenario.htmlFixture);
        return;
      }
    }

    // Scenario Routes by ID: /scenarios/:scenarioId
    const idMatch = pathname.match(/^\/scenarios\/(qa-[0-9]{2}-[a-z0-9-]+)$/);
    if (idMatch) {
      const scenario = getScenarioById(idMatch[1]);
      if (scenario) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(scenario.htmlFixture);
        return;
      }
    }

    // List all scenarios as HTML index
    if (pathname === '/' || pathname === '/scenarios') {
      const links = QA_SCENARIOS.map(s => `<li><a href="/scenarios/${s.scenarioNumber}">Scenario ${s.scenarioNumber}: ${s.name}</a> (${s.category})</li>`).join('\n');
      const indexHtml = `<!DOCTYPE html><html><head><title>Applier QA Lab</title></head><body><h1>Applier 2.0 Browser Automation QA Laboratory</h1><ul>${links}</ul></body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
      return;
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('QA Lab Scenario Not Found');
  }
}

export default QaLabServer;
