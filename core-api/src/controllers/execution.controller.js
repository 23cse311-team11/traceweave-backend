import ExecutionLog from '../models/execution.model.js';
import catchAsync from '../utils/catchAsync.js';

export const getExecutionById = catchAsync(async (req, res) => {
  const { execId } = req.params;
  const userId = req.user.id;

  const log = await ExecutionLog.findById(execId).lean();

  if (!log) {
    return res.status(404).json({ message: 'Execution log not found' });
  }

  // Security Check: Ensure the user actually executed this
  if (log.executedBy !== userId) {
    return res.status(403).json({ message: 'Access denied to this execution log' });
  }

  res.status(200).json({ data: log });
});