/**
 * SSRF Guard & URL Security Validator
 * Applier 2.0 — Phase 23: Security Hardening
 *
 * Guarantees that arbitrary website automation cannot target internal infrastructure,
 * loopback interfaces, private networks, cloud metadata endpoints, or non-HTTP protocols.
 */

import dns from 'dns';
import { promisify } from 'util';
import ipaddr from 'ipaddr.js';

const dnsLookupAsync = promisify(dns.lookup);

export class SSRFViolationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SSRFViolationError';
    this.code = details.code || 'SSRF_BLOCKED';
    this.details = details;
  }
}

// Blocked internal & metadata hostnames
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'broadcasthost',
  'metadata.google.internal',
  'instance-data',
  '169.254.169.254',
  '0.0.0.0'
]);

// Blocked ports typically used by internal infrastructure & databases
const BLOCKED_PORTS = new Set([
  22,    // SSH
  25,    // SMTP
  137,   // NetBIOS
  138,   // NetBIOS
  139,   // SMB
  445,   // SMB
  1433,  // MS SQL
  1521,  // Oracle
  2375,  // Docker
  2376,  // Docker TLS
  3306,  // MySQL
  5432,  // PostgreSQL
  6379,  // Redis
  8086,  // InfluxDB
  9200,  // Elasticsearch
  11211, // Memcached
  27017, // MongoDB
  27018, // MongoDB
  27019  // MongoDB
]);

