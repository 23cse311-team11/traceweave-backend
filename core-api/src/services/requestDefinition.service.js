import prisma from '../config/prisma.js';
import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';

export const requestDefinitionService = {
  async createRequest(data) {
    const { collectionId, name, protocol = 'http', version = 1 } = data;
    
    // Config holds the details
    let config = data.config || {};
    
    // Backward compatibility: If old fields are present, move them into config
    // if config doesn't already have them.
    if (!config.method && data.method) config.method = data.method;
    if (!config.url && data.url) config.url = data.url;
    if (!config.headers && data.headers) config.headers = data.headers;
    if (!config.body && data.body) config.body = data.body;
    if (!config.params && data.params) config.params = data.params;

    if (!collectionId || !name) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required fields (collectionId, name)');
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
        protocol,
        version,
        config: config,
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

    // Prepare data for update
    const dataToUpdate = {};
    if (updateBody.name !== undefined) dataToUpdate.name = updateBody.name;
    if (updateBody.protocol !== undefined) dataToUpdate.protocol = updateBody.protocol;
    if (updateBody.version !== undefined) dataToUpdate.version = updateBody.version;
    
    // Handle config and legacy fields
    let newConfig = updateBody.config ? { ...updateBody.config } : (request.config ? { ...request.config } : {});
    
    // If legacy fields are passed in updateBody, update existing config
    let configChanged = false;
    if (updateBody.config) {
        configChanged = true;
    }
    
    const legacyFields = ['method', 'url', 'headers', 'body', 'params'];
    for (const field of legacyFields) {
      if (updateBody[field] !== undefined) {
        newConfig[field] = updateBody[field];
        configChanged = true;
      }
    }

    if (configChanged) {
      dataToUpdate.config = newConfig;
    }

    return prisma.requestDefinition.update({
      where: { id: requestId },
      data: dataToUpdate,
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