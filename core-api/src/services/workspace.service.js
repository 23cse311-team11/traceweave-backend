import httpStatus from 'http-status';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';

export const workspaceService = {
  async createWorkspace({ name, description, ownerId }) {
    try {
      return await prisma.workspace.create({
        data: {
          name,
          description,
          owner: {
            connect: { id: ownerId },
          },
          members: {
            create: {
              user: { connect: { id: ownerId } },
              role: 'OWNER',
            },
          },
        },
      });
    } catch (error) {
      // 1. Log the full error for your internal debugging
      console.error("--- PRISMA ERROR DEBUG ---");
      console.error("Code:", error.code); // e.g., P2002, P2025
      console.error("Message:", error.message);

      // 2. Identify specific Prisma errors (Optional but helpful)
      if (error.code === 'P2025') {
        throw new ApiError(httpStatus.NOT_FOUND, 'User (Owner) not found');
      }

      // 3. Re-throw as an ApiError so your global error handler catches it
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `Failed to create workspace: ${error.message.split('\n').at(-1)}`
      );
    }
  },

  async getUserWorkspaces(userId) {
    return prisma.workspace.findMany({
      where: {
        deletedAt: null,
        members: {
          some: { userId },
        },
      },
    });
  },

  async getWorkspaceById(workspaceId, userId) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        deletedAt: null,
        members: {
          some: { userId },
        },
      },
    });

    if (!workspace) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Workspace not found or access denied'
      );
    }

    return workspace;
  },
  async deleteWorkspace(workspaceId, userId) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: userId,
        deletedAt: null
      }
    });

    if (!workspace) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Workspace not found or access denied'
      );
    }

    return prisma.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() }
    });
  },

  async updateWorkspace(workspaceId, userId, updateBody) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: userId,
        deletedAt: null
      }
    });

    if (!workspace) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Workspace not found or access denied'
      );
    }

    return prisma.workspace.update({
      where: { id: workspaceId },
      data: updateBody
    });
  }

};
