import prisma from '../config/prisma.js';
import ExecutionLog from '../models/execution.model.js';
import { WorkflowEngine } from './workflowEngine.js';

export const executeWorkflow = async (workflowId, userId, environmentId = null) => {
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
      // 2. Fetch Workflow Definition
      const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId }
      });

      if (!workflow) throw new Error('Workflow not found');

      // 3. Fetch Environment Variables if requested
      const variablesMap = {};
      if (environmentId) {
          const envVars = await prisma.environmentVariable.findMany({
              where: { environmentId }
          });
          envVars.forEach(v => {
              if (v.key) variablesMap[v.key] = v.value;
          });
      }

      // 4. Extract and Hydrate Flow Data
      let flowData = typeof workflow.flowData === 'string' 
            ? JSON.parse(workflow.flowData) 
            : workflow.flowData;

      if (!flowData || !flowData.nodes) {
          throw new Error('Workflow graphic data is invalid or empty');
      }

      // Find all request nodes to fetch their actual configurations from DB
      const requestNodeIds = flowData.nodes
          .filter(n => n.type === 'requestNode' && n.data?.requestId)
          .map(n => n.data.requestId);

      if (requestNodeIds.length > 0) {
          const requestDefs = await prisma.requestDefinition.findMany({
              where: { id: { in: requestNodeIds } }
          });

          const reqMap = new Map();
          requestDefs.forEach(req => reqMap.set(req.id, req));

          flowData.nodes = flowData.nodes.map(node => {
              if (node.type === 'requestNode' && node.data?.requestId) {
                  const def = reqMap.get(node.data.requestId);
                  if (def) {
                      return {
                          ...node,
                          data: {
                              ...node.data,
                              requestConfig: typeof def.config === 'string' ? JSON.parse(def.config) : def.config
                          }
                      };
                  }
              }
              return node;
          });
      }

      // 5. Run the Engine!
      const engine = new WorkflowEngine(flowData, { variables: variablesMap });
      const context = await engine.run();

      // Check if any errors occurred during execution
      const isSuccess = !context.logs.some(log => log.startsWith('Error'));
      const finalStatus = isSuccess ? 'SUCCESS' : 'FAILED';

      // 6. Optional: Sync individual node responses to MongoDB ExecutionLog 
      // This allows the user to see the waterfall of requests just like normal single requests
      try {
          const responseKeys = Object.keys(context.responses || {});
          for (const nodeId of responseKeys) {
             const nodeData = flowData.nodes.find(n => n.id === nodeId);
             const result = context.responses[nodeId];
             
             if (nodeData && nodeData.data?.requestId) {
                 await ExecutionLog.create({
                    requestId: nodeData.data.requestId,
                    workspaceId: workflow.workspaceId,
                    method: result.method || 'GET', // Derived from node data if we wanted
                    url: result.url || 'Workflow Interpolated', 
                    status: result.status,
                    statusText: result.statusText || 'OK',
                    responseHeaders: result.headers,
                    responseBody: result.body,
                    responseSize: result.size || 0,
                    timings: { total: result.time || 0 },
                    executedBy: userId,
                    workflowExecutionId: execution.id,
                 });
             }
          }
      } catch (logErr) {
          console.error("Failed to sync workflow node logs to internal DB:", logErr);
      }

      // 7. Update Workflow Execution Status
      await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: {
              status: finalStatus,
              contextData: context.responses || {},
              executionLogs: context.logs || [],
              completedAt: new Date()
          }
      });

      return { executionId: execution.id, status: finalStatus, report: context };

  } catch (error) {
      console.error("Workflow Execution Failed:", error);
      await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: {
              status: 'FAILED',
              executionLogs: [error.message],
              completedAt: new Date()
          }
      });
      throw error;
  }
};
