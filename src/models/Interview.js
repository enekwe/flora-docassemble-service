const mongoose = require('mongoose');

/**
 * Interview Model
 * Tracks DocAssemble interview sessions with sync status for self-hosted integration
 */
const InterviewSchema = new mongoose.Schema({
  interviewId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // External reference to DocAssemble internal ID
  externalInterviewId: {
    type: String,
    index: true,
    sparse: true
  },

  // Interview metadata
  title: {
    type: String,
    required: true
  },
  templateId: {
    type: String,
    required: true,
    index: true
  },
  templateName: String,

  // Company associations
  portfolioCompanyId: {
    type: String,
    required: true,
    index: true
  },
  companyName: String,
  studioCompanyId: String,

  // User tracking
  createdBy: {
    type: String,
    required: true,
    index: true
  },

  // Interview status
  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABANDONED'],
    default: 'PENDING',
    index: true
  },

  // Sync tracking fields (for self-hosted DocAssemble integration)
  syncStatus: {
    type: String,
    enum: ['PENDING', 'SYNCED', 'FAILED', 'RETRY'],
    default: 'PENDING',
    index: true
  },
  lastSyncAt: {
    type: Date,
    index: true
  },
  syncErrors: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    error: String,
    details: mongoose.Schema.Types.Mixed,
    retryCount: {
      type: Number,
      default: 0
    }
  }],

  // Interview session data
  sessionId: String, // DocAssemble session ID
  interviewUrl: String, // URL to access the interview in DocAssemble

  // Input data for interview
  inputData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // Generated documents from completed interview
  generatedDocuments: [{
    documentId: String,
    documentUrl: String,
    format: {
      type: String,
      enum: ['PDF', 'DOCX', 'HTML']
    },
    s3Key: String,
    s3Bucket: String,
    fileSize: Number,
    generatedAt: Date
  }],

  // Completion data
  completedAt: Date,
  completionData: mongoose.Schema.Types.Mixed,

  // Metadata
  metadata: {
    interviewType: String,
    jurisdiction: String,
    tags: [String],
    customFields: mongoose.Schema.Types.Mixed
  },

  // Error tracking
  error: String,
  errorDetails: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Compound indexes for common queries
InterviewSchema.index({ portfolioCompanyId: 1, status: 1 });
InterviewSchema.index({ portfolioCompanyId: 1, createdAt: -1 });
InterviewSchema.index({ createdBy: 1, status: 1 });
InterviewSchema.index({ syncStatus: 1, lastSyncAt: 1 }); // For sync retry queries
InterviewSchema.index({ status: 1, syncStatus: 1 }); // For finding failed syncs
InterviewSchema.index({ templateId: 1, status: 1 });

// Methods
InterviewSchema.methods.toJSON = function() {
  const interview = this.toObject();
  delete interview.__v;
  return interview;
};

InterviewSchema.methods.markSynced = function(externalId) {
  this.syncStatus = 'SYNCED';
  this.externalInterviewId = externalId;
  this.lastSyncAt = new Date();
  return this.save();
};

InterviewSchema.methods.markSyncFailed = function(error, details = {}) {
  const retryCount = this.syncErrors.length;

  this.syncStatus = retryCount >= 5 ? 'RETRY' : 'FAILED';
  this.syncErrors.push({
    timestamp: new Date(),
    error: error.message || String(error),
    details,
    retryCount
  });

  return this.save();
};

InterviewSchema.methods.addGeneratedDocument = function(documentData) {
  this.generatedDocuments.push({
    ...documentData,
    generatedAt: new Date()
  });
  return this.save();
};

InterviewSchema.methods.markCompleted = function(completionData = {}) {
  this.status = 'COMPLETED';
  this.completedAt = new Date();
  this.completionData = completionData;
  return this.save();
};

// Static methods
InterviewSchema.statics.findFailedSyncs = function(limit = 100) {
  return this.find({
    syncStatus: { $in: ['FAILED', 'RETRY'] },
    status: { $ne: 'ABANDONED' }
  })
  .sort({ lastSyncAt: 1 })
  .limit(limit);
};

InterviewSchema.statics.findPendingSyncs = function(limit = 100) {
  return this.find({
    syncStatus: 'PENDING',
    status: { $ne: 'ABANDONED' }
  })
  .sort({ createdAt: 1 })
  .limit(limit);
};

module.exports = mongoose.model('Interview', InterviewSchema);
