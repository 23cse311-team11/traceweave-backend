import { jest } from '@jest/globals';

// Mocks — match the actual workflow-runner.service.js source
const mockPrisma = {
  workflowExecution: {
    create: jest.fn(),
    update: jest.fn(),
  },
  workflow: {
    findUnique: jest.fn(),
  },
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
  const workflowId = 'wf1';
  const userId = 'user1';
  const executionRecord = { id: 'exec1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.workflowExecution.create.mockResolvedValue(executionRecord);
    mockPrisma.workflowExecution.update.mockResolvedValue({});
    mockExecutionLog.create.mockResolvedValue({ _id: 'log1' });
  });

  test('should create execution record and return SUCCESS when all steps pass', async () => {
    const workflow = {
      id: workflowId,
      workspaceId: 'ws1',
      steps: [
        {
          id: 'step1',
          order: 0,
          stopOnFailure: true,
          request: { id: 'req1', collectionId: 'col1', method: 'GET', url: 'http://example.com' },
        },
      ],
    };

    mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
    mockHttpRunner.executeHttpRequest.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: { ok: true },
      size: 50,
      timings: { total: 30 },
      success: true,
    });

    const result = await executeWorkflow(workflowId, userId);

    expect(mockPrisma.workflowExecution.create).toHaveBeenCalledWith({
      data: {
        workflowId,
        triggeredById: userId,
        status: 'RUNNING',
        startedAt: expect.any(Date),
      },
    });
    expect(mockPrisma.workflow.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: workflowId } })
    );
    expect(mockHttpRunner.executeHttpRequest).toHaveBeenCalledTimes(1);
    expect(mockExecutionLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith({
      where: { id: 'exec1' },
      data: { status: 'SUCCESS', completedAt: expect.any(Date) },
    });
    expect(result).toEqual({ executionId: 'exec1', status: 'SUCCESS' });
  });

  test('should stop on failure and mark execution as FAILED', async () => {
    const workflow = {
      id: workflowId,
      workspaceId: 'ws1',
      steps: [
        {
          id: 'step1',
          order: 0,
          stopOnFailure: true,
          request: { id: 'req1', collectionId: 'col1', method: 'GET', url: 'http://fail.com' },
        },
        {
          id: 'step2',
          order: 1,
          stopOnFailure: true,
          request: { id: 'req2', collectionId: 'col1', method: 'GET', url: 'http://ok.com' },
        },
      ],
    };

    mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
    mockHttpRunner.executeHttpRequest.mockResolvedValue({
      status: 500,
      statusText: 'Server Error',
      headers: {},
      data: null,
      size: 0,
      timings: { total: 20 },
      success: false,
    });

    const result = await executeWorkflow(workflowId, userId);

    // Should stop after first step failure
    expect(mockHttpRunner.executeHttpRequest).toHaveBeenCalledTimes(1);
    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith({
      where: { id: 'exec1' },
      data: { status: 'FAILED', completedAt: expect.any(Date) },
    });
    expect(result).toEqual({ executionId: 'exec1', status: 'FAILED' });
  });

  test('should skip steps with missing request and continue when stopOnFailure is false', async () => {
    const workflow = {
      id: workflowId,
      workspaceId: 'ws1',
      steps: [
        { id: 'step1', order: 0, stopOnFailure: false, request: null }, // no request
        {
          id: 'step2',
          order: 1,
          stopOnFailure: false,
          request: { id: 'req2', collectionId: 'col1', method: 'GET', url: 'http://ok.com' },
        },
      ],
    };

    mockPrisma.workflow.findUnique.mockResolvedValue(workflow);
    mockHttpRunner.executeHttpRequest.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {},
      size: 10,
      timings: { total: 5 },
      success: true,
    });

    await executeWorkflow(workflowId, userId);

    // First step has no request, skipped. Second step executed.
    expect(mockHttpRunner.executeHttpRequest).toHaveBeenCalledTimes(1);
    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith({
      where: { id: 'exec1' },
      data: { status: 'SUCCESS', completedAt: expect.any(Date) },
    });
  });

  test('should mark FAILED and rethrow if workflow not found', async () => {
    mockPrisma.workflow.findUnique.mockResolvedValue(null);

    await expect(executeWorkflow(workflowId, userId)).rejects.toThrow('Workflow not found');

    expect(mockPrisma.workflowExecution.update).toHaveBeenCalledWith({
      where: { id: 'exec1' },
      data: { status: 'FAILED', completedAt: expect.any(Date) },
    });
  });
});
