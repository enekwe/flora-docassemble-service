const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  documentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  templateId: {
    type: String,
    required: true,
    index: true
  },
  templateName: String,
  companyId: {
    type: String,
    required: true,
    index: true
  },
  companyName: String,
  studioCompanyId: String,

  // Document metadata
  title: {
    type: String,
    required: true
  },
  documentType: {
    type: String,
    enum: [
      '83B_ELECTION',
      'OPERATING_AGREEMENT',
      'EMPLOYMENT_AGREEMENT',
      'STOCK_PURCHASE_AGREEMENT',
      'CUSTOM'
    ],
    required: true,
    index: true
  },

  // Generation data
  inputData: {
    type: Object,
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  generatedBy: {
    type: String,
    required: true
  },

  // File storage
  s3Key: String,
  s3Bucket: String,
  downloadUrl: String,
  fileSize: Number,
  format: {
    type: String,
    enum: ['PDF', 'DOCX', 'HTML'],
    default: 'PDF'
  },

  // Status
  status: {
    type: String,
    enum: ['GENERATING', 'COMPLETED', 'FAILED'],
    default: 'GENERATING',
    index: true
  },

  // Versioning
  version: {
    type: Number,
    default: 1
  },
  previousVersionId: String,

  // Metadata
  metadata: {
    partyNames: [String],
    effectiveDate: Date,
    expirationDate: Date,
    tags: [String],
    jurisdiction: String
  },

  error: String
}, {
  timestamps: true
});

// Compound indexes for common queries
DocumentSchema.index({ companyId: 1, documentType: 1 });
DocumentSchema.index({ studioCompanyId: 1, status: 1 });
DocumentSchema.index({ status: 1, createdAt: -1 });
DocumentSchema.index({ generatedBy: 1, createdAt: -1 });

// Methods
DocumentSchema.methods.toJSON = function() {
  const doc = this.toObject();
  delete doc.__v;
  return doc;
};

module.exports = mongoose.model('Document', DocumentSchema);
