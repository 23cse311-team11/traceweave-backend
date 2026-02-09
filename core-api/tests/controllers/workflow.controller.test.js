import { jest } from '@jest/globals';
import httpMocks from 'node-mocks-http';

// Mocks
const mockPrisma = {
  workflow: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockWorkflowRunner = {
  executeWorkflow: jest.fn(),
};

const mockWorkflowLog = {
  find: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/services/workflow-runner.service.js', () => ({
  executeWorkflow: mockWorkflowRunner.executeWorkflow,
}));

jest.unstable_mockModule('../../src/models/workflow-log.model.js', () => ({
  default: mockWorkflowLog,
}));

// Import controller after mocking
const { workflowController } = await import('../../src/controllers/workflow.controller.js');

describe('Workflow Controller', () => {
    let req, res, next;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        next = jest.fn();
        req.user = { id: 'user1' };
        jest.clearAllMocks();
    });

    describe('createWorkflow', () => {
        test('should create workflow', async () => {
            req.body = { workspaceId: 'ws1', name: 'WF 1', steps: [] };
            const workflow = { id: 'wf1', ...req.body };
            mockPrisma.workflow.create.mockResolvedValue(workflow);

            await workflowController.createWorkflow(req, res, next);

            expect(mockPrisma.workflow.create).toHaveBeenCalledWith({
                data: req.body
            });
            expect(res.statusCode).toBe(201);
            expect(res._getJSONData()).toEqual(workflow);
        });
    });

    describe('getWorkflows', () => {
        test('should return workflows', async () => {
            req.params = { workspaceId: 'ws1' };
            const workflows = [{ id: 'wf1' }];
            mockPrisma.workflow.findMany.mockResolvedValue(workflows);

            await workflowController.getWorkflows(req, res, next);

            expect(mockPrisma.workflow.findMany).toHaveBeenCalledWith({
                where: { workspaceId: 'ws1', deletedAt: null }
            });
            expect(res.statusCode).toBe(200);
            expect(res._getJSONData()).toEqual(workflows);
        });
    });

    describe('getWorkflowById', () => {
        test('should return workflow', async () => {
            req.params = { workflowId: 'wf1' };
            const workflow = { id: 'wf1' };
            mockPrisma.workflow.findUnique.mockResolvedValue(workflow);

            await workflowController.getWorkflowById(req, res, next);

            expect(res.statusCode).toBe(200);
            expect(res._getJSONData()).toEqual(workflow);
        });

        test('should return 404 if not found', async () => {
             req.params = { workflowId: 'wf1' };
             mockPrisma.workflow.findUnique.mockResolvedValue(null);

             await workflowController.getWorkflowById(req, res, next);

             expect(res.statusCode).toBe(404);
        });
    });

    describe('runWorkflow', () => {
        test('should execute workflow', async () => {
            req.params = { workflowId: 'wf1' };
            const report = { status: 'COMPLETED' };
            mockWorkflowRunner.executeWorkflow.mockResolvedValue(report);

            await workflowController.runWorkflow(req, res, next);

            expect(mockWorkflowRunner.executeWorkflow).toHaveBeenCalledWith('wf1', 'user1');
            expect(res.statusCode).toBe(200);
            expect(res._getJSONData()).toEqual({
                message: 'Workflow execution completed',
                report,
            });
        });
    });

    describe('getWorkflowHistory', () => {
        test('should return history', async () => {
            req.params = { workflowId: 'wf1' };
            const logs = [{ id: 'log1' }];
            
            const mockFind = {
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(logs),
            };
            mockWorkflowLog.find.mockReturnValue(mockFind);

            await workflowController.getWorkflowHistory(req, res, next);

            expect(mockWorkflowLog.find).toHaveBeenCalledWith({ workflowId: 'wf1' });
            expect(res.statusCode).toBe(200);
            expect(res._getJSONData()).toEqual(logs);
        });
    });
});
