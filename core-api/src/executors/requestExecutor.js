import axios from 'axios';

/**
 * Executes a Request node
 * data contains: { requestId, method, url, timeout }
 */
export default async function requestExecutor(node, context) {
  const { data, id } = node;
  const { method = 'GET', url, timeout = 5000 } = data;

  if (!url) {
    throw new Error('URL is required for RequestNode');
  }

  // TODO: Add support for headers, auth, body etc based on the actual request saved
  // For now, we will execute a simple HTTP request

  try {
    const startTime = Date.now();
    const result = await axios({
      method,
      url,
      timeout,
      // allow whatever status without throwing immediately
      validateStatus: () => true 
    });
    const time = Date.now() - startTime;

    const responseData = {
      status: result.status,
      body: result.data,
      headers: result.headers,
      time,
    };

    // Store in context
    context.responses[id] = responseData;

    return { success: true, response: responseData };
  } catch (error) {
    throw new Error(`Request execution failed: ${error.message}`);
  }
}
