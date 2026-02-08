import { workspaceService } from '../services/workspace.service.js';
import catchAsync from '../utils/catchAsync.js';
import ExecutionLog from '../models/execution.model.js';

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

export const updateWorkspace = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.id;
    const { name, description } = req.body;

    const workspace = await workspaceService.updateWorkspace(
      workspaceId,
      userId,
      { name, description }
    );

    res.status(200).json({
      message: 'Workspace updated successfully',
      data: workspace
    });
  } catch (error) {
    next(error);
  }
};

export const addMemberToWorkspace = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const { email, role } = req.body;
    const userId = req.user.id;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedRole = role ? role.toUpperCase() : 'VIEWER';

    if (!['OWNER', 'EDITOR', 'VIEWER'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Invalid role. Must be OWNER, EDITOR, or VIEWER' });
    }

    const member = await workspaceService.addMember(
      workspaceId,
      userId,
      email,
      normalizedRole
    );

    res.status(201).json({
      message: 'Member added successfully',
      data: member,
    });
  } catch (error) {
    next(error);
  }
};

export const removeMemberFromWorkspace = async (req, res, next) => {
  try {
    const { workspaceId, userId: memberUserId } = req.params;
    const currentUserId = req.user.id;

    await workspaceService.removeMember(
      workspaceId,
      currentUserId,
      memberUserId
    );

    res.status(200).json({
      message: 'Member removed successfully',
    });
  } catch (error) {
    next(error);
  }
};


export const updateMemberRole = async (req, res, next) => {
  try {
    const { workspaceId, userId: memberUserId } = req.params;
    const { role } = req.body;
    const currentUserId = req.user.id;

    const normalizedRole = role ? role.toUpperCase() : null;

    if (!normalizedRole || !['EDITOR', 'VIEWER'].includes(normalizedRole)) {
      return res.status(400).json({ message: 'Valid role (EDITOR, VIEWER) is required' });
    }

    const updatedMember = await workspaceService.updateMemberRole(
      workspaceId,
      memberUserId,
      normalizedRole
    );

    res.status(200).json({
      message: 'Member role updated successfully',
      data: updatedMember,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Execution History for the entire Workspace
 * Pagination: ?page=1&limit=20
 */
export const getWorkspaceHistory = catchAsync(async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // 1. Fetch Logs from MongoDB
    // We sort by 'createdAt' desc (newest first)
    const logs = await ExecutionLog.find({ workspaceId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // .lean() makes it faster (returns plain JSON, not Mongoose docs)

    // 2. Count total for frontend pagination
    const total = await ExecutionLog.countDocuments({ workspaceId });

    res.status(200).json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching workspace history:', error);
    res.status(500).json({ error: 'Failed to fetch workspace history' });
  }
});
