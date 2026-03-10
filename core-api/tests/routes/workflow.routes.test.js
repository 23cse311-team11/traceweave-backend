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

const mockWorkflowController = {
    createWorkflow: jest.fn((req, res) => res.status(201).json({ id: 'wf1', name: 'My Workflow' })),
    getWorkflows: jest.fn((req, res) => res.status(200).json({ workflows: [] })),
    getWorkflowById: jest.fn((req, res) => res.status(200).json({ id: 'wf1', name: 'My Workflow' })),
    updateWorkflow: jest.fn((req, res) => res.status(200).json({ id: 'wf1' })),
    runWorkflow: jest.fn((req, res) => res.status(202).json({ executionId: 'exec1', status: 'RUNNING' })),
    getWorkflowHistory: jest.fn((req, res) => res.status(200).json({ executions: [] })),
};

// Mock modules
jest.unstable_mockModule('../../src/middlewares/auth.middleware.js', () => ({
    default: mockAuthMiddleware,
}));

jest.unstable_mockModule('../../src/middlewares/rbac.middleware.js', () => ({
    requireWorkspaceRole: mockRequireWorkspaceRole,
}));

jest.unstable_mockModule('../../src/controllers/workflow.controller.js', () => ({
    workflowController: mockWorkflowController,
}));

// Import router after mocks
const { default: workflowRouter } = await import('../../src/routes/workflow.routes.js');

describe('Workflow Routes', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/workflows', workflowRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('POST /workflows should call createWorkflow and return 201', async () => {
        const response = await request(app)
            .post('/workflows')
            .send({ name: 'My Workflow', workspaceId: 'ws1' });

        expect(response.status).toBe(201);
        expect(mockWorkflowController.createWorkflow).toHaveBeenCalled();
    });

    test('GET /workflows/workspace/:workspaceId should call getWorkflows', async () => {
        const response = await request(app).get('/workflows/workspace/ws1');

        expect(response.status).toBe(200);
        expect(mockWorkflowController.getWorkflows).toHaveBeenCalled();
    });

    test('GET /workflows/:workflowId should call getWorkflowById', async () => {
        const response = await request(app).get('/workflows/wf1');

        expect(response.status).toBe(200);
        expect(mockWorkflowController.getWorkflowById).toHaveBeenCalled();
    });

    test('PATCH /workflows/:workflowId should call updateWorkflow', async () => {
        const response = await request(app)
            .patch('/workflows/wf1')
            .send({ name: 'Updated Workflow' });

        expect(response.status).toBe(200);
        expect(mockWorkflowController.updateWorkflow).toHaveBeenCalled();
    });

    test('POST /workflows/:workflowId/run should call runWorkflow and return 202', async () => {
        const response = await request(app)
            .post('/workflows/wf1/run')
            .send({});

        expect(response.status).toBe(202);
        expect(mockWorkflowController.runWorkflow).toHaveBeenCalled();
        expect(response.body).toHaveProperty('executionId');
    });

    test('GET /workflows/:workflowId/history should call getWorkflowHistory', async () => {
        const response = await request(app).get('/workflows/wf1/history');

        expect(response.status).toBe(200);
        expect(mockWorkflowController.getWorkflowHistory).toHaveBeenCalled();
    });
});
