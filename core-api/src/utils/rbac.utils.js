import httpStatus from 'http-status';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';

/**
 * Roles hierarchy:
 * OWNER > EDITOR > VIEWER
 */
const ROLES = {
    OWNER: 3,
    EDITOR: 2,
    VIEWER: 1,
};

/**
 * Check if a user has sufficient permissions in a workspace
 * @param {string} workspaceId 
 * @param {string} userId 
 * @param {string} requiredRole - 'OWNER', 'EDITOR', or 'VIEWER'
 * @returns {Promise<Object>} - The workspace member record
 */
export const checkWorkspacePermission = async (workspaceId, userId, requiredRole = 'VIEWER') => {
    const member = await prisma.workspaceMember.findUnique({
        where: {
            workspaceId_userId: {
                workspaceId,
                userId,
            },
        },
        include: {
            workspace: true
        }
    });

    if (!member || member.workspace.deletedAt) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Workspace not found or access denied');
    }

    const userRoleValue = ROLES[member.role] || 0;
    const requiredRoleValue = ROLES[requiredRole] || 0;

    if (userRoleValue < requiredRoleValue) {
        throw new ApiError(httpStatus.FORBIDDEN, 'No permission to perform this action');
    }

    return member;
};
