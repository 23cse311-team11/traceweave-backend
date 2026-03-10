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
  workflowExecution: {
    findMany: jest.fn(),
  },
};

const mockWorkflowRunner = {
  executeWorkflow: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/services/workflow-runner.service.js', () => ({
  executeWorkflow: mockWorkflowRunner.executeWorkflow,
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
        test('should create workflow with nested steps', async () => {
            req.body = { workspaceId: 'ws1', name: 'WF 1', steps: [], description: 'desc' };
            const workflow = { id: 'wf1', workspaceId: 'ws1', name: 'WF 1', description: 'desc', steps: [] };
            mockPrisma.workflow.create.mockResolvedValue(workflow);

            await workflowController.createWorkflow(req, res, next);

            expect(mockPrisma.workflow.create).toHaveBeenCalledWith({
                data: {
                    workspaceId: 'ws1',
                    name: 'WF 1',
                    description: 'desc',
                    steps: { create: [] },
                },
                include: { steps: true },
            });
            expect(res.statusCode).toBe(201);
            expect(res._getJSONData()).toEqual(workflow);
        });
    });

    describe('getWorkflows', () => {
        test('should return workflows with steps included', async () => {
            req.params = { workspaceId: 'ws1' };
            const workflows = [{ id: 'wf1', steps: [] }];
            mockPrisma.workflow.findMany.mockResolvedValue(workflows);

            await workflowController.getWorkflows(req, res, next);

            expect(mockPrisma.workflow.findMany).toHaveBeenCalledWith({
                where: { workspaceId: 'ws1', deletedAt: null },
                include: { steps: true },
            });
            expect(res.statusCode).toBe(200);
            expect(res._getJSONData()).toEqual(workflows);
        });
    });

    describe('getWorkflowById', () => {
        test('should return workflow', async () => {
            req.params = { workflowId: 'wf1' };
            const workflow = { id: 'wf1', steps: [] };
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
            const report = { executionId: 'exec1', status: 'SUCCESS' };
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
        test('should return workflow executions from Postgres', async () => {
            req.params = { workflowId: 'wf1' };
            const executions = [{ id: 'exec1', status: 'SUCCESS' }];
            mockPrisma.workflowExecution.findMany.mockResolvedValue(executions);

            await workflowController.getWorkflowHistory(req, res, next);

            expect(mockPrisma.workflowExecution.findMany).toHaveBeenCalledWith({
                where: { workflowId: 'wf1' },
                orderBy: { startedAt: 'desc' },
                take: 20,
                include: { triggeredBy: true },
            });
            expect(res.statusCode).toBe(200);
            expect(res._getJSONData()).toEqual(executions);
        });
    });
});
