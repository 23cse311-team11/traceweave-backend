// backend/core-api/src/models/workflow-log.model.js
import mongoose from 'mongoose';

const stepResultSchema = new mongoose.Schema({
  stepId: Number, // Index 0, 1, 2...
  requestId: String,
  requestName: String,
  status: Number, // 200, 404, etc.
  executionTime: Number, // ms
  success: Boolean,
  historyId: String // Reference to the detailed ExecutionLog (Mongo ID)
});

const workflowLogSchema = new mongoose.Schema({
  workflowId: { type: String, required: true, index: true },
  workspaceId: { type: String, required: true },
  executedBy: { type: String, required: true }, // User UUID

  status: { type: String, enum: ['COMPLETED', 'FAILED', 'PARTIAL'], default: 'COMPLETED' },
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  totalDuration: Number,

  steps: [stepResultSchema], // Summary of steps

  createdAt: { type: Date, default: Date.now }
});

const WorkflowLog = mongoose.model('WorkflowLog', workflowLogSchema);
export default WorkflowLog;