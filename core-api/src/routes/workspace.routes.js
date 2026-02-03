import express from 'express';
import auth from '../middlewares/auth.js';
import {
  createWorkspace,
  getMyWorkspaces,
  getWorkspaceById
} from '../controllers/workspace.controller.js';

const router = express.Router();

router.post('/', auth, createWorkspace);

router.get('/', auth, getMyWorkspaces);

router.get('/:workspaceId', auth, getWorkspaceById);

export default router;
