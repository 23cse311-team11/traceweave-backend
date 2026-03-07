import httpStatus from 'http-status';
import prisma from '../config/prisma.js';
import catchAsync from '../utils/catchAsync.js';
import { environmentService } from '../services/environment.service.js';

export const createEnvironment = catchAsync(async (req, res) => {
    const { workspaceId } = req.params;
    const environment = await environmentService.createEnvironment(workspaceId, req.user.id, req.body);
    res.status(httpStatus.CREATED).send(environment);
});

export const getWorkspaceEnvironments = catchAsync(async (req, res) => {
    const { workspaceId } = req.params;
    const environments = await environmentService.getWorkspaceEnvironments(workspaceId, req.user.id);
    res.send(environments);
});

export const deleteEnvironment = catchAsync(async (req, res) => {
    await environmentService.deleteEnvironment(req.params.environmentId);
    res.status(httpStatus.NO_CONTENT).send();
});

export const updateEnvironment = catchAsync(async (req, res) => {
    const { environmentId } = req.params;
    const environment = await environmentService.updateEnvironment(environmentId, req.user.id, req.body);
    res.send(environment);
});

export const togglePersistent = catchAsync(async (req, res) => {
    const { environmentId } = req.params;
    const { isPersistent } = req.body;
    const environment = await environmentService.togglePersistent(environmentId, req.user.id, isPersistent);
    res.send(environment);
});

export const createVariable = catchAsync(async (req, res) => {
    const { environmentId } = req.params;
    const variable = await environmentService.createVariable(environmentId, req.user.id, req.body);
    res.status(httpStatus.CREATED).send(variable);
});

export const getVariables = catchAsync(async (req, res) => {
    const { environmentId } = req.params;
    const variables = await environmentService.getVariables(environmentId, req.user.id);
    res.send(variables);
});

export const updateVariable = catchAsync(async (req, res) => {
    const { variableId } = req.params;
    const variable = await environmentService.updateVariable(variableId, req.user.id, req.body);
    res.send(variable);
});

export const renameVariable = catchAsync(async (req, res) => {
    const { variableId } = req.params;
    const { key } = req.body;
    const variable = await environmentService.renameVariable(variableId, req.user.id, key);
    res.send(variable);
});

export const deleteVariable = catchAsync(async (req, res) => {
    await environmentService.deleteVariable(req.params.variableId, req.user.id);
    res.status(httpStatus.NO_CONTENT).send();
});

export const getGlobalEnvironments = catchAsync(async (req, res) => {
    const userId = req.user.id;

    const environments = await prisma.environment.findMany({
        where: {
            deletedAt: null,
            workspace: {
                members: { some: { userId } },
                deletedAt: null
            }
        },
        include: {
            workspace: { select: { id: true, name: true } },
            _count: { select: { variables: { where: { deletedAt: null } } } }
        },
        orderBy: { updatedAt: 'desc' }
    });

    res.status(200).json({ data: environments });
});