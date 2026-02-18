import http from 'http';
import https from 'https';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import zlib from 'zlib';

/**
 * Helper: Parse Set-Cookie header into a simple object for frontend display
 */
const parseResponseCookies = (headers) => {
  const raw = headers['set-cookie'];
  if (!raw) return {};

  const cookies = {};
  const list = Array.isArray(raw) ? raw : [raw];

  list.forEach(str => {
    // Simple parse: "key=value; Path=/..." -> gets "key": "value"
    const parts = str.split(';');
    const [key, ...valParts] = parts[0].split('=');
    if (key) {
      cookies[key.trim()] = valParts.join('=').trim();
    }
  });
  return cookies;
};

/**
 * Helper: Process the Body Definition into a Sendable String/Buffer
 */
const processBody = (bodyDef, headers) => {
  if (!bodyDef || typeof bodyDef !== 'object') return bodyDef;

  // 1. RAW (JSON, Text, XML, HTML)
  if (bodyDef.type === 'raw') {
    return bodyDef.raw || '';
  }

  // 2. X-WWW-FORM-URLENCODED
  if (bodyDef.type === 'urlencoded') {
    if (Array.isArray(bodyDef.urlencoded)) {
      const params = new URLSearchParams();
      bodyDef.urlencoded.forEach(item => {
        if (item.key && item.active !== false) {
          params.append(item.key, item.value);
        }
      });
      // Ensure header is set if not already
      // (The frontend usually handles this, but safety first)
      return params.toString();
    }
  }

  // 3. FORM-DATA (Simple implementation for Sprint 1)
  // Note: For full binary support, we'd need the 'form-data' npm package.
  // This is a placeholder that warns if used without proper boundary handling.
  if (bodyDef.type === 'formdata') {
     console.warn("Multipart/form-data logic requires 'form-data' package. Sending empty for now.");
     return ''; 
  }

  // 4. NONE
  if (bodyDef.type === 'none') return undefined;

  // Fallback: If it's just a plain object (legacy), stringify it
  return JSON.stringify(bodyDef);
};


export const executeHttpRequest = (requestConfig, cookieJar = null) => {
  return new Promise(async (resolve) => {
    // TIMINGS SETUP
    const timings = {
      start: Date.now(),
      dnsLookup: 0,
      tcpConnection: 0,
      tlsHandshake: 0,
      firstByte: 0,
      download: 0,
      total: 0,
    };

    try {
      const {
        method = 'GET',
        url,
        headers = {},
        body // This is the Definition Object from FE
      } = requestConfig;

      // 1. VALIDATE URL
      let parsedUrl;
      try {
        parsedUrl = new URL(url.includes('://') ? url : `http://${url}`);
      } catch {
        return resolve(createErrorResponse('Invalid URL format', 0));
      }

      // 2. PROCESS HEADERS (Defaults + Overrides)
      const defaultHeaders = {
          'User-Agent': 'TraceWeaveRuntime/1.0',
          'Accept': '*/*',
          'Connection': 'keep-alive',
          'Host': parsedUrl.hostname,
          'Accept-Encoding': 'gzip, deflate, br',
          'Postman-Token': uuidv4()
      };
      
      // Merge defaults (User headers take precedence)
      const safeHeaders = { ...defaultHeaders };
      // Case-insensitive merge logic
      Object.keys(headers).forEach(key => {
          safeHeaders[key] = headers[key];
      });

      // 3. PROCESS BODY
      const requestPayload = processBody(body, safeHeaders);

      // 4. CALCULATE CONTENT-LENGTH
      // Critical for some servers to accept the request
      if (requestPayload) {
          safeHeaders['Content-Length'] = Buffer.byteLength(requestPayload);
      }

      // 5. COOKIE INJECTION
      if (cookieJar) {
        try {
           const cookieString = await cookieJar.getCookieString(url);
           if (cookieString) {
              const existingCookie = safeHeaders['Cookie'] || safeHeaders['cookie'];
              safeHeaders['Cookie'] = existingCookie ? `${existingCookie}; ${cookieString}` : cookieString;
           }
        } catch (e) { console.warn("Cookie injection failed", e); }
      }

      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;
      
      const options = {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: safeHeaders,
        timeout: 10000, // 10s Timeout
      };

      // --- EXECUTION ---
      
      let dnsEnd = 0, connectEnd = 0, tlsEnd = 0, responseStart = 0;

      const req = lib.request(options);

      // --- EVENTS ---
      
      req.on('socket', (socket) => {
        socket.on('lookup', () => {
           dnsEnd = Date.now();
           timings.dnsLookup = dnsEnd - timings.start;
        });
        socket.on('connect', () => {
           connectEnd = Date.now();
           timings.tcpConnection = connectEnd - (dnsEnd || timings.start);
        });
        if (isHttps) {
           socket.on('secureConnect', () => {
              tlsEnd = Date.now();
              timings.tlsHandshake = tlsEnd - connectEnd;
           });
        }
      });

      req.on('response', (res) => {
        responseStart = Date.now();
        const handshakeEnd = (isHttps && tlsEnd) ? tlsEnd : (connectEnd || timings.start);
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
          // --- FIX 1: HANDLE DECOMPRESSION ---
          let decodedBuffer = buffer;
          const encoding = (res.headers['content-encoding'] || '').toLowerCase();

          try {
              if (encoding === 'gzip') {
                  decodedBuffer = zlib.gunzipSync(buffer);
              } else if (encoding === 'deflate') {
                  decodedBuffer = zlib.inflateSync(buffer);
              } else if (encoding === 'br') {
                  decodedBuffer = zlib.brotliDecompressSync(buffer);
              }
          } catch (err) {
              console.warn("Decompression failed, returning raw buffer", err);
          }

          let data = decodedBuffer.toString('utf8');

          // Parse JSON if possible
          if ((res.headers['content-type'] || '').includes('application/json')) {
             try { data = JSON.parse(data); } catch { }
          }

          // --- FIX 2: PARSE COOKIES FOR UI ---
          const parsedCookies = parseResponseCookies(res.headers);

          // Capture Set-Cookie
          if (cookieJar && res.headers['set-cookie']) {
              const rawCookies = Array.isArray(res.headers['set-cookie']) 
                  ? res.headers['set-cookie'] 
                  : [res.headers['set-cookie']];
              rawCookies.forEach(c => {
                  try { cookieJar.setCookieSync(c, url); } catch {}
              });
          }

          resolve({
            success: true,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            data,
            cookies: parsedCookies,
            size,
            timings,
          });
        });
      });

      req.on('error', (err) => {
         resolve(createErrorResponse(err.message, Date.now() - timings.start));
      });

      req.on('timeout', () => {
          req.destroy();
          resolve(createErrorResponse("Request Timed Out", Date.now() - timings.start));
      });

      // WRITE BODY
      if (requestPayload) {
          req.write(requestPayload);
      }
      
      req.end();

    } catch (globalError) {
      resolve(createErrorResponse(globalError.message, 0));
    }
  });
};

const createErrorResponse = (message, totalTime) => ({
  success: false,
  status: 0,
  statusText: 'Error',
  headers: {},
  data: { error: message || "Unknown Error" },
  size: 0,
  timings: { start: 0, dnsLookup: 0, tcpConnection: 0, tlsHandshake: 0, firstByte: 0, download: 0, total: totalTime },
});