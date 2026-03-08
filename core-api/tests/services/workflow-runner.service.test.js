import { jest } from '@jest/globals';

// Mocks
const mockPrisma = {
  workflow: {
    findUnique: jest.fn(),
  },
  workflowExecution: {
    create: jest.fn(),
    update: jest.fn(),
  }
};

const mockExecutionLog = {
  create: jest.fn(),
};

const mockHttpRunner = {
  executeHttpRequest: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/models/execution.model.js', () => ({
  default: mockExecutionLog,
}));

jest.unstable_mockModule('../../src/services/http-runner.service.js', () => ({
  executeHttpRequest: mockHttpRunner.executeHttpRequest,
}));

// Import service after mocking
const { executeWorkflow } = await import('../../src/services/workflow-runner.service.js');

describe('Workflow Runner Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should execute workflow successfully', async () => {
        const workflowId = 'wf1';
        const userId = 'user1';
        
        // Mock data matching the new node-based structure
        const workflow = {
            id: workflowId,
            workspaceId: 'ws1',
            flowData: {
                nodes: [
            { id: 'start1', type: 'startNode', data: {} },
            { id: 'node1', type: 'requestNode', data: { requestId: 'req1' } },
            { id: 'end1', type: 'endNode', data: {} }
                ],
          edges: [
            { source: 'start1', target: 'node1' },
            { source: 'node1', target: 'end1' }
          ]
            }
        };

        const reqDef1 = { id: 'req1', config: { method: 'GET', url: 'http://api.com/1' } };

        mockPrisma.workflowExecution.create.mockResolvedValue({ id: 'exec_id' });
        mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
        // Mock the findMany for request definitions inside the service
        mockPrisma.requestDefinition = { findMany: jest.fn().mockResolvedValue([reqDef1]) };
        mockHttpRunner.executeHttpRequest.mockResolvedValue({
          status: 200,
          data: { ok: true },
          headers: {},
          timings: { total: 10 },
        });

        // Mock Engine run
        // Note: Since WorkflowEngine is a class, we need to mock its prototype or the module
        // For simplicity in this fix, we ensure the service can reach the engine run
        
        mockPrisma.workflowExecution.update.mockResolvedValue({ id: 'exec_id', status: 'SUCCESS' });

        const result = await executeWorkflow(workflowId, userId);

        expect(mockPrisma.workflowExecution.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'RUNNING' })
        }));
        
        // Expect findUnique without the old 'steps' include
        expect(mockPrisma.workflow.findUnique).toHaveBeenCalledWith({
            where: { id: workflowId }
        });
        
        expect(result.status).toBe('SUCCESS');
    });

    test('should handle empty workflow data', async () => {
        const workflowId = 'wf1';
      const workflow = { id: workflowId, flowData: { nodes: [] } }; // Empty nodes
        
        mockPrisma.workflowExecution.create.mockResolvedValue({ id: 'exec_id' });
        mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
        mockPrisma.workflowExecution.update.mockResolvedValue({});

        await expect(executeWorkflow(workflowId, 'u1')).rejects.toThrow('No start node found in workflow');
    });
});