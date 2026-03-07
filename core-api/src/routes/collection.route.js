import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import {
  createCollection,
  getCollectionsByWorkspace,
  deleteCollection,
  updateCollection,
  duplicateCollection
} from '../controllers/collection.controller.js';

import { requireWorkspaceRole } from '../middlewares/rbac.middleware.js';

const router = express.Router();

// Protect all collection routes
router.use(authMiddleware);

// Creator/Update = EDITOR (or better)
// Delete = OWNER
// Read = VIEWER (or better)

router.post('/workspace/:workspaceId', requireWorkspaceRole('EDITOR'), createCollection);

router.get('/workspace/:workspaceId', requireWorkspaceRole('VIEWER'), getCollectionsByWorkspace);

router.delete('/:collectionId', requireWorkspaceRole('OWNER'), deleteCollection);

router.patch('/:collectionId', requireWorkspaceRole('EDITOR'), updateCollection);

router.post('/:collectionId/duplicate', requireWorkspaceRole('EDITOR'), duplicateCollection);

export default router;
