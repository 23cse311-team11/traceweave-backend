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
    try {
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
        orderBy: { order: 'asc' },
        include: {
          children: {
            where: { deletedAt: null },
            orderBy: { order: 'asc' },
            include: {
              children: true,
              requests: {
                where: { deletedAt: null },
                orderBy: { order: 'asc' },
              }
            }
          },
          requests: {
            where: { deletedAt: null },
            orderBy: { order: 'asc' }
          }
        }
      });
    } catch (error) {
      console.error("Error fetching collections:", error);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "An error occurred while fetching collections"
      );
    }
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

    const deleteRecursive = async (id) => {
      // Find children
      const children = await prisma.collection.findMany({
        where: { parentId: id, deletedAt: null }
      });

      // Recurse for each child
      for (const child of children) {
        await deleteRecursive(child.id);
      }

      // Soft delete the current item and its associated requests
      await prisma.collection.update({
        where: { id },
        data: { deletedAt: new Date() }
      });
      
      // Also soft delete requests inside this collection
      if (prisma.request) {
        await prisma.request.updateMany({
          where: { collectionId: id, deletedAt: null },
          data: { deletedAt: new Date() }
        });
      }
    };

    await deleteRecursive(collectionId);

    return {
      success: true,
      message: 'Collection deleted successfully',
      collectionId
    };

  }

  static async updateCollection(collectionId, updateBody, userId) {
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

    return prisma.collection.update({
      where: { id: collectionId },
      data: updateBody
    });
  }
}
