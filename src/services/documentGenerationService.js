const docassembleClient = require('./docassembleClient');
const s3Service = require('./s3Service');
const Document = require('../models/Document');
const Template = require('../models/Template');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Document Generation Service
 * Orchestrates DocAssemble document generation and S3 storage
 */
class DocumentGenerationService {
  /**
   * Generate a new document from template
   * @param {Object} data - Document generation data
   * @returns {Promise<Object>} Generated document
   */
  async generateDocument(data) {
    const documentId = uuidv4();

    try {
      logger.info('Starting document generation', {
        documentId,
        templateId: data.templateId,
        companyId: data.companyId
      });

      // 1. Create document record with GENERATING status
      const document = new Document({
        documentId,
        templateId: data.templateId,
        companyId: data.companyId,
        companyName: data.companyName,
        studioCompanyId: data.studioCompanyId,
        title: data.title,
        documentType: data.documentType,
        inputData: data.inputData,
        generatedBy: data.userId,
        status: 'GENERATING',
        format: data.format || 'PDF',
        metadata: data.metadata || {}
      });

      await document.save();

      // 2. Get template
      const template = await Template.findOne({
        templateId: data.templateId,
        isActive: true
      });

      if (!template) {
        throw new Error('Template not found or inactive');
      }

      // 3. Generate document via DocAssemble
      logger.info('Calling DocAssemble API', {
        documentId,
        templatePath: template.yamlFilePath
      });

      const documentBuffer = await docassembleClient.generateDocument(
        template.yamlFilePath,
        data.inputData,
        (data.format || 'PDF').toLowerCase()
      );

      // 4. Upload to S3
      const s3Key = s3Service.generateDocumentKey(
        data.companyId,
        documentId,
        data.format || 'pdf'
      );

      const contentType = this.getContentType(data.format || 'PDF');

      logger.info('Uploading document to S3', {
        documentId,
        s3Key,
        size: documentBuffer.length
      });

      const uploadResult = await s3Service.uploadDocument(
        s3Key,
        documentBuffer,
        contentType
      );

      // 5. Generate signed download URL
      const downloadUrl = await s3Service.getSignedDownloadUrl(
        s3Key,
        parseInt(process.env.SIGNED_URL_EXPIRY || 3600)
      );

      // 6. Update document with S3 details
      document.s3Key = s3Key;
      document.s3Bucket = uploadResult.bucket;
      document.downloadUrl = downloadUrl;
      document.fileSize = documentBuffer.length;
      document.status = 'COMPLETED';
      document.templateName = template.name;

      await document.save();

      // 7. Update template usage statistics
      await template.incrementUsage();

      logger.info('Document generation completed successfully', {
        documentId,
        s3Key,
        fileSize: documentBuffer.length
      });

      return document;

    } catch (error) {
      logger.error('Document generation failed:', {
        documentId,
        error: error.message,
        stack: error.stack
      });

      // Update document status to FAILED
      await Document.updateOne(
        { documentId },
        {
          status: 'FAILED',
          error: error.message
        }
      );

      throw error;
    }
  }

  /**
   * Get document by ID
   * @param {string} documentId - Document ID
   * @returns {Promise<Object>} Document
   */
  async getDocument(documentId) {
    try {
      const document = await Document.findOne({ documentId });

      if (!document) {
        throw new Error('Document not found');
      }

      // Regenerate signed URL if needed (for expired URLs)
      if (document.s3Key && document.status === 'COMPLETED') {
        document.downloadUrl = await s3Service.getSignedDownloadUrl(
          document.s3Key,
          parseInt(process.env.SIGNED_URL_EXPIRY || 3600)
        );
      }

      return document;

    } catch (error) {
      logger.error('Failed to get document:', {
        documentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * List documents by company
   * @param {string} companyId - Company ID
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} List of documents
   */
  async listDocumentsByCompany(companyId, filters = {}) {
    try {
      const query = { companyId };

      // Apply filters
      if (filters.documentType) {
        query.documentType = filters.documentType;
      }

      if (filters.status) {
        query.status = filters.status;
      } else {
        // Default to completed documents
        query.status = 'COMPLETED';
      }

      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.createdAt.$lte = new Date(filters.endDate);
        }
      }

      const limit = parseInt(filters.limit) || 50;
      const skip = parseInt(filters.skip) || 0;

      const documents = await Document.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      // Regenerate download URLs for all documents
      for (const doc of documents) {
        if (doc.s3Key && doc.status === 'COMPLETED') {
          doc.downloadUrl = await s3Service.getSignedDownloadUrl(doc.s3Key);
        }
      }

      return documents;

    } catch (error) {
      logger.error('Failed to list documents:', {
        companyId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete document
   * @param {string} documentId - Document ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocument(documentId) {
    try {
      const document = await Document.findOne({ documentId });

      if (!document) {
        throw new Error('Document not found');
      }

      // Delete from S3
      if (document.s3Key) {
        await s3Service.deleteDocument(document.s3Key);
      }

      // Delete from database
      await Document.deleteOne({ documentId });

      logger.info('Document deleted successfully', { documentId });

      return true;

    } catch (error) {
      logger.error('Failed to delete document:', {
        documentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create new version of document
   * @param {string} documentId - Original document ID
   * @param {Object} data - New document data
   * @returns {Promise<Object>} New document version
   */
  async createNewVersion(documentId, data) {
    try {
      const originalDocument = await this.getDocument(documentId);

      // Generate new document with version tracking
      const newDocumentData = {
        ...data,
        templateId: originalDocument.templateId,
        documentType: originalDocument.documentType
      };

      const newDocument = await this.generateDocument(newDocumentData);

      // Update version information
      newDocument.version = originalDocument.version + 1;
      newDocument.previousVersionId = documentId;
      await newDocument.save();

      logger.info('New document version created', {
        originalDocumentId: documentId,
        newDocumentId: newDocument.documentId,
        version: newDocument.version
      });

      return newDocument;

    } catch (error) {
      logger.error('Failed to create new version:', {
        documentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get document generation statistics
   * @param {string} companyId - Company ID (optional)
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics(companyId = null) {
    try {
      const query = companyId ? { companyId } : {};

      const stats = await Document.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalDocuments: { $sum: 1 },
            completedDocuments: {
              $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
            },
            failedDocuments: {
              $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
            },
            totalFileSize: { $sum: '$fileSize' },
            avgFileSize: { $avg: '$fileSize' }
          }
        }
      ]);

      const typeBreakdown = await Document.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$documentType',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      return {
        summary: stats[0] || {
          totalDocuments: 0,
          completedDocuments: 0,
          failedDocuments: 0,
          totalFileSize: 0,
          avgFileSize: 0
        },
        typeBreakdown
      };

    } catch (error) {
      logger.error('Failed to get statistics:', error);
      throw error;
    }
  }

  /**
   * Get content type for format
   * @param {string} format - Document format
   * @returns {string} Content type
   */
  getContentType(format) {
    const contentTypes = {
      PDF: 'application/pdf',
      DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      HTML: 'text/html'
    };

    return contentTypes[format.toUpperCase()] || 'application/pdf';
  }
}

module.exports = new DocumentGenerationService();
