import prisma from "../config/prisma.js";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

export class RequestDefinitionService {
  static async createRequestDefinition({
    collectionId,
    name,
    method,
    url,
    headers = null,
    params = null,
    body = null
  }) {
    if (!collectionId || !name || !method || !url) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "collectionId, name, method, and url are required"
      );
    }

    if (!ALLOWED_METHODS.includes(method.toUpperCase())) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Invalid HTTP method: ${method}`
      );
    }

    const collectionExists = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        deletedAt: null
      }
    });

    if (!collectionExists) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Collection not found"
      );
    }

    return prisma.requestDefinition.create({
      data: {
        collectionId,
        name,
        method: method.toUpperCase(),
        url,
        headers,
        params,
        body
      }
    });
  }

  static async getRequestsByCollection(collectionId) {
    if (!collectionId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "collectionId is required"
      );
    }

    return prisma.requestDefinition.findMany({
      where: {
        collectionId,
        deletedAt: null
      }
    });
  }

  static async getRequestById(requestId) {
    if (!requestId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "requestId is required"
      );
    }

    const request = await prisma.requestDefinition.findFirst({
      where: {
        id: requestId,
        deletedAt: null
      }
    });

    if (!request) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Request definition not found"
      );
    }

    return request;
  }

  static async updateRequestDefinition(requestId, updates) {
    if (!requestId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "requestId is required"
      );
    }

    const existing = await prisma.requestDefinition.findFirst({
      where: {
        id: requestId,
        deletedAt: null
      }
    });

    if (!existing) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Request definition not found"
      );
    }

    if (updates.method) {
      if (!ALLOWED_METHODS.includes(updates.method.toUpperCase())) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Invalid HTTP method: ${updates.method}`
        );
      }
      updates.method = updates.method.toUpperCase();
    }

    return prisma.requestDefinition.update({
      where: { id: requestId },
      data: updates
    });
  }

  static async softDeleteRequest(requestId) {
    if (!requestId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "requestId is required"
      );
    }

    const request = await prisma.requestDefinition.findFirst({
      where: {
        id: requestId,
        deletedAt: null
      }
    });

    if (!request) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Request definition not found"
      );
    }

    return prisma.requestDefinition.update({
      where: { id: requestId },
      data: { deletedAt: new Date() }
    });
  }
}
