import { jest } from '@jest/globals';

// Mocks
const mockPrisma = {
  workflow: {
    findUnique: jest.fn(),
  },
  requestDefinition: {
    findUnique: jest.fn(),
  },
};

const mockWorkflowLog = {
  create: jest.fn(),
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

jest.unstable_mockModule('../../src/models/workflow-log.model.js', () => ({
  default: mockWorkflowLog,
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
    const workspaceId = 'ws1';
    
    const workflow = {
      id: workflowId,
      workspaceId,
      steps: [
        { requestId: 'req1', stopOnFailure: true },
        { requestId: 'req2', stopOnFailure: true },
      ],
    };

    const req1 = { id: 'req1', name: 'Req 1', method: 'GET', url: 'http://example.com/1', collectionId: 'col1' };
    const req2 = { id: 'req2', name: 'Req 2', method: 'POST', url: 'http://example.com/2', collectionId: 'col1' };

    mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
    mockPrisma.requestDefinition.findUnique
      .mockResolvedValueOnce(req1)
      .mockResolvedValueOnce(req2);

    mockHttpRunner.executeHttpRequest.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {},
      size: 100,
      timings: { total: 50 },
      success: true,
    });

    mockExecutionLog.create.mockResolvedValue({ _id: 'exec_log_id' });
    mockWorkflowLog.create.mockResolvedValue({ id: 'wf_log_id', status: 'COMPLETED' });

    const result = await executeWorkflow(workflowId, userId);

    expect(mockPrisma.workflow.findUnique).toHaveBeenCalledWith({ where: { id: workflowId } });
    expect(mockHttpRunner.executeHttpRequest).toHaveBeenCalledTimes(2);
    expect(mockExecutionLog.create).toHaveBeenCalledTimes(2);
    expect(mockWorkflowLog.create).toHaveBeenCalledWith(expect.objectContaining({
      workflowId,
      status: 'COMPLETED',
      steps: expect.arrayContaining([
        expect.objectContaining({ requestId: 'req1', success: true }),
        expect.objectContaining({ requestId: 'req2', success: true }),
      ])
    }));
  });

  test('should stop on failure if configured', async () => {
    const workflowId = 'wf1';
    const userId = 'user1';
    
    const workflow = {
      id: workflowId,
      workspaceId: 'ws1',
      steps: [
        { requestId: 'req1', stopOnFailure: true },
        { requestId: 'req2', stopOnFailure: true },
      ],
    };

    const req1 = { id: 'req1', url: 'http://fail.com' };

    mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
    mockPrisma.requestDefinition.findUnique.mockResolvedValueOnce(req1);

    mockHttpRunner.executeHttpRequest.mockResolvedValue({
      status: 500,
      statusText: 'Error',
      timings: { total: 50 },
      success: false,
    });

    mockExecutionLog.create.mockResolvedValue({ _id: 'exec_log_id' });
    mockWorkflowLog.create.mockResolvedValue({ id: 'wf_log_id' });

    await executeWorkflow(workflowId, userId);

    expect(mockHttpRunner.executeHttpRequest).toHaveBeenCalledTimes(1); // Should break
    expect(mockWorkflowLog.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'FAILED'
    }));
  });

  test('should skip deleted requests', async () => {
    const workflowId = 'wf1';
    const userId = 'user1';
    
    const workflow = {
        id: workflowId,
        workspaceId: 'ws1',
        steps: [{ requestId: 'deleted_req', stopOnFailure: false }]
    };
    
    mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
    mockPrisma.requestDefinition.findUnique.mockResolvedValue(null);
    mockWorkflowLog.create.mockResolvedValue({});
    
    await executeWorkflow(workflowId, userId);
    
    expect(mockHttpRunner.executeHttpRequest).not.toHaveBeenCalled();
    expect(mockWorkflowLog.create).toHaveBeenCalledWith(expect.objectContaining({
        steps: expect.arrayContaining([
            expect.objectContaining({ requestId: 'deleted_req', success: false, status: 404 })
        ])
    }));
  });
});
