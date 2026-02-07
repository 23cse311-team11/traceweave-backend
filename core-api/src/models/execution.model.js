import mongoose from 'mongoose';

const executionSchema = new mongoose.Schema({
  requestId: { type: String, required: true, index: true }, // Refers to Postgres UUID
  collectionId: { type: String, index: true },
  workspaceId: { type: String, index: true },
  
  // Request Details (Snapshot of what was sent)
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
    dns: Number,       // DNS Lookup
    tls: Number,       // SSL Handshake
    firstByte: Number, // TTFB (Time To First Byte)
    download: Number,  // Content Download
    total: Number      // Total Duration
  },
  
  executedBy: String, // User UUID
  createdAt: { type: Date, default: Date.now }
});

// Auto-delete logs older than 30 days (optional, good for free tier)
executionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

const ExecutionLog = mongoose.model('ExecutionLog', executionSchema);
export default ExecutionLog;