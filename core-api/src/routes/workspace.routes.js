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
  updateMemberRole,
  getWorkspaceHistory,
  getGlobalHistory,
  getGlobalStats,
  createWorkspaceInvite,
  getPendingInvites,
  acceptWorkspaceInvite,
  toggleCommonLink,
  resetCommonLink,
  duplicateWorkspace,
  toggleFavorite
} from '../controllers/workspace.controller.js';

import {
  createEnvironment,
  getGlobalEnvironments,
  getWorkspaceEnvironments
} from '../controllers/environment.controller.js';

import { requireWorkspaceRole } from '../middlewares/rbac.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/create', createWorkspace);
router.get('/', getMyWorkspaces);

router.get('/user/global-history', getGlobalHistory); 
router.get('/user/global-stats', getGlobalStats);
router.get('/user/global-environments', getGlobalEnvironments);

router.post('/invites/accept', acceptWorkspaceInvite);

router.get('/:workspaceId', requireWorkspaceRole('VIEWER'), getWorkspaceById);
router.delete('/:workspaceId', requireWorkspaceRole('OWNER'), deleteWorkspace);
router.patch('/:workspaceId', requireWorkspaceRole('EDITOR'), updateWorkspace);
router.patch('/:workspaceId/favorite', requireWorkspaceRole('VIEWER'), toggleFavorite);
router.post('/:workspaceId/duplicate', requireWorkspaceRole('VIEWER'), duplicateWorkspace);
router.post('/:workspaceId/members', requireWorkspaceRole('OWNER'), addMemberToWorkspace);
router.delete('/:workspaceId/members/:userId', requireWorkspaceRole('OWNER'), removeMemberFromWorkspace);
router.patch('/:workspaceId/members/:userId', requireWorkspaceRole('OWNER'), updateMemberRole);
router.get('/:workspaceId/history', requireWorkspaceRole('VIEWER'), getWorkspaceHistory);
router.post('/:workspaceId/environments', requireWorkspaceRole('EDITOR'), createEnvironment);
router.get('/:workspaceId/environments', requireWorkspaceRole('VIEWER'), getWorkspaceEnvironments);

router.post('/:workspaceId/invites', requireWorkspaceRole('OWNER'), createWorkspaceInvite);
router.get('/:workspaceId/invites', requireWorkspaceRole('EDITOR'), getPendingInvites);
router.patch('/:workspaceId/invites/link/toggle', requireWorkspaceRole('OWNER'), toggleCommonLink);
router.post('/:workspaceId/invites/link/reset', requireWorkspaceRole('OWNER'), resetCommonLink);

export default router;