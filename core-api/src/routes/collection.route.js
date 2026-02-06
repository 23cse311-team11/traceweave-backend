import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
  createCollection,
  getCollectionsByWorkspace,
  deleteCollection,
  updateCollection
} from '../controllers/collection.controller.js';

const router = express.Router();

// Protect all collection routes
router.use(authMiddleware);

router.post('/workspace/:workspaceId', createCollection);
router.get('/workspace/:workspaceId', getCollectionsByWorkspace);
router.delete('/:collectionId', deleteCollection);
router.patch('/:collectionId', updateCollection);

export default router;
