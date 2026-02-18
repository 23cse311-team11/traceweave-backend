import mongoose from 'mongoose';

const cookieSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  workspaceId: { type: String, required: true, index: true },
  domain: { type: String, required: true, index: true }, // e.g., "api.example.com"
  
  // We store the serialized cookie string or object from tough-cookie
  key: String,   // The cookie name (e.g., "PHPSESSID")
  value: String, // The value
  path: { type: String, default: '/' },
  secure: Boolean,
  httpOnly: Boolean,
  expires: Date,
  
  // The full serialized object for reconstruction
  raw: mongoose.Schema.Types.Mixed, 

  lastAccessed: { type: Date, default: Date.now }
});

// Compound index to quickly find cookies for a specific user/workspace/domain
cookieSchema.index({ userId: 1, workspaceId: 1, domain: 1 });

// Auto-expire cookies after 30 days (Session cleanup)
cookieSchema.index({ lastAccessed: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const CookieJarModel = mongoose.model('CookieJar', cookieSchema);

export default CookieJarModel;