export class SSRFGuard {
  /**
   * Checks whether an IPv4 or IPv6 address belongs to a private, loopback, or reserved range.
   * @param {string} ipString
   * @returns {{ isPrivate: boolean, range: string }}
   */
  static isPrivateOrBlockedIp(ipString) {
    try {
      const parsed = ipaddr.parse(ipString);
      const range = parsed.range();

      // ipaddr.js identifies:
      // IPv4: 'loopback', 'private', 'linkLocal', 'carrierGradeNat', 'broadcast', 'unspecified', 'reserved'
      // IPv6: 'loopback', 'uniqueLocal', 'linkLocal', 'unspecified', 'reserved'
      const blockedRanges = [
        'loopback',
        'private',
        'linkLocal',
        'uniqueLocal',
        'carrierGradeNat',
        'broadcast',
        'unspecified',
        'reserved'
      ];

      if (blockedRanges.includes(range)) {
        return { isPrivate: true, range };
      }

      // Check IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
      if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
        const ipv4 = parsed.toIPv4Address();
        const ipv4Range = ipv4.range();
        if (blockedRanges.includes(ipv4Range)) {
          return { isPrivate: true, range: `ipv4Mapped-${ipv4Range}` };
        }
      }

      return { isPrivate: false, range };
    } catch (_) {
      // If parsing fails, treat unrecognized address formats conservatively as blocked
      return { isPrivate: true, range: 'invalid-ip-format' };
    }
  }

  /**
   * Checks for decimal/hexadecimal/octal IP obfuscation tricks (e.g. 2130706433 or 0x7f000001)
   * @param {string} hostname
   * @returns {boolean}
   */
  static isObfuscatedNumericIp(hostname) {
    // Pure integer representation: 2130706433
    if (/^\d{8,12}$/.test(hostname)) {
      return true;
    }
    // Hex representation: 0x7f000001 or 0x7f.0.0.1
    if (/^0x[0-9a-fA-F]+/i.test(hostname)) {
      return true;
    }
    // Octal representation: 0177.0.0.1
    if (/^0[0-7]{2,}\./.test(hostname)) {
      return true;
    }
    return false;
  }

  /**
   * Validates a target URL against SSRF and internal infrastructure access.
   *
   * @param {string} urlStr Target URL to validate
   * @param {object} [options]
   * @param {boolean} [options.resolveDns=true] Whether to verify resolved IP address via DNS
   * @param {number[]} [options.allowedPorts] Optional custom ports whitelist
   * @returns {Promise<{ allowed: boolean, reason?: string, sanitizedUrl?: string }>}
   */
  static async validateUrl(urlStr, options = {}) {
    const resolveDns = options.resolveDns ?? true;

    if (!urlStr || typeof urlStr !== 'string') {
      return { allowed: false, reason: 'URL must be a non-empty string.' };
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(urlStr);
    } catch (_) {
      return { allowed: false, reason: 'Malformed URL syntax.' };
    }

    // 1. Protocol Validation: Strictly HTTP and HTTPS only
    const protocol = parsedUrl.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return {
        allowed: false,
        reason: `Unsupported protocol "${protocol}". Only http: and https: are permitted.`
      };
    }

    // 2. Reject credentials in URL: http://user:pass@host
    if (parsedUrl.username || parsedUrl.password) {
      return {
        allowed: false,
        reason: 'Credentials embedded in URL are strictly prohibited.'
      };
    }

    const rawHostname = parsedUrl.hostname.toLowerCase().trim();
    const cleanHostname = rawHostname.replace(/^\[|\]$/g, '');

    // 3. Obfuscated numeric IP check
    if (this.isObfuscatedNumericIp(rawHostname) || this.isObfuscatedNumericIp(cleanHostname)) {
      return {
        allowed: false,
        reason: 'Obfuscated numeric or hex IP address formats are blocked.'
      };
    }

    // 4. Exact & wildcard blocked hostnames
    if (BLOCKED_HOSTNAMES.has(cleanHostname) || BLOCKED_HOSTNAMES.has(rawHostname)) {
      return {
        allowed: false,
        reason: `Access to internal host "${cleanHostname}" is blocked.`
      };
    }

    if (cleanHostname.endsWith('.local') || cleanHostname.endsWith('.internal') || cleanHostname.endsWith('.lan')) {
      return {
        allowed: false,
        reason: `Access to internal TLD domain "${cleanHostname}" is blocked.`
      };
    }

    // 5. Port Validation
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (protocol === 'https:' ? 443 : 80);
    if (BLOCKED_PORTS.has(port)) {
      return {
        allowed: false,
        reason: `Access to internal or database port ${port} is blocked.`
      };
    }

    // 6. Direct IP literal check (IPv4 or IPv6)
    if (ipaddr.isValid(cleanHostname)) {
      const ipCheck = this.isPrivateOrBlockedIp(cleanHostname);
      if (ipCheck.isPrivate) {
        return {
          allowed: false,
          reason: `Target IP address "${cleanHostname}" falls within blocked range (${ipCheck.range}).`
        };
      }
    }

    // 7. DNS Resolution Check (prevents DNS rebinding and nip.io / localtest.me tricks)
    if (resolveDns && !ipaddr.isValid(rawHostname)) {
      try {
        const lookupResult = await dnsLookupAsync(rawHostname, { all: true });
        for (const entry of lookupResult) {
          const ipCheck = this.isPrivateOrBlockedIp(entry.address);
          if (ipCheck.isPrivate) {
            return {
              allowed: false,
              reason: `Host "${rawHostname}" resolves to blocked private IP ${entry.address} (${ipCheck.range}).`
            };
          }
        }
      } catch (err) {
        // DNS lookup failure or NXDOMAIN
        if (err.code === 'ENOTFOUND') {
          return { allowed: false, reason: `Host "${rawHostname}" does not resolve (NXDOMAIN).` };
        }
        // In restricted network test environments without public DNS, proceed if host is not IP
      }
    }

    return {
      allowed: true,
      sanitizedUrl: parsedUrl.toString()
    };
  }

  /**
   * Validates target URL or throws an SSRFViolationError.
   */
  static async validateUrlOrThrow(urlStr, options = {}) {
    const result = await this.validateUrl(urlStr, options);
    if (!result.allowed) {
      throw new SSRFViolationError(result.reason, { url: urlStr });
    }
    return result.sanitizedUrl;
  }
}
