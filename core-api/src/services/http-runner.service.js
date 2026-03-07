import http from 'http';
import https from 'https';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import zlib from 'zlib';
import FormData from 'form-data';

/**
 * Helper: Parse Set-Cookie header into a simple object for frontend display
 */
const parseResponseCookies = (headers) => {
  const raw = headers['set-cookie'];
  if (!raw) return {};

  const cookies = {};
  const list = Array.isArray(raw) ? raw : [raw];

  list.forEach(str => {
    const parts = str.split(';');
    const [key, ...valParts] = parts[0].split('=');
    if (key) {
      cookies[key.trim()] = valParts.join('=').trim();
    }
  });
  return cookies;
};

/**
 * Helper: Process the Body Definition into a Sendable String/Buffer/Stream
 */
const processBody = (bodyDef, headers) => {
  if (!bodyDef || typeof bodyDef !== 'object') return bodyDef;

  // 1. RAW
  if (bodyDef.type === 'raw') {
    return bodyDef.raw || '';
  }

  // 2. URL ENCODED
  if (bodyDef.type === 'urlencoded') {
    if (Array.isArray(bodyDef.urlencoded)) {
      const params = new URLSearchParams();
      bodyDef.urlencoded.forEach(item => {
        // If it's the raw array from DB, check active. If it's the processed array from executionSlice, it won't have active.
        if (item.key && item.active !== false) {
          params.append(item.key, item.value);
        }
      });
      return params.toString();
    }
  }

  // 3. FORM-DATA
  if (bodyDef.type === 'formdata') {
      const form = new FormData();
      
      (bodyDef.formdata || []).forEach(item => {
          if (!item.key) return; 

          // STRICT CHECK: Ensure it is a living, breathing Node.js Buffer
          if (item.isFile && item.value && Buffer.isBuffer(item.value.buffer)) {
              form.append(item.key, item.value.buffer, {
                  filename: item.value.name || 'upload.bin',
                  contentType: item.value.type || 'application/octet-stream'
              });
          } else {
              // Neutralize any dead objects (like corrupted buffers) into strings
              let safeValue = item.value;
              if (typeof safeValue === 'object' && safeValue !== null) {
                  safeValue = ''; 
              }
              form.append(item.key, String(safeValue || ''));
          }
      });

      Object.assign(headers, form.getHeaders());
      return form; 
  }

  // 4. BINARY
  if (bodyDef.type === 'binary') {
      if (bodyDef.binaryFile && bodyDef.binaryFile.buffer) {
          return bodyDef.binaryFile.buffer; 
      }
      return null;
  }

  // 5. NONE
  if (bodyDef.type === 'none') return undefined;

  // Fallback for random objects
  return JSON.stringify(bodyDef);
};


export const executeHttpRequest = (requestConfig, cookieJar = null) => {
  return new Promise(async (resolve) => {
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
        body,
        params = {}
      } = requestConfig;

      // 1. VALIDATE URL
      let parsedUrl;
      try {
        const urlStr = url.includes('://') ? url : `http://${url}`;
        parsedUrl = new URL(urlStr);
        
        if (requestConfig.params && typeof requestConfig.params === 'object') {
            Object.keys(requestConfig.params).forEach(key => {
                const param = requestConfig.params[key];
                if (param && (typeof param !== 'object' || param.active !== false)) {
                   const val = (typeof param === 'object' && param.value !== undefined) ? param.value : param;
                   parsedUrl.searchParams.append(key, String(val));
                }
            });
        }
      } catch (err) {
        return resolve(createErrorResponse(`Invalid URL: ${err.message}`, 0));
      }

      // 2. PROCESS HEADERS
      const defaultHeaders = {
          'User-Agent': 'TraceWeaveRuntime/1.0',
          'Accept': '*/*',
          'Connection': 'keep-alive',
          'Host': parsedUrl.hostname,
          'Accept-Encoding': 'gzip, deflate, br',
          'Postman-Token': uuidv4()
      };
      
      const safeHeaders = { ...defaultHeaders };
      Object.keys(headers).forEach(key => {
          safeHeaders[key] = headers[key];
      });

      // 3. PROCESS BODY (This mutates safeHeaders if it's form-data)
      const requestPayload = processBody(body, safeHeaders);

      // 4. CALCULATE CONTENT-LENGTH (Only if it's NOT a stream)
      if (requestPayload && !(requestPayload instanceof FormData)) {
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
        timeout: 10000, 
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

          if ((res.headers['content-type'] || '').includes('application/json')) {
             try { data = JSON.parse(data); } catch { }
          }

          const parsedCookies = parseResponseCookies(res.headers);

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

      // --- THE FINAL CRUCIAL FIX ---
      // If it's FormData, pipe it so the boundary chunks stream correctly.
      if (requestPayload instanceof FormData) {
          requestPayload.pipe(req);
      } 
      // If it's raw string or binary buffer, write it.
      else if (requestPayload) {
          req.write(requestPayload);
          req.end();
      } 
      // If no body
      else {
          req.end();
      }

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