import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
  createWorkspace,
  getMyWorkspaces,
  getWorkspaceById
} from '../controllers/workspace.controller.js';

const router = express.Router();

router.post('/', authMiddleware, createWorkspace);

router.get('/', auth, getMyWorkspaces);

router.get('/:workspaceId', auth, getWorkspaceById);

export default router;
