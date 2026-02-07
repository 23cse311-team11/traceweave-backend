import express from 'express';
import { requestController } from '../controllers/request.controller.js';
import authenticateUser from '../middlewares/auth.middleware.js';

import { requireWorkspaceRole } from '../middlewares/rbac.middleware.js';

const router = express.Router();

router.use(authenticateUser);

// Create = EDITOR
// To create a request, we need collectionId. Middleware resolves workspace from collectionId.
// CAUTION: createRequest typically sends collectionId in BODY, not params.
// My middleware checks params. I assume backend route structure supports /:collectionId or similar,
// OR I need to adjust middleware to look in body if not in params?
// However, the route is `router.post('/', ...)` usually with body.
// Implementation Plan said: "Apply requireWorkspaceRole('EDITOR') to POST /:collectionId (Create)."
// But current route is `router.post('/', ...)`
// I will CHANGE the route to `router.post('/:collectionId', ...)` to fit the pattern and middleware,
// AND update controller if necessary (though controller took from body).
// Actually, better is to keep route clean and let middleware check body?
// But `requireWorkspaceRole` currently checks params.
// Let's stick to the Plan: `POST /:collectionId`. safer for URL params.

router.post('/:collectionId', requireWorkspaceRole('EDITOR'), requestController.createRequest);

router.get('/collection/:collectionId', requireWorkspaceRole('VIEWER'), requestController.getRequestsByCollection);

router.patch('/:requestId', requireWorkspaceRole('EDITOR'), requestController.updateRequest);

router.delete('/:requestId', requireWorkspaceRole('OWNER'), requestController.deleteRequest);

router.post('/:requestId/send', requireWorkspaceRole('VIEWER'), requestController.sendRequest);

router.get('/:requestId/history', requireWorkspaceRole('VIEWER'), requestController.getRequestHistory);

export default router;
