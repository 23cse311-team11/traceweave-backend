import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
  createWorkspace,
  getMyWorkspaces,
  getWorkspaceById,
  deleteWorkspace,
  updateWorkspace
} from '../controllers/workspace.controller.js';

const router = express.Router();

// Protect all workspace routes
router.use(authMiddleware);

router.post('/create', authMiddleware, createWorkspace);

router.get('/', authMiddleware, getMyWorkspaces);

router.get('/:workspaceId', authMiddleware, getWorkspaceById);

router.delete('/:workspaceId', authMiddleware, deleteWorkspace);

router.patch('/:workspaceId', authMiddleware, updateWorkspace);

export default router;
