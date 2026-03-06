import { executeHttpRequest } from '../services/http-runner.service.js';

// Deep string interpolation function
const interpolateObject = (obj, variables) => {
    if (typeof obj === 'string') {
        return obj.replace(/{{([^}]+)}}/g, (match, key) => {
            return variables[key.trim()] !== undefined ? variables[key.trim()] : match;
        });
    }
    if (Array.isArray(obj)) {
        return obj.map(item => interpolateObject(item, variables));
    }
    if (obj && typeof obj === 'object') {
        const newObj = {};
        for (const [k, v] of Object.entries(obj)) {
            newObj[k] = interpolateObject(v, variables);
        }
        return newObj;
    }
    return obj;
};

// Convert list of {key, value, active} into an object map
const formatListToObject = (list) => {
    if (!Array.isArray(list)) return list || {};
    return list.reduce((acc, item) => {
        if (item.key && item.active !== false) acc[item.key] = item.value;
        return acc;
    }, {});
};

export default async function requestExecutor(node, context) {
  const { data, id } = node;
  
  // The full config passed from the canvas:
  const requestConfig = data.requestConfig || {};

  // Build the final config by combining the base node data and the full config
  // (In case the user overrode the URL directly on the node)
  const baseConfig = {
      method: data.method || requestConfig.method || 'GET',
      url: data.url || requestConfig.url || '',
      headers: requestConfig.headers || {},
      body: requestConfig.body || null,
      params: requestConfig.params || {},
      auth: requestConfig.auth || null
  };

  if (!baseConfig.url) {
    throw new Error('URL is required for RequestNode');
  }

  // 1. Interpolate environment variables into the config BEFORE formatting
  const interpolatedConfig = interpolateObject(baseConfig, context.variables || {});

  // 2. Format headers/params arrays into objects
  let finalHeaders = formatListToObject(interpolatedConfig.headers);
  let finalParams = formatListToObject(interpolatedConfig.params);

  // 3. Process Authentication (Basic, Bearer, API Key) into headers/params
  const auth = interpolatedConfig.auth;
  if (auth && auth.type !== 'noauth') {
      if (auth.type === 'bearer' && auth.bearer?.token) {
          finalHeaders['Authorization'] = `Bearer ${auth.bearer.token}`;
      } else if (auth.type === 'basic' && (auth.basic?.username || auth.basic?.password)) {
          const credentials = Buffer.from(`${auth.basic?.username || ''}:${auth.basic?.password || ''}`).toString('base64');
          finalHeaders['Authorization'] = `Basic ${credentials}`;
      } else if (auth.type === 'apikey' && auth.apikey?.key && auth.apikey?.value) {
          if (auth.apikey.in === 'header') finalHeaders[auth.apikey.key] = auth.apikey.value;
          else if (auth.apikey.in === 'query') finalParams[auth.apikey.key] = auth.apikey.value;
      }
  }

  const finalConfig = {
      ...interpolatedConfig,
      headers: finalHeaders,
      params: finalParams
  };

  try {
    // 4. Execute request using the core runtime engine
    const result = await executeHttpRequest(finalConfig);

    const responseData = {
      status: result.status,
      body: result.data,
      headers: result.headers,
      time: result.timings?.total || 0,
    };

    // Store in context for subsequent nodes
    context.responses[id] = responseData;

    return { success: true, response: responseData };
  } catch (error) {
    throw new Error(`Request execution failed: ${error.message}`);
  }
}
