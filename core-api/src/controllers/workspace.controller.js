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

    const member = await workspaceService.addMemberDirectly(
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

export const createWorkspaceInvite = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const { email, role } = req.body;
    const inviterId = req.user.id;

    if (!email) return res.status(400).json({ message: 'Email is required' });

    const invite = await workspaceService.createInvite(workspaceId, inviterId, email, role || 'VIEWER');
    
    // Generate the magic link the user will click
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${invite.token}`;

    res.status(201).json({
      message: 'Invite created successfully',
      data: { ...invite, inviteLink }
    });
  } catch (error) { next(error); }
};

export const getPendingInvites = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const invites = await workspaceService.getPendingInvites(workspaceId);
    res.status(200).json({ data: invites });
  } catch (error) { next(error); }
};

// Note: This endpoint doesn't need a workspaceId in the URL, just the token
export const acceptWorkspaceInvite = async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.user.id; // User must be logged in to accept

    if (!token) return res.status(400).json({ message: 'Token is required' });

    const member = await workspaceService.acceptInvite(token, userId);
    res.status(200).json({ message: 'Welcome to the workspace!', data: member });
  } catch (error) { next(error); }
};

export const toggleCommonLink = async (req, res) => {
  const { workspaceId } = req.params;  
  const { isActive } = req.body;

  const result = await workspaceService.generateOrToggleCommonLink(
    workspaceId,
    isActive
  );

  res.json(result);
};

export const resetCommonLink = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const workspace = await workspaceService.resetCommonLink(workspaceId);
    res.status(200).json({ data: workspace });
  } catch (error) { next(error); }
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
export const getWorkspaceHistory = async (req, res) => {
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
};

/**
 * Get Execution History for all Workspaces (Global)
 * Pagination: ?page=1&limit=20
 */
export const getGlobalHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const logs = await ExecutionLog.find({ executedBy: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ExecutionLog.countDocuments({ executedBy: userId });

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
    console.error('Error fetching global history:', error);
    res.status(500).json({ error: 'Failed to fetch global history' });
  }
};

export const getGlobalStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Define timeframes (Last 7 days vs Previous 7 days)
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const stats = await ExecutionLog.aggregate([
      // 1. Filter for user's logs in the last 14 days to reduce working set
      { $match: { executedBy: userId, createdAt: { $gte: last14Days } } },
      
      // 2. Facet allows us to run multiple parallel pipelines (Current vs Previous)
      {
        $facet: {
          current: [
            { $match: { createdAt: { $gte: last7Days } } },
            { $group: {
                _id: null,
                total: { $sum: 1 },
                errors: { $sum: { $cond: [{ $gte: ['$status', 400] }, 1, 0] } },
                totalLatency: { $sum: '$timings.total' }
            }}
          ],
          previous: [
            { $match: { createdAt: { $lt: last7Days } } },
            { $group: {
                _id: null,
                total: { $sum: 1 },
                errors: { $sum: { $cond: [{ $gte: ['$status', 400] }, 1, 0] } },
                totalLatency: { $sum: '$timings.total' }
            }}
          ]
        }
      }
    ]);

    // 3. Extract results (Aggregation returns arrays)
    const current = stats[0].current[0] || { total: 0, errors: 0, totalLatency: 0 };
    const previous = stats[0].previous[0] || { total: 0, errors: 0, totalLatency: 0 };

    // 4. Mathematical Formatter Helpers
    const calcErrorRate = (errs, total) => total > 0 ? (errs / total) * 100 : 0;
    const calcAvgLatency = (lat, total) => total > 0 ? Math.round(lat / total) : 0;
    const calcTrend = (curr, prev) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return ((curr - prev) / prev) * 100;
    };

    // 5. Structure the final data for the frontend
    const responseData = {
      requests: {
        value: current.total,
        trend: calcTrend(current.total, previous.total)
      },
      latency: {
        value: calcAvgLatency(current.totalLatency, current.total),
        trend: calcTrend(calcAvgLatency(current.totalLatency, current.total), calcAvgLatency(previous.totalLatency, previous.total))
      },
      errorRate: {
        value: calcErrorRate(current.errors, current.total),
        // For error rates, we usually show absolute percentage point difference, not relative trend
        trend: calcErrorRate(current.errors, current.total) - calcErrorRate(previous.errors, previous.total)
      }
    };

    res.status(200).json({ data: responseData });
  } catch (error) {
    console.error('Error fetching global stats:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};