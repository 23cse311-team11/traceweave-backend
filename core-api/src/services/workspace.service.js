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
