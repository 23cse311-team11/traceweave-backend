import http from 'http';
import https from 'https';
import { URL } from 'url';

/**
 * Executes an HTTP/HTTPS request with precise waterfall timings.
 * Captures: DNS, TCP, TLS, TTFB, Download, Total.
 *
 * @param {object} requestConfig
 * @param {CookieJar} cookieJar - Optional tough-cookie jar instance
 */
export const executeHttpRequest = (requestConfig, cookieJar = null) => {
  return new Promise(async (resolve) => {
    const {
      method = 'GET',
      url,
      headers = {},
      body
    } = requestConfig;

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return resolve(createErrorResponse('Invalid URL format', 0));
    }

    const safeHeaders = { ...headers };

    /* ===========================
       COOKIE INJECTION
    ============================ */
    if (cookieJar) {
      try {
        const cookieString = await cookieJar.getCookieString(url);
        if (cookieString) {
          safeHeaders['Cookie'] = safeHeaders['Cookie']
            ? `${safeHeaders['Cookie']}; ${cookieString}`
            : cookieString;
        }
      } catch (err) {
        console.error('Cookie Injection Error:', err);
      }
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    /* ===========================
       TIMINGS SETUP
    ============================ */
    const timings = {
      start: Date.now(),
      dnsLookup: 0,
      tcpConnection: 0,
      tlsHandshake: 0,
      firstByte: 0,
      download: 0,
      total: 0,
    };

    let dnsEnd = 0;
    let connectEnd = 0;
    let tlsEnd = 0;
    let responseStart = 0;

    const options = {
      method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: safeHeaders,
    };

    const req = lib.request(options);

    /* ===========================
       SOCKET EVENTS
    ============================ */
    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        dnsEnd = Date.now();
        timings.dnsLookup = dnsEnd - timings.start;
      });

      socket.on('connect', () => {
        connectEnd = Date.now();

        // DNS may be cached → lookup never fires
        if (!dnsEnd) timings.dnsLookup = 0;

        timings.tcpConnection =
          connectEnd - (dnsEnd || timings.start);
      });

      if (isHttps) {
        socket.on('secureConnect', () => {
          tlsEnd = Date.now();
          if (connectEnd) {
            timings.tlsHandshake = tlsEnd - connectEnd;
          }
        });
      }
    });

    /* ===========================
       RESPONSE HANDLING
    ============================ */
    req.on('response', (res) => {
      responseStart = Date.now();

      const handshakeEnd =
        (isHttps && tlsEnd)
          ? tlsEnd
          : connectEnd || timings.start;

      timings.firstByte = responseStart - handshakeEnd;

      const chunks = [];
      let size = 0;

      res.on('data', (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
      });

      res.on('end', () => {
        const end = Date.now();

        timings.download = end - responseStart;
        timings.total = end - timings.start;

        const buffer = Buffer.concat(chunks);
        let data = buffer.toString('utf8');

        try {
          data = JSON.parse(data);
        } catch {
          // leave as string
        }

        /* ===========================
           COOKIE EXTRACTION
        ============================ */
        if (cookieJar && res.headers['set-cookie']) {
          const rawCookies = Array.isArray(res.headers['set-cookie'])
            ? res.headers['set-cookie']
            : [res.headers['set-cookie']];

          for (const c of rawCookies) {
            try {
              cookieJar.setCookieSync(c, url);
            } catch (err) {
              console.error('Cookie Parse Error:', err);
            }
          }
        }

        resolve({
          success: true,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          data,
          size,
          timings,
        });
      });
    });

    /* ===========================
       ERROR HANDLING
    ============================ */
    req.on('error', (err) => {
      resolve(createErrorResponse(err.message, Date.now() - timings.start));
    });

    /* ===========================
       SEND BODY
    ============================ */
    if (body !== undefined && body !== null) {
      if (typeof body === 'object' && !Buffer.isBuffer(body)) {
        safeHeaders['Content-Type'] ||= 'application/json';
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }

    req.end();
  });
};

/* ===========================
   ERROR RESPONSE HELPER
============================ */
const createErrorResponse = (message, totalTime) => ({
  success: false,
  status: 0,
  statusText: 'Error',
  headers: {},
  data: { error: message },
  size: 0,
  timings: {
    start: 0,
    dnsLookup: 0,
    tcpConnection: 0,
    tlsHandshake: 0,
    firstByte: 0,
    download: 0,
    total: totalTime,
  },
});
