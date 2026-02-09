import prisma from '../config/prisma.js';
import WorkflowLog from '../models/workflow-log.model.js';
import ExecutionLog from '../models/execution.model.js';
import { executeHttpRequest } from './http-runner.service.js';
// import { substituteVariables } from '../utils/template.utils.js';

export const executeWorkflow = async (workflowId, userId, runtimeVariables = {}) => {
  // 1. Fetch Workflow Definition
  console.log("Entered executeWorkflow with:", { workflowId, userId, runtimeVariables });
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow) throw new Error('Workflow not found');

  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const logSteps = [];
  let isSuccess = true;
  const startTime = Date.now();

  // 2. Iterate Steps
  for (const [index, step] of steps.entries()) {
    const { requestId, stopOnFailure } = step;

    // A. Fetch the Request Definition
    const requestDef = await prisma.requestDefinition.findUnique({
      where: { id: requestId, deletedAt: null },
      include: { collection: true } // Need this for workspaceId context if needed
    });

    // console.log('Executing Step:', index, 'Request ID:', requestId);
    console.log('Request Definition:', requestDef);

    if (!requestDef) {
      logSteps.push({
        stepId: index,
        requestId,
        requestName: 'Unknown (Deleted)',
        status: 404,
        success: false,
        executionTime: 0
      });
      if (stopOnFailure) { isSuccess = false; break; }
      continue;
    }

    // B. Prepare Config (Merge with any future context variables)
    // For Sprint 1, we just use the static definition
    let config = {
      method: requestDef.method,
      url: requestDef.url,
      headers: requestDef.headers,
      body: requestDef.body,
      params: requestDef.params
    };

    // C. Execute (Reuse our HTTP Runner)
    const result = await executeHttpRequest(config);

    // D. Log Individual Request (The Detailed Log)
    const executionLog = await ExecutionLog.create({
      requestId: requestDef.id,
      collectionId: requestDef.collectionId,
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
      // Metadata to link back to parent workflow
      meta: { workflowLogId: null }
    });

    // E. Add to Summary
    logSteps.push({
      stepId: index,
      requestId: requestDef.id,
      requestName: requestDef.name,
      status: result.status,
      executionTime: result.timings.total,
      timings: result.timings, // Added to allow frontend to check for 'Live' data
      success: result.success || (result.status >= 200 && result.status < 300),
      historyId: executionLog._id.toString()
    });

    // F. Handle Stop on Failure
    if (stopOnFailure && !(result.status >= 200 && result.status < 300)) {
      isSuccess = false;
      break;
    }

    // Optional: Implement Delay here if step.delay exists
  }

  const endTime = Date.now();

  // 3. Create Master Workflow Log
  const workflowLog = await WorkflowLog.create({
    workflowId: workflow.id,
    workspaceId: workflow.workspaceId,
    executedBy: userId,
    status: isSuccess ? 'COMPLETED' : 'FAILED',
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    totalDuration: endTime - startTime,
    steps: logSteps
  });

  return workflowLog;
};