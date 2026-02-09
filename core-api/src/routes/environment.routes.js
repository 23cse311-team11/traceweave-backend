import express from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import { requireWorkspaceRole } from '../middlewares/rbac.middleware.js';
import {
    deleteEnvironment,
    updateEnvironment,
    togglePersistent,
    createVariable,
    getVariables,
    updateVariable,
    renameVariable,
    deleteVariable
} from '../controllers/environment.controller.js';

const router = express.Router();

router.use(authMiddleware);

router.delete('/:environmentId', requireWorkspaceRole('OWNER'), deleteEnvironment);
router.patch('/:environmentId', updateEnvironment);
router.patch('/:environmentId/persistent', togglePersistent);

router.post('/:environmentId/variables', createVariable);
router.get('/:environmentId/variables', getVariables);
router.patch('/:environmentId/variables/:variableId/rename', renameVariable);
router.patch('/:environmentId/variables/:variableId', updateVariable);
router.delete('/:environmentId/variables/:variableId', deleteVariable);

export default router;
