import express from 'express';
import { requestController } from '../controllers/request.controller.js';
import authenticateUser from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateUser);

router.post('/', requestController.createRequest);
router.get('/collection/:collectionId', requestController.getRequestsByCollection);
router.patch('/:requestId', requestController.updateRequest);
router.delete('/:requestId', requestController.deleteRequest);
router.post('/:requestId/send', requestController.sendRequest);

export default router;
