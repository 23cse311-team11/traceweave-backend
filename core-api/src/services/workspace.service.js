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
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  fullName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      console.error("--- PRISMA ERROR DEBUG ---");
      console.error("Code:", error.code);
      console.error("Message:", error.message);

      if (error.code === 'P2025') {
        throw new ApiError(httpStatus.NOT_FOUND, 'User (Owner) not found');
      }

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
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
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
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
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

  async addMember(workspaceId, userId, memberEmail, role = 'VIEWER') {
    const normalizedRole = role.toUpperCase();

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: userId,
        deletedAt: null,
      },
    });

    if (!workspace) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Workspace not found or access denied');
    }

    const userToAdd = await prisma.user.findUnique({
      where: { email: memberEmail },
    });

    if (!userToAdd) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    try {
      const newMember = await prisma.workspaceMember.create({
        data: {
          workspaceId,
          userId: userToAdd.id,
          role: normalizedRole,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      const persistentEnvs = await prisma.environment.findMany({
        where: { workspaceId, isPersistent: true, deletedAt: null },
      });

      if (persistentEnvs.length > 0) {
        await prisma.userEnvironment.createMany({
          data: persistentEnvs.map((env) => ({
            userId: userToAdd.id,
            workspaceId,
            environmentId: env.id,
          })),
          skipDuplicates: true,
        });
      }

      return newMember;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'User is already a member of this workspace'
        );
      }
      throw error;
    }
  },

  async removeMember(workspaceId, userId, memberUserId) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    });

    if (memberUserId === workspace.ownerId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot remove the owner from the workspace'
      );
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
    });

    if (!member) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Member not found');
    }

    return prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
    });
  },

  async deleteWorkspace(workspaceId, userId) {
    return prisma.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() },
    });
  },

  async updateWorkspace(workspaceId, userId, updateBody) {
    return prisma.workspace.update({
      where: { id: workspaceId },
      data: updateBody,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  },
  async updateMemberRole(workspaceId, memberUserId, newRole) {
    const normalizedRole = newRole.toUpperCase();

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    });

    if (memberUserId === workspace.ownerId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot change the role of the workspace owner'
      );
    }

    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
    });

    if (!member) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Member not found');
    }

    return prisma.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
      data: { role: normalizedRole },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });
  },
};
