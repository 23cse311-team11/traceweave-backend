import axios from 'axios';
import httpStatus from 'http-status';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';
import { decrypt } from '../utils/encryption.js';

export const sendRequestService = {
    async sendRequest(requestId, environmentId, userId) {
        const requestDef = await prisma.requestDefinition.findUnique({
            where: { id: requestId, deletedAt: null },
        });

        if (!requestDef) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Request definition not found');
        }

        let { method, url, headers, body, params } = requestDef;

        // If environmentId is provided, fetch variables and substitute
        if (environmentId && userId) {
            // Validate access: Check UserEnvironment
            const access = await prisma.userEnvironment.findUnique({
                where: {
                    userId_environmentId: { userId, environmentId },
                },
            });

            if (!access) {
                throw new ApiError(httpStatus.FORBIDDEN, 'Access denied to this environment');
            }

            // Fetch variables
            const variables = await prisma.environmentVariable.findMany({
                where: { environmentId, deletedAt: null },
            });

            // Build substitution map
            const varMap = {};
            variables.forEach((v) => {
                varMap[v.key] = v.isSecret ? decrypt(v.value) : v.value;
            });

            // Substitution function
            const substitute = (text) => {
                if (typeof text !== 'string') return text;
                return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
                    return varMap[key] !== undefined ? varMap[key] : match;
                });
            };

            // Substitute in URL
            url = substitute(url);

            // Substitute in headers
            if (headers && typeof headers === 'object') {
                const newHeaders = {};
                Object.keys(headers).forEach((key) => {
                    newHeaders[substitute(key)] = substitute(headers[key]);
                });
                headers = newHeaders;
            }

            // Substitute in params
            if (params && typeof params === 'object') {
                const newParams = {};
                Object.keys(params).forEach((key) => {
                    newParams[substitute(key)] = substitute(params[key]);
                });
                params = newParams;
            }

            // Substitute in body (if it's a string or JSON object)
            if (body) {
                if (typeof body === 'string') {
                    body = substitute(body);
                } else if (typeof body === 'object') {
                    // Stringify, substitute, parse back
                    body = JSON.parse(substitute(JSON.stringify(body)));
                }
            }
        }

        try {
            const config = {
                method,
                url,
                headers: headers || {},
                data: body,
                params,
                validateStatus: () => true,
            };

            const startTime = Date.now();
            const response = await axios(config);
            const endTime = Date.now();

            return {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                data: response.data,
                time: endTime - startTime,
                size: JSON.stringify(response.data).length,
            };
        } catch (error) {
            throw new ApiError(
                httpStatus.BAD_GATEWAY,
                `Request failed: ${error.message}`
            );
        }
    },
};
