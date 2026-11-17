import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { getExecutionById, deleteExecutionById } from '../controllers/execution.controller.js';

const router = express.Router();

router.use(authMiddleware);

// GET /api/v1/executions/:execId
router.get('/:execId', getExecutionById);

// DELETE /api/v1/executions/:execId
router.delete('/:execId', deleteExecutionById);

export default router;