import prisma from '../config/prisma.js';
import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';

export const requestDefinitionService = {
    async createRequest({ collectionId, name, method, url, headers, body, params }) {
        if (!collectionId || !name || !method || !url) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required fields');
        }

        const collection = await prisma.collection.findUnique({
            where: { id: collectionId, deletedAt: null }
        });

        if (!collection) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Collection not found');
        }

        // --- VALIDATION & SANITIZATION START ---
        // Ensure headers/params are Objects. If string/null, default to {}.
        const safeHeaders = (headers && typeof headers === 'object' && !Array.isArray(headers)) ? headers : {};
        const safeParams = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
        
        // Body can be string (raw), object (json), or null. 
        // We ensure undefined becomes null to satisfy Prisma.
        const safeBody = body !== undefined ? body : null;
        // --- VALIDATION END ---

        return prisma.requestDefinition.create({
            data: {
                collectionId,
                name,
                method,
                url,
                headers: safeHeaders,
                body: safeBody,
                params: safeParams,
            },
        });
    },

    async getRequestsByCollection(collectionId) {
        return prisma.requestDefinition.findMany({
            where: {
                collectionId,
                deletedAt: null,
            },
        });
    },

    async updateRequest(requestId, updateBody) {
        // Sanitize update data if present
        if (updateBody.headers && typeof updateBody.headers !== 'object') updateBody.headers = {};
        if (updateBody.params && typeof updateBody.params !== 'object') updateBody.params = {};

        const request = await prisma.requestDefinition.findFirst({
            where: {
                id: requestId,
                deletedAt: null,
            },
        });

        if (!request) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Request definition not found');
        }

        return prisma.requestDefinition.update({
            where: { id: requestId },
            data: updateBody,
        });
    },

    async softDeleteRequest(requestId) {
        const request = await prisma.requestDefinition.findFirst({
            where: {
                id: requestId,
                deletedAt: null,
            },
        });

        if (!request) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Request definition not found');
        }

        return prisma.requestDefinition.update({
            where: { id: requestId },
            data: {
                deletedAt: new Date(),
            },
        });
    },
};