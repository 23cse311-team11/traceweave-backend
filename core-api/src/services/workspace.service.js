import prisma from "../config/prisma.js";

export const workspaceService = {
  async createWorkspace({ name, description, ownerId }) {
    return prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name,
          description,
          ownerId,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: ownerId,
          role: 'OWNER',
        },
      });

      return workspace;
    });
  },
};

export const getMyWorkspaces = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const workspaces = await workspaceService.getUserWorkspaces(userId);

    res.status(200).json({ data: workspaces });
  } catch (error) {
    next(error);
  }
};

export const getWorkspaceById = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    const workspace = await workspaceService.getWorkspaceById(
      workspaceId,
      userId
    );

    res.status(200).json({ data: workspace });
  } catch (error) {
    next(error);
  }
};