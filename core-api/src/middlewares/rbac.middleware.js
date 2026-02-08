import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';
import { checkWorkspacePermission } from '../utils/rbac.utils.js';

/**
 * Middleware to enforce workspace role requirements.
 * Resolves workspaceId from params: workspaceId, collectionId, requestId, or environmentId.
 * @param {string} requiredRole - 'OWNER', 'EDITOR', 'VIEWER'
 */
export const requireWorkspaceRole = (requiredRole) => async (req, res, next) => {
    try {
        const userId = req.user.id;
        let workspaceId = req.params.workspaceId;

        // 1. Resolve workspaceId if not directly in params
        if (!workspaceId) {
            if (req.params.collectionId) {
                const collection = await prisma.collection.findUnique({
                    where: { id: req.params.collectionId },
                    select: { workspaceId: true },
                });
                if (!collection) {
                    throw new ApiError(httpStatus.NOT_FOUND, 'Collection not found');
                }
                workspaceId = collection.workspaceId;
                req.collection = collection;
            } else if (req.params.requestId) {
                const request = await prisma.requestDefinition.findUnique({
                    where: { id: req.params.requestId },
                    include: { collection: { select: { workspaceId: true } } },
                });
                if (!request) {
                    throw new ApiError(httpStatus.NOT_FOUND, 'Request not found');
                }
                if (!request.collection) {
                    throw new ApiError(httpStatus.NOT_FOUND, 'Request collection not found');
                }
                workspaceId = request.collection.workspaceId;
                req.requestDefinition = request;
            } else if (req.params.environmentId) {
                const environment = await prisma.environment.findUnique({
                    where: { id: req.params.environmentId },
                    select: { workspaceId: true },
                });
                if (!environment) {
                    throw new ApiError(httpStatus.NOT_FOUND, 'Environment not found');
                }
                workspaceId = environment.workspaceId;
                req.environment = environment;
            }
        }

        if (!workspaceId) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Could not determine workspace context');
        }

        // 2. Check Permissions
        await checkWorkspacePermission(workspaceId, userId, requiredRole);

        // Attach workspaceId to req for convenience
        req.workspaceId = workspaceId;

        next();
    } catch (error) {
        next(error);
    }
};
