import httpStatus from 'http-status';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';
import { encrypt, decrypt } from '../utils/encryption.js';

export const environmentService = {
    // Create Environment
    async createEnvironment(workspaceId, userId, { name, isPersistent }) {
        // 1. Transaction to create Env + UserEnvironment links
        return prisma.$transaction(async (tx) => {
            const environment = await tx.environment.create({
                data: {
                    workspaceId,
                    name,
                    isPersistent,
                    createdById: userId,
                },
            });

            // 2. Determine who gets access
            // Invariant: Creator & Owner ALWAYS get access.
            // If isPersistent=true: ALL members get access.

            const workspace = await tx.workspace.findUnique({
                where: { id: workspaceId },
                include: { members: true },
            });

            if (!workspace) throw new ApiError(httpStatus.NOT_FOUND, 'Workspace not found');

            const userIdsToLink = new Set();
            userIdsToLink.add(userId); // Creator
            userIdsToLink.add(workspace.ownerId); // Owner

            if (isPersistent) {
                workspace.members.forEach((member) => {
                    userIdsToLink.add(member.userId);
                });
            }

            const userEnvData = Array.from(userIdsToLink).map((uid) => ({
                userId: uid,
                workspaceId,
                environmentId: environment.id,
            }));

            await tx.userEnvironment.createMany({
                data: userEnvData,
                skipDuplicates: true,
            });

            return environment;
        });
    },

    // Get Environments for Workspace (Filtered by access)
    async getWorkspaceEnvironments(workspaceId, userId) {
        return prisma.environment.findMany({
            where: {
                workspaceId,
                deletedAt: null,
                userEnvironments: {
                    some: { userId },
                },
            },
            include: {
                createdBy: {
                    select: { id: true, fullName: true, email: true },
                },
                _count: {
                    select: { variables: true },
                },
            },
        });
    },

    // Delete Environment (Owner Only - Checked by Controller/Route)
    async deleteEnvironment(environmentId) {
        // Soft delete
        return prisma.environment.update({
            where: { id: environmentId },
            data: { deletedAt: new Date() },
        });
    },

    async togglePersistent(environmentId, userId, isPersistent) {
        return prisma.$transaction(async (tx) => {
            const environment = await tx.environment.findUnique({
                where: { id: environmentId },
                include: { workspace: { include: { members: true } } },
            });

            if (!environment) throw new ApiError(httpStatus.NOT_FOUND, 'Environment not found');

            const userAccess = await tx.userEnvironment.findUnique({
                where: {
                    userId_environmentId: { userId, environmentId },
                },
            });

            if (!userAccess) {
                throw new ApiError(httpStatus.FORBIDDEN, 'Access denied to this environment');
            }

            const isCreator = environment.createdById === userId;
            const isOwner = environment.workspace.ownerId === userId;

            if (!isCreator && !isOwner) {
                throw new ApiError(
                    httpStatus.FORBIDDEN,
                    'Only the environment creator or workspace owner can toggle persistence'
                );
            }

            await tx.environment.update({
                where: { id: environmentId },
                data: { isPersistent },
            });

            if (isPersistent) {
                const userIdsToLink = environment.workspace.members.map((m) => m.userId);
                const data = userIdsToLink.map((uid) => ({
                    userId: uid,
                    workspaceId: environment.workspaceId,
                    environmentId,
                }));
                await tx.userEnvironment.createMany({
                    data,
                    skipDuplicates: true,
                });
            } else {
                await tx.userEnvironment.deleteMany({
                    where: {
                        environmentId,
                        userId: {
                            notIn: [environment.createdById, environment.workspace.ownerId],
                        },
                    },
                });
            }

            return environment;
        });
    },

    async createVariable(environmentId, userId, { key, value, isSecret }) {
        const environment = await prisma.environment.findUnique({
            where: { id: environmentId },
            include: { workspace: true },
        });

        if (!environment) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Environment not found');
        }

        const userAccess = await prisma.userEnvironment.findUnique({
            where: {
                userId_environmentId: { userId, environmentId },
            },
        });

        if (!userAccess) {
            throw new ApiError(httpStatus.FORBIDDEN, 'Access denied to this environment');
        }

        if (environment.isPersistent) {
            const member = await prisma.workspaceMember.findUnique({
                where: {
                    workspaceId_userId: {
                        workspaceId: environment.workspaceId,
                        userId,
                    },
                },
            });

            if (!member || member.role === 'VIEWER') {
                throw new ApiError(
                    httpStatus.FORBIDDEN,
                    'Viewers cannot create variables in persistent environments'
                );
            }
        }

        const finalValue = encrypt(value);

        return prisma.environmentVariable.create({
            data: {
                environmentId,
                key,
                value: finalValue,
                isSecret,
                createdById: userId,
            },
        });
    },

    // Get Variables
    async getVariables(environmentId, userId) {
        // Access check: User must have UserEnvironment entry
        const access = await prisma.userEnvironment.findUnique({
            where: {
                userId_environmentId: { userId, environmentId },
            },
        });

        if (!access) {
            throw new ApiError(httpStatus.FORBIDDEN, 'Access denied to this environment');
        }

        const variables = await prisma.environmentVariable.findMany({
            where: { environmentId, deletedAt: null },
        });

        return variables.map((v) => ({
            ...v,
            value: v.isSecret ? '********' : decrypt(v.value),
        }));
    },


    async updateVariable(variableId, userId, { key, value, isSecret }) {
        const variable = await prisma.environmentVariable.findUnique({
            where: { id: variableId },
            include: {
                environment: { include: { workspace: true } },
            },
        });

        if (!variable) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Variable not found');
        }

        const userAccess = await prisma.userEnvironment.findUnique({
            where: {
                userId_environmentId: {
                    userId,
                    environmentId: variable.environmentId,
                },
            },
        });

        if (!userAccess) {
            throw new ApiError(httpStatus.FORBIDDEN, 'Access denied to this environment');
        }

        if (variable.environment.isPersistent) {
            const member = await prisma.workspaceMember.findUnique({
                where: {
                    workspaceId_userId: {
                        workspaceId: variable.environment.workspaceId,
                        userId,
                    },
                },
            });

            if (!member || member.role === 'VIEWER') {
                throw new ApiError(
                    httpStatus.FORBIDDEN,
                    'Viewers cannot update variables in persistent environments'
                );
            }
        }

        const data = {};
        if (key !== undefined) data.key = key;
        if (isSecret !== undefined) data.isSecret = isSecret;
        if (value !== undefined) {
            data.value = encrypt(value);
        }

        return prisma.environmentVariable.update({
            where: { id: variableId },
            data,
        });
    },

    async deleteVariable(variableId, userId) {
        const variable = await prisma.environmentVariable.findUnique({
            where: { id: variableId },
            include: {
                environment: { include: { workspace: true } },
            },
        });

        if (!variable) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Variable not found');
        }

        const isCreator = variable.environment.createdById === userId;
        const isOwner = variable.environment.workspace.ownerId === userId;

        if (!isCreator && !isOwner) {
            throw new ApiError(
                httpStatus.FORBIDDEN,
                'Only the environment creator or workspace owner can delete variables'
            );
        }

        return prisma.environmentVariable.delete({
            where: { id: variableId },
        });
    },

    async renameVariable(variableId, userId, newKey) {
        const variable = await prisma.environmentVariable.findUnique({
            where: { id: variableId },
            include: {
                environment: { include: { workspace: true } },
            },
        });

        if (!variable) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Variable not found');
        }

        const userAccess = await prisma.userEnvironment.findUnique({
            where: {
                userId_environmentId: {
                    userId,
                    environmentId: variable.environmentId,
                },
            },
        });

        if (!userAccess) {
            throw new ApiError(httpStatus.FORBIDDEN, 'Access denied to this environment');
        }

        if (variable.environment.isPersistent) {
            const member = await prisma.workspaceMember.findUnique({
                where: {
                    workspaceId_userId: {
                        workspaceId: variable.environment.workspaceId,
                        userId,
                    },
                },
            });

            if (!member || member.role === 'VIEWER') {
                throw new ApiError(
                    httpStatus.FORBIDDEN,
                    'Viewers cannot rename variables in persistent environments'
                );
            }
        }

        return prisma.environmentVariable.update({
            where: { id: variableId },
            data: { key: newKey },
        });
    },

    /**
     * Get variables for request execution
     * Validates access and returns decrypted key-value map
     * @param {string} environmentId - Environment ID
     * @param {string} userId - User ID
     * @param {string} workspaceId - Workspace ID for validation
     * @returns {Object} - Key-value map of variables
     */
    async getVariablesForExecution(environmentId, userId, workspaceId) {
        // 1. Fetch environment and validate it belongs to the workspace
        const environment = await prisma.environment.findUnique({
            where: { id: environmentId },
        });

        if (!environment) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Environment not found');
        }

        if (environment.workspaceId !== workspaceId) {
            throw new ApiError(
                httpStatus.FORBIDDEN,
                'Environment does not belong to this workspace'
            );
        }

        if (environment.deletedAt) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Environment has been deleted');
        }

        // 2. Check user has access via UserEnvironment table
        const userAccess = await prisma.userEnvironment.findUnique({
            where: {
                userId_environmentId: { userId, environmentId },
            },
        });

        if (!userAccess) {
            throw new ApiError(
                httpStatus.FORBIDDEN,
                'You do not have access to this environment'
            );
        }

        // 3. Fetch all variables and decrypt them
        const variables = await prisma.environmentVariable.findMany({
            where: { environmentId, deletedAt: null },
        });

        // 4. Build key-value map with decrypted values
        const variableMap = {};
        for (const variable of variables) {
            variableMap[variable.key] = decrypt(variable.value);
        }

        return variableMap;
    }
};
