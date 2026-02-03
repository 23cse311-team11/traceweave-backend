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
