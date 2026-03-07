import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { getExecutionById } from '../controllers/execution.controller.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/executions/:execId
router.get('/:execId', getExecutionById);

export default router;