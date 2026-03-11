import mongoose from 'mongoose';

const executionSchema = new mongoose.Schema({
  requestId: { type: String, index: true }, // Refers to Postgres UUID
  collectionId: { type: String, index: true },
  workspaceId: { type: String, index: true },
  environmentId: { type: String, index: true }, // Environment used for variable substitution

  // Request Details (Snapshot of what was sent)
  protocol: { type: String, default: 'http' },
  method: String,
  url: String,
  requestHeaders: mongoose.Schema.Types.Mixed,
  requestBody: mongoose.Schema.Types.Mixed,

  // Response Details
  status: Number,
  statusText: String,
  responseHeaders: mongoose.Schema.Types.Mixed,
  responseBody: mongoose.Schema.Types.Mixed, // Warning: strict size limits in Mongo (16MB)
  responseSize: Number, // in bytes

  // Timing (Waterfall metrics in milliseconds)
  timings: {
    dnsLookup: Number,    // Time for DNS resolution
    tcpConnection: Number, // Time to establish TCP connection
    tlsHandshake: Number, // Time for TLS handshake (if HTTPS)
    firstByte: Number, // TTFB (Time To First Byte)
    download: Number,  // Content Download
    total: Number      // Total Duration
  },
  
  // Workflow Context
  workflowExecutionId: { type: String, index: true }, // Postgres UUID of the parent execution
  stepId: String, // ID of the step in the workflow definition
  stepOrder: Number,

  executedBy: String, // User UUID
  createdAt: { type: Date, default: Date.now }
});

// Auto-delete logs older than 30 days (optional, good for free tier)
executionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

const ExecutionLog = mongoose.model('ExecutionLog', executionSchema);
export default ExecutionLog;