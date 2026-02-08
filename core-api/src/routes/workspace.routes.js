import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
  createWorkspace,
  getMyWorkspaces,
  getWorkspaceById,
  deleteWorkspace,
  updateWorkspace,
  addMemberToWorkspace,
  removeMemberFromWorkspace,
  updateMemberRole
} from '../controllers/workspace.controller.js';

import {
  createEnvironment,
  getWorkspaceEnvironments
} from '../controllers/environment.controller.js';

import { requireWorkspaceRole } from '../middlewares/rbac.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/create', createWorkspace);

router.get('/', getMyWorkspaces);

router.get('/:workspaceId', requireWorkspaceRole('VIEWER'), getWorkspaceById);

router.delete('/:workspaceId', requireWorkspaceRole('OWNER'), deleteWorkspace);

router.patch('/:workspaceId', requireWorkspaceRole('EDITOR'), updateWorkspace);

router.post('/:workspaceId/members', requireWorkspaceRole('OWNER'), addMemberToWorkspace);

router.delete(
  '/:workspaceId/members/:userId',
  requireWorkspaceRole('OWNER'),
  removeMemberFromWorkspace
);

router.patch(
  '/:workspaceId/members/:userId',
  requireWorkspaceRole('OWNER'),
  updateMemberRole
);

router.post('/:workspaceId/environments', requireWorkspaceRole('EDITOR'), createEnvironment);
router.get('/:workspaceId/environments', requireWorkspaceRole('VIEWER'), getWorkspaceEnvironments);

export default router;

