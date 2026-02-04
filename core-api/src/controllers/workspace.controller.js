import { workspaceService } from '../services/workspace.service.js';

export const createWorkspace = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ message: 'Workspace name is required' });
    }

    const workspace = await workspaceService.createWorkspace({
      name,
      description,
      ownerId: userId,
    });

    res.status(201).json({
      message: 'Workspace created successfully',
      data: workspace,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyWorkspaces = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const workspaces = await workspaceService.getUserWorkspaces(userId);

    res.status(200).json({ data: workspaces });
  } catch (error) {
    next(error);
  }
};

export const getWorkspaceById = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    const workspace = await workspaceService.getWorkspaceById(
      workspaceId,
      userId
    );

    res.status(200).json({ data: workspace });
  } catch (error) {
    next(error);
  }
};

export const deleteWorkspace = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;

    await workspaceService.deleteWorkspace(workspaceId, userId);

    res.status(200).json({
      message: 'Workspace deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
