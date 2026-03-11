import express from 'express';
import { workflowController } from '../controllers/workflow.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import { requireWorkspaceRole } from '../middlewares/rbac.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Create (Editor+)
router.post('/', requireWorkspaceRole('EDITOR'), workflowController.createWorkflow);

// Get All (Viewer+)
router.get('/workspace/:workspaceId', requireWorkspaceRole('VIEWER'), workflowController.getWorkflows);

// Get Single (Viewer+)
router.get('/:workflowId', requireWorkspaceRole('VIEWER'), workflowController.getWorkflowById);

// Update (Editor+)
router.patch('/:workflowId', requireWorkspaceRole('EDITOR'), workflowController.updateWorkflow);

// Run (Editor+) - Running consumes resources/changes state
router.post('/:workflowId/run', requireWorkspaceRole('EDITOR'), workflowController.runWorkflow);

// Run Canvas Workflow
router.post('/run-canvas', workflowController.runCanvasWorkflow);

// History (Viewer+)
router.get('/:workflowId/history', requireWorkspaceRole('VIEWER'), workflowController.getWorkflowHistory);

export default router;