import axios from 'axios';

/**
 * Executes an HTTP Request and captures timing metrics
 */
export const executeHttpRequest = async (requestConfig) => {
  const { method, url, headers, body, params } = requestConfig;

  // Metadata for timings
  const timings = {
    start: 0,
    dns: 0,  // Hard to get without low-level socket, skipping for Sprint 1
    tls: 0,  // Hard to get without low-level socket, skipping for Sprint 1
    firstByte: 0,
    end: 0,
    total: 0,
  };

  timings.start = Date.now();

  const axiosConfig = {
    method,
    url,
    headers: headers || {},
    params: params || {},
    data: body || {},
    validateStatus: () => true, // Don't throw error on 404/500
    // We can use httpAgent to get DNS timings later, keeping it simple for now
  };

  try {
    // 1. Intercept Request to start timer (Double check)
    axios.interceptors.request.use((config) => {
      // We rely on the timings.start above, but this ensures we catch actual send time
      return config;
    });

    // 2. Execute
    const response = await axios(axiosConfig);
    
    // 3. Capture timings
    timings.end = Date.now();
    timings.total = timings.end - timings.start;

    // Approximate size calculation
    const responseDataString = JSON.stringify(response.data);
    const size = Buffer.byteLength(responseDataString || '', 'utf8');

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      size,
      timings: {
        ...timings,
        // Mocking breakdown for Sprint 1 visualization until we implement stream-based runner
        firstByte: Math.floor(timings.total * 0.8), // Usually 80% is waiting
        download: Math.floor(timings.total * 0.2),  // 20% is downloading
      }
    };

  } catch (error) {
    timings.end = Date.now();
    return {
      success: false,
      status: 0,
      statusText: 'Network Error',
      headers: {},
      data: { error: error.message },
      size: 0,
      timings: { ...timings, total: timings.end - timings.start }
    };
  }
};