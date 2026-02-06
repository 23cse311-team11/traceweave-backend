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

        return prisma.requestDefinition.create({
            data: {
                collectionId,
                name,
                method,
                url,
                headers,
                body,
                params,
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
