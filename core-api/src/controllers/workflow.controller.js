import prisma from '../config/prisma.js';
import { executeWorkflow } from '../services/workflow-runner.service.js';
import catchAsync from '../utils/catchAsync.js';
import { WorkflowEngine } from '../services/workflowEngine.js';
import ExecutionLog from '../models/execution.model.js';

export const workflowController = {
  // Create Workflow
  createWorkflow: catchAsync(async (req, res) => {
    const { workspaceId, name, description, flowData } = req.body;
    
    // Create workflow
    const workflow = await prisma.workflow.create({
      data: { 
        workspaceId, 
        name, 
        description,
        ...(flowData && { flowData })
      }
    });
    res.status(201).json(workflow);
  }),

  // Get All in Workspace
  getWorkflows: catchAsync(async (req, res) => {
    const { workspaceId } = req.params;
    const workflows = await prisma.workflow.findMany({
      where: { workspaceId, deletedAt: null },
      include: {
        // Fetch only the single most recent execution
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        }
      }
    });
    res.json(workflows);
  }),

  // Get Single
  getWorkflowById: catchAsync(async (req, res) => {
    const { workflowId } = req.params;
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId }
    });
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json(workflow);
  }),

  // Update
  updateWorkflow: catchAsync(async (req, res) => {
    const { workflowId } = req.params;
    const { ...updateData } = req.body;
    
    const workflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: updateData
    });
    res.json(workflow);
  }),

  // RUN WORKFLOW
  runWorkflow: catchAsync(async (req, res) => {
    const { workflowId } = req.params;
    const userId = req.user.id;
    
    const result = await executeWorkflow(workflowId, userId);
    
    res.status(200).json({
      message: 'Workflow execution completed',
      report: result
    });
  }),

  // Get Workflow History
  getWorkflowHistory: catchAsync(async (req, res) => {
    const { workflowId } = req.params;
    // Use Postgres WorkflowExecution instead of Mongo WorkflowLog
    const executions = await prisma.workflowExecution.findMany({
        where: { workflowId },
        orderBy: { startedAt: 'desc' },
        take: 20,
        include: { triggeredBy: true }
    });
    res.json(executions);
  }),

  // RUN CANVAS WORKFLOW (Interactive from Frontend Builder)
  runCanvasWorkflow: catchAsync(async (req, res) => {
    const { workflow, clientId, environmentValues = {}, workflowId } = req.body;

    const wss = req.app.get('wss');
    let clientSocket = null;
    if (wss && clientId) {
        for (const client of wss.clients) {
            if (client.clientId === clientId) {
                clientSocket = client;
                break;
            }
        }
    }

    // 1. Create a PENDING execution record immediately
    let execution = null;
    if (workflowId) {
        execution = await prisma.workflowExecution.create({
            data: {
                workflowId,
                triggeredById: req.user?.id || null, // req.user may be null (no auth on this route)
                status: 'RUNNING',
                startedAt: new Date(),
            }
        });
    }

    const emitEvent = (eventData) => {
        if (clientSocket && clientSocket.readyState === 1) {
            clientSocket.send(JSON.stringify(eventData));
        }
    };

    const engine = new WorkflowEngine(workflow, { variables: environmentValues }, emitEvent);

    // 2. Run async, then update DB when done
    engine.run()
        .then(async (finalContext) => {
            if (execution) {
                await prisma.workflowExecution.update({
                    where: { id: execution.id },
                    data: {
                        status: 'SUCCESS',
                        completedAt: new Date(),
                        contextData: {
                            variables: finalContext.variables,
                            responses: finalContext.responses,
                        },
                        executionLogs: finalContext.logs,
                    }
                });
            }
        })
        .catch(async (err) => {
            emitEvent({ type: 'workflow-error', error: err.message });
            if (execution) {
                await prisma.workflowExecution.update({
                    where: { id: execution.id },
                    data: {
                        status: 'FAILED',
                        completedAt: new Date(),
                        executionLogs: [err.message],
                    }
                });
            }
        });

    res.status(202).json({ message: 'Canvas Workflow Execution Started', executionId: execution?.id || null });
})
};