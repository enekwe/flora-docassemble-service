const documentGenerationService = require('../services/documentGenerationService');
const logger = require('../config/logger');

/**
 * Document Controller
 * Handles HTTP requests for document operations
 */
class DocumentController {
  /**
   * Generate new document
   * POST /api/documents/generate
   */
  async generateDocument(req, res) {
    try {
      const {
        templateId,
        companyId,
        companyName,
        studioCompanyId,
        title,
        documentType,
        inputData,
        format,
        metadata
      } = req.body;

      // Get user ID from auth token
      const userId = req.user?.id || req.body.userId;

      const documentData = {
        templateId,
        companyId,
        companyName,
        studioCompanyId,
        title,
        documentType,
        inputData,
        userId,
        format: format || 'PDF',
        metadata
      };

      const document = await documentGenerationService.generateDocument(documentData);

      logger.info('Document generated via API', {
        documentId: document.documentId,
        userId,
        companyId
      });

      res.status(201).json({
        success: true,
        data: document
      });

    } catch (error) {
      logger.error('Document generation API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get document by ID
   * GET /api/documents/:documentId
   */
  async getDocument(req, res) {
    try {
      const { documentId } = req.params;

      const document = await documentGenerationService.getDocument(documentId);

      res.status(200).json({
        success: true,
        data: document
      });

    } catch (error) {
      logger.error('Get document API error:', error);

      if (error.message === 'Document not found') {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get document download URL
   * GET /api/documents/:documentId/download
   */
  async getDownloadUrl(req, res) {
    try {
      const { documentId } = req.params;

      const document = await documentGenerationService.getDocument(documentId);

      if (document.status !== 'COMPLETED') {
        return res.status(400).json({
          success: false,
          error: 'Document is not ready for download',
          status: document.status
        });
      }

      res.status(200).json({
        success: true,
        data: {
          documentId: document.documentId,
          downloadUrl: document.downloadUrl,
          fileName: `${document.title}.${document.format.toLowerCase()}`,
          fileSize: document.fileSize,
          expiresIn: parseInt(process.env.SIGNED_URL_EXPIRY || 3600)
        }
      });

    } catch (error) {
      logger.error('Get download URL API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * List documents by company
   * GET /api/documents/company/:companyId
   */
  async listDocumentsByCompany(req, res) {
    try {
      const { companyId } = req.params;
      const filters = {
        documentType: req.query.documentType,
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: req.query.limit,
        skip: req.query.skip
      };

      const documents = await documentGenerationService.listDocumentsByCompany(
        companyId,
        filters
      );

      res.status(200).json({
        success: true,
        data: documents,
        count: documents.length
      });

    } catch (error) {
      logger.error('List documents API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Delete document
   * DELETE /api/documents/:documentId
   */
  async deleteDocument(req, res) {
    try {
      const { documentId } = req.params;

      await documentGenerationService.deleteDocument(documentId);

      res.status(200).json({
        success: true,
        message: 'Document deleted successfully'
      });

    } catch (error) {
      logger.error('Delete document API error:', error);

      if (error.message === 'Document not found') {
        return res.status(404).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Create new version of document
   * POST /api/documents/:documentId/version
   */
  async createNewVersion(req, res) {
    try {
      const { documentId } = req.params;
      const { inputData, title } = req.body;

      const userId = req.user?.id || req.body.userId;

      const data = {
        ...req.body,
        userId,
        inputData,
        title
      };

      const newDocument = await documentGenerationService.createNewVersion(
        documentId,
        data
      );

      res.status(201).json({
        success: true,
        data: newDocument
      });

    } catch (error) {
      logger.error('Create document version API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get document statistics
   * GET /api/documents/stats
   * GET /api/documents/stats/:companyId
   */
  async getStatistics(req, res) {
    try {
      const { companyId } = req.params;

      const stats = await documentGenerationService.getStatistics(companyId);

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Get statistics API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new DocumentController();
