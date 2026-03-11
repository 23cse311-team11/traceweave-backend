import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// --------------------
// Mocks
// --------------------
const mockAuthMiddleware = jest.fn((req, res, next) => {
    req.user = { id: 'user1' };
    next();
});

const mockRequireWorkspaceRole = (role) => jest.fn((req, res, next) => {
    req.workspaceId = req.params.workspaceId || 'ws1';
    next();
});

const mockControllers = {
    createWorkspace: jest.fn((req, res) => res.status(201).json({ id: 'ws1' })),
    getMyWorkspaces: jest.fn((req, res) => res.status(200).json([])),
    getWorkspaceById: jest.fn((req, res) => res.status(200).json({ id: 'ws1' })),
    deleteWorkspace: jest.fn((req, res) => res.status(200).json({})),
    updateWorkspace: jest.fn((req, res) => res.status(200).json({})),
    addMemberToWorkspace: jest.fn((req, res) => res.status(201).json({})),
    removeMemberFromWorkspace: jest.fn((req, res) => res.status(200).json({})),
    updateMemberRole: jest.fn((req, res) => res.status(200).json({})),
    getWorkspaceHistory: jest.fn((req, res) => res.status(200).json([])),
    createEnvironment: jest.fn((req, res) => res.status(201).json({})),
    getWorkspaceEnvironments: jest.fn((req, res) => res.status(200).json([])),
    getGlobalHistory: jest.fn((req, res) => res.status(200).json([])),
    getGlobalStats: jest.fn((req, res) => res.status(200).json({})),
    createWorkspaceInvite: jest.fn((req, res) => res.status(201).json({})),
    getPendingInvites: jest.fn((req, res) => res.status(200).json([])),
    acceptWorkspaceInvite: jest.fn((req, res) => res.status(200).json({})),
    toggleCommonLink: jest.fn((req, res) => res.status(200).json({})),
    resetCommonLink: jest.fn((req, res) => res.status(200).json({})),
    duplicateWorkspace: jest.fn((req, res) => res.status(201).json({ id: 'ws-copy' })),
    toggleFavorite: jest.fn((req, res) => res.status(200).json({})),
    getGlobalEnvironments: jest.fn((req, res) => res.status(200).json([])),
};

// Mock modules
jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

jest.unstable_mockModule('../../src/middlewares/rbac.middleware.js', () => ({
    requireWorkspaceRole: mockRequireWorkspaceRole,
}));

// Mock the Workspace Controller with all necessary exports
jest.unstable_mockModule('../../src/controllers/workspace.controller.js', () => ({
    createWorkspace: mockControllers.createWorkspace,
    getMyWorkspaces: mockControllers.getMyWorkspaces,
    getWorkspaceById: mockControllers.getWorkspaceById,
    deleteWorkspace: mockControllers.deleteWorkspace,
    updateWorkspace: mockControllers.updateWorkspace,
    addMemberToWorkspace: mockControllers.addMemberToWorkspace,
    removeMemberFromWorkspace: mockControllers.removeMemberFromWorkspace,
    updateMemberRole: mockControllers.updateMemberRole,
    getWorkspaceHistory: mockControllers.getWorkspaceHistory,
    getGlobalHistory: mockControllers.getGlobalHistory,
    getGlobalStats: mockControllers.getGlobalStats,
    createWorkspaceInvite: mockControllers.createWorkspaceInvite,
    getPendingInvites: mockControllers.getPendingInvites,
    acceptWorkspaceInvite: mockControllers.acceptWorkspaceInvite,
    toggleCommonLink: mockControllers.toggleCommonLink,
    resetCommonLink: mockControllers.resetCommonLink,
    duplicateWorkspace: mockControllers.duplicateWorkspace,
    toggleFavorite: mockControllers.toggleFavorite,
}));

// Mock the Environment Controller (Environment functions are used in Workspace routes)
jest.unstable_mockModule('../../src/controllers/environment.controller.js', () => ({
    createEnvironment: mockControllers.createEnvironment,
    getWorkspaceEnvironments: mockControllers.getWorkspaceEnvironments,
    getGlobalEnvironments: mockControllers.getGlobalEnvironments,
}));

// Import router after all mocks are defined
const { default: workspaceRouter } = await import('../../src/routes/workspace.routes.js');

describe('Workspace Routes', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/workspaces', workspaceRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // --- Base Workspace Tests ---
    test('POST /workspaces/create should call createWorkspace controller', async () => {
        const response = await request(app)
            .post('/workspaces/create')
            .send({ name: 'New Workspace' });

        expect(response.status).toBe(201);
        expect(mockControllers.createWorkspace).toHaveBeenCalled();
    });

    test('GET /workspaces should call getMyWorkspaces controller', async () => {
        const response = await request(app).get('/workspaces');
        expect(response.status).toBe(200);
        expect(mockControllers.getMyWorkspaces).toHaveBeenCalled();
    });

    // --- Invite System Tests ---
    test('POST /workspaces/invites/accept should call acceptWorkspaceInvite', async () => {
        const response = await request(app)
            .post('/workspaces/invites/accept')
            .send({ token: 'test-token' });
        
        expect(response.status).toBe(200);
        expect(mockControllers.acceptWorkspaceInvite).toHaveBeenCalled();
    });

    test('POST /workspaces/:workspaceId/invites should call createWorkspaceInvite', async () => {
        const response = await request(app)
            .post('/workspaces/ws1/invites')
            .send({ email: 'test@example.com', role: 'VIEWER' });
        
        expect(response.status).toBe(201);
        expect(mockControllers.createWorkspaceInvite).toHaveBeenCalled();
    });

    // --- Member Management Tests ---
    test('PATCH /workspaces/:workspaceId/members/:userId should call updateMemberRole', async () => {
        const response = await request(app)
            .patch('/workspaces/ws1/members/user2')
            .send({ role: 'EDITOR' });
        
        expect(response.status).toBe(200);
        expect(mockControllers.updateMemberRole).toHaveBeenCalled();
    });
});