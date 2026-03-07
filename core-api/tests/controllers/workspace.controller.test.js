import { jest } from '@jest/globals';
import httpStatus from 'http-status';

// Mocks
const mockWorkspaceService = {
    createWorkspace: jest.fn(),
    getUserWorkspaces: jest.fn(),
    getWorkspaceById: jest.fn(),
    deleteWorkspace: jest.fn(),
    updateWorkspace: jest.fn(),
    addMemberDirectly: jest.fn(),
    removeMember: jest.fn(),
    updateMemberRole: jest.fn(),
};

const mockPrisma = {
    workspace: {
        findUnique: jest.fn(),
    },
};

const mockExecutionLog = {
    find: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(0),
};

jest.unstable_mockModule('../../src/services/workspace.service.js', () => ({
    workspaceService: mockWorkspaceService,
}));

jest.unstable_mockModule('../../src/models/execution.model.js', () => ({
    default: mockExecutionLog,
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
    default: mockPrisma,
}));

// Import controller
const {
    createWorkspace,
    getMyWorkspaces,
    getWorkspaceById,
    deleteWorkspace,
    updateWorkspace,
    addMemberToWorkspace,
    removeMemberFromWorkspace,
    updateMemberRole,
    getWorkspaceHistory
} = await import('../../src/controllers/workspace.controller.js');

describe('Workspace Controller', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            user: { id: 'user1' },
            params: {},
            body: {},
            query: {},
        };
        res = {
            status: jest.fn(function () { return this; }),
            json: jest.fn(function () { return this; }),
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('createWorkspace', () => {
        test('should create workspace and return 201', async () => {
            req.body = { name: 'New WS' };
            const workspace = { id: 'ws1', name: 'New WS' };
            mockWorkspaceService.createWorkspace.mockResolvedValue(workspace);

            await createWorkspace(req, res, next);

            expect(res.status).toHaveBeenCalledWith(httpStatus.CREATED);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: workspace }));
        });

        test('should return 400 if name is missing', async () => {
            req.body = {};
            await createWorkspace(req, res, next);
            expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
        });
    });

    describe('getMyWorkspaces', () => {
        test('should return workspaces for current user', async () => {
            const workspaces = [{ id: 'ws1' }];
            mockWorkspaceService.getUserWorkspaces.mockResolvedValue(workspaces);

            await getMyWorkspaces(req, res, next);

            expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
            expect(res.json).toHaveBeenCalledWith({ data: workspaces });
        });
    });

    describe('addMemberToWorkspace', () => {
        test('should add member and return 201', async () => {
            req.params.workspaceId = 'ws1';
            req.body = { email: 'test@ex.com', role: 'EDITOR' };
            mockWorkspaceService.addMemberDirectly.mockResolvedValue({ userId: 'user2' });

            await addMemberToWorkspace(req, res, next);

            expect(res.status).toHaveBeenCalledWith(httpStatus.CREATED);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Member added successfully' }));
        });
    });

    describe('getWorkspaceHistory', () => {
        test('should return history with pagination', async () => {
            req.params.workspaceId = 'ws1';
            const logs = [{ id: 'log1' }];
            mockExecutionLog.lean.mockResolvedValue(logs);
            mockExecutionLog.countDocuments.mockResolvedValue(1);

            await getWorkspaceHistory(req, res, next);

            expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                data: logs,
                pagination: expect.objectContaining({
                    total: 1,
                    page: 1,
                    limit: 20,
                    pages: 1
                }),
            }));
        });
    });
});
