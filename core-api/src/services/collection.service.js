import prisma from "../config/prisma.js";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";

export class CollectionService {
  static async createCollection({ workspaceId, name, parentId = null }) {
    if (!workspaceId || !name) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "workspaceId and name are required"
      );
    }

    if (parentId) {
      const parent = await prisma.collection.findFirst({
        where: {
          id: parentId,
          deletedAt: null
        }
      });

      if (!parent) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          "Parent collection not found"
        );
      }
    }

    return prisma.collection.create({
      data: {
        workspaceId,
        name,
        parentId
      }
    });
  }

  static async getCollectionsByWorkspace(workspaceId) {
    if (!workspaceId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "workspaceId is required"
      );
    }

    return prisma.collection.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        parentId: null
      },
      include: {
        children: {
          where: { deletedAt: null },
          include: {
            children: true,
            requests: {
              where: { deletedAt: null }
            }
          }
        },
        requests: {
          where: { deletedAt: null }
        }
      }
    });
  }

  static async softDeleteCollection(collectionId) {
    const collection = await prisma.collection.findFirst({
      where: {
        id: collectionId,
        deletedAt: null
      }
    });

    if (!collection) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Collection not found'
      );
    }

    await prisma.collection.update({
      where: { id: collectionId },
      data: { deletedAt: new Date() }
    });

    return {
      success: true,
      message: 'Collection deleted successfully',
      collectionId
    };

  }
}
