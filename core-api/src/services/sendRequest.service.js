import axios from 'axios';
import httpStatus from 'http-status';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';

export const sendRequestService = {
    async sendRequest(requestId) {
        const requestDef = await prisma.requestDefinition.findUnique({
            where: { id: requestId, deletedAt: null },
        });

        if (!requestDef) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Request definition not found');
        }

        const { method, url, headers, body, params } = requestDef;

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
