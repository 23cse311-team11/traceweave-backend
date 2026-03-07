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
    
    const req1 = { id: 'req1', method: 'GET', url: 'http://example.com/1', collectionId: 'col1' };
    const req2 = { id: 'req2', method: 'POST', url: 'http://example.com/2', collectionId: 'col1' };

    const workflow = {
      id: workflowId,
      workspaceId: 'ws1',
      steps: [
        { id: 's1', order: 1, stopOnFailure: true, request: req1 },
        { id: 's2', order: 2, stopOnFailure: true, request: req2 },
      ],
    };

    mockPrisma.workflowExecution.create.mockResolvedValue({ id: 'exec_id' });
    mockPrisma.workflow.findUnique.mockResolvedValue(workflow);

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
    mockPrisma.workflowExecution.update.mockResolvedValue({ id: 'exec_id', status: 'SUCCESS' });

    const result = await executeWorkflow(workflowId, userId);

    expect(mockPrisma.workflowExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workflowId, triggeredById: userId, status: 'RUNNING' })
    });
    expect(mockPrisma.workflow.findUnique).toHaveBeenCalledWith({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: 'asc' }, include: { request: true } } }
    });
    expect(mockHttpRunner.executeHttpRequest).toHaveBeenCalledTimes(2);
    expect(mockExecutionLog.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'exec_id' },
      data: expect.objectContaining({ status: 'SUCCESS' })
    }));
    expect(result.status).toBe('SUCCESS');
  });

  test('should stop on failure if configured', async () => {
    const workflowId = 'wf1';
    const userId = 'user1';
    
    const req1 = { id: 'req1', url: 'http://fail.com' };
    const req2 = { id: 'req2', url: 'http://never-reached.com' };

    const workflow = {
      id: workflowId,
      workspaceId: 'ws1',
      steps: [
        { id: 's1', stopOnFailure: true, request: req1 },
        { id: 's2', stopOnFailure: true, request: req2 },
      ],
    };

    mockPrisma.workflowExecution.create.mockResolvedValue({ id: 'exec_id' });
    mockPrisma.workflow.findUnique.mockResolvedValue(workflow);

    // Simulate an HTTP failure (e.g., 500 error)
    mockHttpRunner.executeHttpRequest.mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      data: {},
      size: 0,
      timings: { total: 50 },
      success: false,
    });

    mockExecutionLog.create.mockResolvedValue({ _id: 'exec_log_id' });
    mockPrisma.workflowExecution.update.mockResolvedValue({ id: 'exec_id', status: 'FAILED' });

    const result = await executeWorkflow(workflowId, userId);

    expect(mockHttpRunner.executeHttpRequest).toHaveBeenCalledTimes(1); // Should break after first failure
    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'exec_id' },
      data: expect.objectContaining({ status: 'FAILED' })
    }));
    expect(result.status).toBe('FAILED');
  });

  test('should skip deleted requests', async () => {
    const workflowId = 'wf1';
    const userId = 'user1';
    
    const workflow = {
        id: workflowId,
        workspaceId: 'ws1',
        // Request is missing/deleted
        steps: [{ id: 's1', stopOnFailure: false, request: null }]
    };
    
    mockPrisma.workflowExecution.create.mockResolvedValue({ id: 'exec_id' });
    mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
    mockPrisma.workflowExecution.update.mockResolvedValue({ id: 'exec_id', status: 'SUCCESS' });
    
    const result = await executeWorkflow(workflowId, userId);
    
    expect(mockHttpRunner.executeHttpRequest).not.toHaveBeenCalled();
    expect(mockExecutionLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'exec_id' },
      data: expect.objectContaining({ status: 'SUCCESS' })
    }));
    expect(result.status).toBe('SUCCESS');
  });
});