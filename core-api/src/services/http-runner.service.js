// backend/core-api/src/services/http-runner.service.js
import http from 'http';
import https from 'https';
import { URL } from 'url';

/**
 * Executes an HTTP/HTTPS request with precise waterfall timings.
 * Captures: DNS, TCP, TLS, TTFB, Download, Total.
 */
export const executeHttpRequest = (requestConfig) => {
  return new Promise((resolve) => {
    const { method, url, headers, body } = requestConfig;

    // 1. Parse URL to determine protocol and options
    let normalizedUrl = url;
    if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `http://${normalizedUrl}`;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch (err) {
      return resolve(createErrorResponse('Invalid URL format', 0));
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    // 2. Prepare Timings Object (The Stopwatch)
    const timings = {
      start: Date.now(),
      dnsLookup: 0,    // Domain -> IP
      tcpConnection: 0,// Socket Connect
      tlsHandshake: 0, // SSL Negotiation (HTTPS only)
      firstByte: 0,    // TTFB (Server Processing)
      download: 0,     // Content Transfer
      total: 0,        // Total Duration
    };

    // Events timestamps
    let dnsStart = timings.start;
    let dnsEnd = 0;
    let connectEnd = 0;
    let tlsEnd = 0;
    let responseStart = 0;
    let end = 0;

    // 3. Request Options
    const options = {
      method: method || 'GET',
      headers: headers || {},
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      // Helper to force IPv4 if needed, usually auto
      family: 4,
    };

    // 4. Create Request
    const req = lib.request(options);

    // --- SOCKET LIFECYCLE EVENTS ---
    // A. DNS Lookup (socket assigned)
    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        dnsEnd = Date.now();
        timings.dnsLookup = dnsEnd - dnsStart;
      });

      // B. TCP Connection
      socket.on('connect', () => {
        connectEnd = Date.now();
        // If DNS was cached/skipped, use start time
        const referenceTime = dnsEnd || dnsStart;
        timings.tcpConnection = connectEnd - referenceTime;
      });

      // C. TLS Handshake (HTTPS only)
      if (isHttps) {
        socket.on('secureConnect', () => {
          tlsEnd = Date.now();
          timings.tlsHandshake = tlsEnd - connectEnd;
        });
      }
    });

    // 5. Response Handling
    req.on('response', (res) => {
      // D. TTFB (Time To First Byte)
      responseStart = Date.now();
      const handshakeEnd = isHttps ? tlsEnd : connectEnd;
      timings.firstByte = responseStart - handshakeEnd;

      let dataChunks = [];
      let totalSize = 0;

      // E. Download Body
      res.on('data', (chunk) => {
        dataChunks.push(chunk);
        totalSize += chunk.length;
      });

      res.on('end', () => {
        end = Date.now();
        timings.download = end - responseStart;
        timings.total = end - timings.start;

        // Parse Body (Try JSON, fallback to text)
        const buffer = Buffer.concat(dataChunks);
        let responseBody = buffer.toString('utf8');
        try {
          responseBody = JSON.parse(responseBody);
        } catch (e) {
          // Leave as string if not JSON
        }

        resolve({
          success: true,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          data: responseBody,
          size: totalSize,
          timings
        });
      });
    });

    // 6. Error Handling
    req.on('error', (err) => {
      resolve(createErrorResponse(err.message, Date.now() - timings.start));
    });

    // 7. Send Body (if exists)
    if (body) {
      if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }

    req.end();
  });
};

// Helper for Errors
const createErrorResponse = (message, totalTime) => ({
  success: false,
  status: 0,
  statusText: 'Error',
  headers: {},
  data: { error: message },
  size: 0,
  timings: {
    start: 0, dnsLookup: 0, tcpConnection: 0,
    tlsHandshake: 0, firstByte: 0, download: 0,
    total: totalTime
  }
});