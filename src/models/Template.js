const mongoose = require('mongoose');

const TemplateFieldSchema = new mongoose.Schema({
  fieldName: { type: String, required: true },
  fieldType: {
    type: String,
    enum: ['text', 'number', 'date', 'currency', 'choice', 'yesno', 'email', 'phone'],
    required: true
  },
  label: String,
  required: { type: Boolean, default: false },
  defaultValue: String,
  validationRules: {
    min: Number,
    max: Number,
    pattern: String,
    options: [String]
  },
  helpText: String,
  order: Number
}, { _id: false });

const TemplateSchema = new mongoose.Schema({
  templateId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    index: true
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

  // DocAssemble configuration
  yamlFilePath: {
    type: String,
    required: true
  },
  yamlContent: String,

  // Template metadata
  description: String,
  category: {
    type: String,
    enum: ['FORMATION', 'EQUITY', 'EMPLOYMENT', 'COMPLIANCE', 'CUSTOM'],
    default: 'CUSTOM'
  },
  jurisdiction: [String],

  // Form fields configuration
  fields: [TemplateFieldSchema],

  // Output configuration
  outputFormats: [{
    type: String,
    enum: ['PDF', 'DOCX', 'HTML'],
    default: 'PDF'
  }],

  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isCustom: {
    type: Boolean,
    default: false
  },
  createdBy: String,

  // Usage stats
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: Date,

  // Versioning
  version: {
    type: Number,
    default: 1
  },
  previousVersionId: String
}, {
  timestamps: true
});

// Text index for search
TemplateSchema.index({ name: 'text', description: 'text' });

// Compound indexes
TemplateSchema.index({ documentType: 1, isActive: 1 });
TemplateSchema.index({ category: 1, isActive: 1 });

// Methods
TemplateSchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  return this.save();
};

TemplateSchema.methods.toJSON = function() {
  const doc = this.toObject();
  delete doc.__v;
  return doc;
};

module.exports = mongoose.model('Template', TemplateSchema);
