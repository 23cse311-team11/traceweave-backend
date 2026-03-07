import prisma from '../config/prisma.js';
import { executeWorkflow } from '../services/workflow-runner.service.js';
import catchAsync from '../utils/catchAsync.js';

export const workflowController = {
  // Create Workflow
  createWorkflow: catchAsync(async (req, res) => {
    const { workspaceId, name, steps, description } = req.body; // steps is array of { requestId, order, stopOnFailure }
    
    // Create workflow with related steps
    const workflow = await prisma.workflow.create({
      data: { 
        workspaceId, 
        name, 
        description,
        steps: {
            create: steps.map((step, index) => ({
                requestId: step.requestId,
                order: step.order ?? index,
                stopOnFailure: step.stopOnFailure ?? true
            }))
        }
      },
      include: {
          steps: true
      }
    });
    res.status(201).json(workflow);
  }),

  // Get All in Workspace
  getWorkflows: catchAsync(async (req, res) => {
    const { workspaceId } = req.params;
    const workflows = await prisma.workflow.findMany({
      where: { workspaceId, deletedAt: null },
      include: { steps: true }
    });
    res.json(workflows);
  }),

  // Get Single
  getWorkflowById: catchAsync(async (req, res) => {
    const { workflowId } = req.params;
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { steps: { include: { request: true }, orderBy: { order: 'asc' } } }
    });
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json(workflow);
  }),

  // Update
  updateWorkflow: catchAsync(async (req, res) => {
    const { workflowId } = req.params;
    const { steps, ...otherData } = req.body;
    
    // Build update data
    const updateData = { ...otherData };
    
    if (steps) {
        updateData.steps = {
            deleteMany: {}, // Remove existing steps
            create: steps.map((step, index) => ({
                requestId: step.requestId,
                order: step.order ?? index,
                stopOnFailure: step.stopOnFailure ?? true
            }))
        };
    }

    const workflow = await prisma.workflow.update({
      where: { id: workflowId },
      data: updateData,
      include: { steps: true }
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
  })
};