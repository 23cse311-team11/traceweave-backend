import { executeHttpRequest } from './http-runner.service.js';

export const executeGraphQLRequest = async (requestConfig, cookieJar) => {
    // console.log("Preparing to execute GraphQL request with config:", requestConfig);
    const { url, headers = {}, body } = requestConfig;
    // console.log("GraphQL Request body:", body);
    const query = body?.graphql?.query || body?.query;
    let variables = body?.graphql?.variables || body?.variables || {};
    console.log("Extracted GraphQL query:", query);
    console.log("Extracted GraphQL variables:", variables);
    if (!query || !query.trim()) {
        return {
            success: false,
            status: 400,
            statusText: 'Bad Request',
            data: { error: 'GraphQL query is missing' },
            timings: { total: 0 }
        };
    }
    console.log("Final GraphQL request config - URL:", url, "Headers:", headers, "Query:", query, "Variables:", variables);

    // 1. Prepare Payload
    // GraphQL always needs this specific JSON structure
    let safeVariables = variables;
    if (typeof variables === 'string') {
        try {
            safeVariables = JSON.parse(variables || '{}');
        } catch (e) {
            return {
                success: false,
                status: 400,
                statusText: 'Bad Request',
                data: { error: `Invalid Variables JSON: ${e.message}` },
                timings: { total: 0 } 
            };
        }
    }

    const payload = JSON.stringify({
        query,
        variables: safeVariables
    });

    // 2. Prepare Headers
    const safeHeaders = { 
        ...headers, 
        'Content-Type': 'application/json',
        // 'Accept': 'application/json' // Good practice to add
    };

    // 3. Delegate to HTTP Runner
    // We treat this as a standard POST request now
    const httpConfig = {
        method: 'POST', // GraphQL is almost always POST
        url,
        headers: safeHeaders,
        body: {
            type: 'raw', // We've already processed it into a raw string
            raw: payload
        }
    };
    // console.log("Executing GraphQL Request with config:", httpConfig);
    return await executeHttpRequest(httpConfig, cookieJar);
};