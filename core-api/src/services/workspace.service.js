import httpStatus from 'http-status';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';
import crypto from 'crypto';
import { sendEmail } from './email.service.js';

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
    const workspaces = await prisma.workspace.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId } },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        // We include the membership record for THIS specific user to get the flag
        members: {
          where: { userId },
          select: { isFavorite: true, role: true, joinedAt: true, user: true }
        },
        _count: {
          select: {
            collections: { where: { deletedAt: null } },
            environments: { where: { deletedAt: null } }
          }
        }
      },
    });

    // Flatten the response so isFavorite is easier to access on the frontend
    return workspaces.map(ws => ({
      ...ws,
      isFavorite: ws.members[0]?.isFavorite || false,
      myRole: ws.members[0]?.role || 'VIEWER'
    }));
  },

  async updateFavoriteStatus(workspaceId, userId, isFavorite) {
    return prisma.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      data: { isFavorite },
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

  async addMemberDirectly(workspaceId, userId, memberEmail, role = 'VIEWER') {
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

  // 1. Create the Invite
  async createInvite(workspaceId, inviterId, email, role) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new ApiError(httpStatus.NOT_FOUND, 'Workspace not found');

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMember = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } }
      });
      if (existingMember) throw new ApiError(httpStatus.BAD_REQUEST, 'User is already a member');
    }

    const existingInvite = await prisma.workspaceInvite.findFirst({
      where: { workspaceId, email, status: 'PENDING' }
    });
    if (existingInvite) throw new ApiError(httpStatus.BAD_REQUEST, 'An invite is already pending for this email');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await prisma.workspaceInvite.create({
      data: { workspaceId, inviterId, email, role: role.toUpperCase(), token, expiresAt },
      include: {
        inviter: {
          select: {
            fullName: true,
          }
        }
      }
    });

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${token}`;
    const emailHtml = `
      <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
        <h2 style="color: #333;">You've been invited!</h2>
        <p style="color: #555; line-height: 1.5;">You have been invited to join the <strong>${workspace.name}</strong> workspace on Trace-weave as a <strong>${role}</strong>.</p>
        <div style="margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #FF6F00; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
        </div>
        <p style="color: #888; font-size: 12px;">This link expires in 7 days. If you don't have an account, you will be prompted to create one.</p>
      </div>
    `;

    await sendEmail({
      to: email,
      subject: `Invitation to join ${workspace.name} on Trace-weave`,
      html: emailHtml
    });

    return invite;
  },

  // Common Link: Toggle & Generate
  async generateOrToggleCommonLink(workspaceId, isActive) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const data = {
      isInviteLinkActive: isActive
    };

    if (isActive && !workspace.inviteToken) {
      data.inviteToken = crypto.randomBytes(16).toString('hex');
    }

    return prisma.workspace.update({
      where: { id: workspaceId },
      data
    });
  },

  async resetCommonLink(workspaceId) {
    return prisma.workspace.update({
      where: { id: workspaceId },
      data: { inviteToken: crypto.randomBytes(16).toString('hex'), isInviteLinkActive: true }
    });
  },

  // 2. Get Pending Invites for the Team Dashboard
  async getPendingInvites(workspaceId) {
    return prisma.workspaceInvite.findMany({
      where: { workspaceId, status: 'PENDING' },
      include: {
        inviter: { select: { fullName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  },

  // 3. Accept the Invite
  async acceptInvite(token, userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    // Path A: Check if it's an Email Invite
    const emailInvite = await prisma.workspaceInvite.findUnique({ where: { token } });
    if (emailInvite) {
      if (emailInvite.status !== 'PENDING') throw new ApiError(httpStatus.BAD_REQUEST, 'Invite is no longer valid');
      if (new Date() > emailInvite.expiresAt) throw new ApiError(httpStatus.BAD_REQUEST, 'Invite has expired');
      if (user.email !== emailInvite.email) throw new ApiError(httpStatus.FORBIDDEN, 'This invite was sent to a different email address');

      const [newMember] = await prisma.$transaction([
        prisma.workspaceMember.create({
          data: { workspaceId: emailInvite.workspaceId, userId: user.id, role: emailInvite.role }
        }),
        prisma.workspaceInvite.update({ where: { id: emailInvite.id }, data: { status: 'ACCEPTED' } })
      ]);
      return newMember;
    }

    // Path B: Check if it's a Common Workspace Link
    const workspace = await prisma.workspace.findUnique({ where: { inviteToken: token } });
    if (workspace) {
      if (!workspace.isInviteLinkActive) throw new ApiError(httpStatus.BAD_REQUEST, 'This invite link has been disabled');
      
      // Check if already a member
      const existing = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } }
      });
      if (existing) return existing; // Just return them if they are already in

      // Anyone joining via common link defaults to VIEWER for security
      return prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role: 'VIEWER' }
      });
    }

    // Path C: Neither
    throw new ApiError(httpStatus.NOT_FOUND, 'Invalid or expired invite link');
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

  async duplicateWorkspace(sourceWorkspaceId, userId) {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch source workspace with root-level assets
      const source = await tx.workspace.findUnique({
        where: { id: sourceWorkspaceId, deletedAt: null },
        include: {
          environments: { 
            where: { deletedAt: null },
            include: { variables: { where: { deletedAt: null } } } 
          },
          workflows: { where: { deletedAt: null } },
        }
      });

      if (!source) throw new ApiError(httpStatus.NOT_FOUND, 'Source workspace not found');

      // 2. Create New Independent Workspace
      const newWorkspace = await tx.workspace.create({
        data: {
          name: `${source.name} (Copy)`,
          description: source.description,
          ownerId: userId,
          members: {
            create: { userId: userId, role: 'OWNER' } // Only the duplicator is added
          }
        }
      });

      // 3. Clone Environments (Independent Records)
      for (const env of source.environments) {
        await tx.environment.create({
          data: {
            name: env.name,
            isPersistent: env.isPersistent,
            workspaceId: newWorkspace.id,
            createdById: userId,
            variables: {
              create: env.variables.map(v => ({
                key: v.key,
                value: v.value,
                isSecret: v.isSecret,
                createdById: userId
              }))
            }
          }
        });
      }

      // 4. Clone Workflows (Independent Records)
      for (const wf of source.workflows) {
        await tx.workflow.create({
          data: {
            name: wf.name,
            description: wf.description,
            flowData: wf.flowData, // Deep copy of the JSON blob
            workspaceId: newWorkspace.id
          }
        });
      }

      // 5. Recursive Helper for Deep Collection Cloning
      const deepCloneCollections = async (oldParentId, newParentId = null) => {
        // Find all collections at this specific level
        const collections = await tx.collection.findMany({
          where: { parentId: oldParentId, workspaceId: sourceWorkspaceId, deletedAt: null },
          include: { requests: { where: { deletedAt: null } } }
        });

        for (const col of collections) {
          // Create new collection in the new workspace
          const createdCol = await tx.collection.create({
            data: {
              name: col.name,
              workspaceId: newWorkspace.id,
              parentId: newParentId,
              order: col.order,
              requests: {
                create: col.requests.map(req => ({
                  name: req.name,
                  protocol: req.protocol,
                  config: req.config,
                  order: req.order
                }))
              }
            }
          });

          // Recursively clone children of THIS collection
          await deepCloneCollections(col.id, createdCol.id);
        }
      };

      // Start recursion from the root (parentId: null)
      await deepCloneCollections(null);

      return newWorkspace;
    }, {
      timeout: 15000 // Increase timeout for large workspaces
    });
  }
};
