import express from 'express';
import { requestController } from '../controllers/request.controller.js';
import authenticateUser from '../middlewares/auth.middleware.js';
import { requireWorkspaceRole } from '../middlewares/rbac.middleware.js';
import { cookieController } from '../controllers/cookie.controller.js';
import { wsController } from '../controllers/ws.controller.js';
import multer from 'multer';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.get('/ws/stream', wsController.streamConnection);

router.use(authenticateUser);

// Static / specific routes
router.post('/execute', requireWorkspaceRole('EDITOR'), upload.any(), requestController.executeAdHocRequest);
router.post('/history/sync', requireWorkspaceRole('VIEWER'), requestController.syncExecutionHistory);

router.get('/jar/cookies', cookieController.getCookies);
router.post('/jar/cookies', cookieController.createCookie);
router.put('/jar/cookies/:cookieId', cookieController.updateCookie);
router.delete('/jar/cookies/:cookieId', cookieController.deleteCookie);
router.delete('/jar/cookies', cookieController.clearCookies);

// WebSocket routes
router.post('/ws/connect', wsController.connectTarget);
router.post('/ws/send', wsController.sendMessage);
router.post('/ws/disconnect', wsController.disconnectTarget);

// Collection routes
router.post('/:collectionId', requireWorkspaceRole('EDITOR'), requestController.createRequest);
router.get('/collection/:collectionId', requireWorkspaceRole('VIEWER'), requestController.getRequestsByCollection);

// Dynamic routes
router.post('/:requestId/send', requireWorkspaceRole('EDITOR'), upload.any(), requestController.sendRequest);
router.get('/:requestId/history', requireWorkspaceRole('VIEWER'), requestController.getRequestHistory);
router.patch('/:requestId', requireWorkspaceRole('EDITOR'), requestController.updateRequest);
router.delete('/:requestId', requireWorkspaceRole('OWNER'), requestController.deleteRequest);

export default router;