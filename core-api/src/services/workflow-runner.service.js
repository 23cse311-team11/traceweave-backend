import prisma from '../config/prisma.js';
import ExecutionLog from '../models/execution.model.js';
import { executeHttpRequest } from './http-runner.service.js';

export const executeWorkflow = async (workflowId, userId, runtimeVariables = {}) => {
  // 1. Create Workflow Execution Record (PENDING)
  const execution = await prisma.workflowExecution.create({
      data: {
          workflowId,
          triggeredById: userId,
          status: 'RUNNING',
          startedAt: new Date()
      }
  });

  try {
      // 2. Fetch Workflow Definition with Steps and Requests
      const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
        include: {
            steps: {
                orderBy: { order: 'asc' },
                include: { request: true }
            }
        }
      });

      if (!workflow) throw new Error('Workflow not found');

      const steps = workflow.steps || [];
      let isSuccess = true;

      // 3. Iterate Steps
      for (const step of steps) {
        const { request, stopOnFailure } = step;

        if (!request) {
            // Log missing request error?
            console.error(`Step ${step.id} has no request definition`);
            if (stopOnFailure) { isSuccess = false; break; }
            continue;
        }

        // Prepare Config
        const requestConfig = request.config || {};
        let config = {
          method: requestConfig.method || request.method || 'GET', 
          url: requestConfig.url || request.url || '',
          headers: requestConfig.headers || request.headers || {},
          body: requestConfig.body || request.body || null,
          params: requestConfig.params || request.params || {}
        };

        // Execute Request
        let result;
        try {
            result = await executeHttpRequest(config);
        } catch (err) {
            result = {
                status: 0,
                statusText: 'Execution Error',
                headers: {},
                data: err.message,
                size: 0,
                timings: { total: 0 }
            };
        }

        // Log Individual Request Results
        // Note: ExecutionLog is Mongoose model
        await ExecutionLog.create({
          requestId: request.id,
          collectionId: request.collectionId,
          workspaceId: workflow.workspaceId,
          method: config.method,
          url: config.url,
          status: result.status,
          statusText: result.statusText,
          responseHeaders: result.headers,
          responseBody: result.data, 
          responseSize: result.size,
          timings: result.timings,
          executedBy: userId,
          // Link to parent execution
          workflowExecutionId: execution.id,
          stepId: step.id,
          stepOrder: step.order
        });

        // Handle Stop on Failure
        if (stopOnFailure && !(result.status >= 200 && result.status < 300)) {
          isSuccess = false;
          break;
        }
      }

      // 4. Update Workflow Execution Status
      const finalStatus = isSuccess ? 'SUCCESS' : 'FAILED';
      await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: {
              status: finalStatus,
              completedAt: new Date()
          }
      });

      return { executionId: execution.id, status: finalStatus };

  } catch (error) {
      console.error("Workflow Execution Failed:", error);
      // Mark as failed if execution logic crashes
      await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: {
              status: 'FAILED',
              completedAt: new Date()
          }
      });
      throw error;
  }
};
