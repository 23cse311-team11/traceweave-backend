import express from 'express';
import { requestController } from '../controllers/request.controller.js';
import authenticateUser from '../middlewares/auth.middleware.js';
import { requireWorkspaceRole } from '../middlewares/rbac.middleware.js';

const router = express.Router();

router.use(authenticateUser);

router.post('/execute', requireWorkspaceRole('EDITOR'), requestController.executeAdHocRequest);

router.post('/:collectionId', requireWorkspaceRole('EDITOR'), requestController.createRequest);

router.get('/collection/:collectionId', requireWorkspaceRole('VIEWER'), requestController.getRequestsByCollection);

router.patch('/:requestId', requireWorkspaceRole('EDITOR'), requestController.updateRequest);

router.delete('/:requestId', requireWorkspaceRole('OWNER'), requestController.deleteRequest);

router.post('/:requestId/send', requireWorkspaceRole('EDITOR'), requestController.sendRequest);

router.get('/:requestId/history', requireWorkspaceRole('VIEWER'), requestController.getRequestHistory);

export default router;
