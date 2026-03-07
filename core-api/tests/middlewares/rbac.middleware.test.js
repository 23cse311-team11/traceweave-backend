import { jest } from '@jest/globals';
import httpStatus from 'http-status';
import httpMocks from 'node-mocks-http';
import ApiError from '../../src/utils/ApiError.js';

// Mocks
const mockPrisma = {
    collection: { findUnique: jest.fn() },
    requestDefinition: { findUnique: jest.fn() },
    environment: { findUnique: jest.fn() },
    workflow: { findUnique: jest.fn() },
};

const mockRbacUtils = {
    checkWorkspacePermission: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
    default: mockPrisma,
}));

jest.unstable_mockModule('../../src/utils/rbac.utils.js', () => ({
    checkWorkspacePermission: mockRbacUtils.checkWorkspacePermission,
}));

// Import middleware after mocking
const { requireWorkspaceRole } = await import('../../src/middlewares/rbac.middleware.js');

describe('RBAC Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = httpMocks.createRequest({
            user: { id: 'user1' },
        });
        res = httpMocks.createResponse();
        next = jest.fn();
        jest.clearAllMocks();
    });

    test('should proceed if workspaceId is in params and permission is granted', async () => {
        req.params.workspaceId = 'ws1';
        mockRbacUtils.checkWorkspacePermission.mockResolvedValue(true);

        const middleware = requireWorkspaceRole('VIEWER');
        await middleware(req, res, next);

        expect(mockRbacUtils.checkWorkspacePermission).toHaveBeenCalledWith('ws1', 'user1', 'VIEWER');
        expect(req.workspaceId).toBe('ws1');
        expect(next).toHaveBeenCalledWith();
    });

    test('should resolve workspaceId from collectionId', async () => {
        req.params.collectionId = 'coll1';
        mockPrisma.collection.findUnique.mockResolvedValue({ workspaceId: 'ws1' });
        mockRbacUtils.checkWorkspacePermission.mockResolvedValue(true);

        const middleware = requireWorkspaceRole('EDITOR');
        await middleware(req, res, next);

        expect(mockPrisma.collection.findUnique).toHaveBeenCalledWith({
            where: { id: 'coll1' },
            select: { workspaceId: true },
        });
        expect(req.workspaceId).toBe('ws1');
        expect(next).toHaveBeenCalledWith();
    });

    test('should throw 404 if collection not found', async () => {
        req.params.collectionId = 'coll1';
        mockPrisma.collection.findUnique.mockResolvedValue(null);

        const middleware = requireWorkspaceRole('EDITOR');
        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(httpStatus.NOT_FOUND);
        expect(error.message).toBe('Collection not found');
    });

    test('should resolve workspaceId from requestId', async () => {
        req.params.requestId = 'req1';
        mockPrisma.requestDefinition.findUnique.mockResolvedValue({
            collection: { workspaceId: 'ws1' }
        });
        mockRbacUtils.checkWorkspacePermission.mockResolvedValue(true);

        const middleware = requireWorkspaceRole('VIEWER');
        await middleware(req, res, next);

        expect(mockPrisma.requestDefinition.findUnique).toHaveBeenCalled();
        expect(req.workspaceId).toBe('ws1');
        expect(next).toHaveBeenCalledWith();
    });

    test('should resolve workspaceId from environmentId', async () => {
        req.params.environmentId = 'env1';
        mockPrisma.environment.findUnique.mockResolvedValue({ workspaceId: 'ws1' });
        mockRbacUtils.checkWorkspacePermission.mockResolvedValue(true);

        const middleware = requireWorkspaceRole('EDITOR');
        await middleware(req, res, next);

        expect(mockPrisma.environment.findUnique).toHaveBeenCalled();
        expect(req.workspaceId).toBe('ws1');
        expect(next).toHaveBeenCalled();
    });

    test('should throw error if workspace context cannot be determined', async () => {
        const middleware = requireWorkspaceRole('VIEWER');
        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next.mock.calls[0][0];
        expect(error.statusCode).toBe(httpStatus.BAD_REQUEST);
        expect(error.message).toBe('Could not determine workspace context');
    });

    test('should call next with error if checkWorkspacePermission fails', async () => {
        req.params.workspaceId = 'ws1';
        const error = new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
        mockRbacUtils.checkWorkspacePermission.mockRejectedValue(error);

        const middleware = requireWorkspaceRole('OWNER');
        await middleware(req, res, next);

        expect(next).toHaveBeenCalledWith(error);
    });
});
