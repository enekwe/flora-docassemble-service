const Interview = require('../models/Interview');
const docassembleClient = require('../services/docassembleClient');
const s3Service = require('../services/s3Service');
const logger = require('../config/logger');

/**
 * Callback Controller
 * Handles callbacks from self-hosted DocAssemble on interview completion
 * Updates MongoDB with completion status and stores references to generated documents
 */
class CallbackController {
  /**
   * Handle DocAssemble completion callback
   * POST /api/callbacks/docassemble
   *
   * Expected payload from DocAssemble:
   * {
   *   sessionId: string,
   *   status: 'completed' | 'failed',
   *   interviewId: string (our internal ID or external reference),
   *   documents: [{ id, filename, format, url, size }],
   *   completionData: object (interview answers and results),
   *   error?: string
   * }
   */
  async handleCompletion(req, res) {
    try {
      const {
        sessionId,
        status,
        interviewId,
        externalInterviewId,
        documents = [],
        completionData = {},
        error
      } = req.body;

      logger.info('DocAssemble callback received', {
        sessionId,
        status,
        interviewId,
        externalInterviewId,
        documentCount: documents.length
      });

      // Validate required fields
      if (!sessionId || !status) {
        logger.warn('Invalid callback payload - missing required fields', {
          hasSessionId: !!sessionId,
          hasStatus: !!status
        });
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: sessionId and status'
        });
      }

      // Find interview by sessionId or interviewId or externalInterviewId
      let interview = null;

      if (interviewId) {
        interview = await Interview.findOne({ interviewId });
      }

      if (!interview && sessionId) {
        interview = await Interview.findOne({ sessionId });
      }

      if (!interview && externalInterviewId) {
        interview = await Interview.findOne({ externalInterviewId });
      }

      if (!interview) {
        logger.error('Interview not found for callback', {
          sessionId,
          interviewId,
          externalInterviewId
        });
        return res.status(404).json({
          success: false,
          error: 'Interview not found'
        });
      }

      // Process completion based on status
      if (status === 'completed') {
        await this.processCompletedInterview(interview, {
          sessionId,
          documents,
          completionData
        });

        logger.info('Interview marked as completed', {
          interviewId: interview.interviewId,
          sessionId,
          documentCount: documents.length
        });

        res.status(200).json({
          success: true,
          message: 'Interview completion processed successfully',
          data: {
            interviewId: interview.interviewId,
            status: interview.status,
            documentCount: interview.generatedDocuments.length
          }
        });

      } else if (status === 'failed') {
        interview.status = 'FAILED';
        interview.error = error || 'Interview failed in DocAssemble';
        interview.errorDetails = {
          sessionId,
          timestamp: new Date(),
          callbackData: req.body
        };

        await interview.save();

        logger.error('Interview marked as failed', {
          interviewId: interview.interviewId,
          error: interview.error
        });

        res.status(200).json({
          success: true,
          message: 'Interview failure processed',
          data: {
            interviewId: interview.interviewId,
            status: interview.status,
            error: interview.error
          }
        });

      } else {
        logger.warn('Unknown callback status', { status });
        res.status(400).json({
          success: false,
          error: `Unknown status: ${status}`
        });
      }

    } catch (error) {
      logger.error('Callback processing error', {
        error: error.message,
        stack: error.stack,
        body: req.body
      });

      res.status(500).json({
        success: false,
        error: 'Failed to process callback',
        details: error.message
      });
    }
  }

  /**
   * Process completed interview
   * Updates interview status, stores document references, and optionally downloads to S3
   * @param {Object} interview - Interview document
   * @param {Object} data - Completion data
   */
  async processCompletedInterview(interview, data) {
    const { sessionId, documents, completionData } = data;

    // Mark interview as completed
    await interview.markCompleted(completionData);

    // Process each generated document
    for (const doc of documents) {
      try {
        // Store document reference
        const documentData = {
          documentId: doc.id || doc.documentId,
          documentUrl: doc.url || doc.downloadUrl,
          format: (doc.format || 'PDF').toUpperCase(),
          fileSize: doc.size
        };

        // Optionally download and upload to S3 for backup
        if (process.env.DOWNLOAD_DOCASSEMBLE_DOCS === 'true') {
          const s3Result = await this.downloadAndStoreDocument(
            doc.url || doc.downloadUrl,
            interview,
            doc.format || 'PDF'
          );

          if (s3Result.success) {
            documentData.s3Key = s3Result.s3Key;
            documentData.s3Bucket = s3Result.s3Bucket;
          }
        }

        await interview.addGeneratedDocument(documentData);

        logger.info('Document reference stored', {
          interviewId: interview.interviewId,
          documentId: documentData.documentId,
          hasS3Backup: !!documentData.s3Key
        });

      } catch (docError) {
        logger.error('Failed to process document', {
          interviewId: interview.interviewId,
          documentId: doc.id,
          error: docError.message
        });
        // Continue processing other documents
      }
    }

    // Mark sync as completed
    await interview.markSynced(interview.externalInterviewId || sessionId);
  }

  /**
   * Download document from DocAssemble and store in S3
   * @param {string} documentUrl - URL to download document
   * @param {Object} interview - Interview document
   * @param {string} format - Document format
   * @returns {Promise<Object>} S3 upload result
   */
  async downloadAndStoreDocument(documentUrl, interview, format) {
    try {
      // Download document buffer
      const axios = require('axios');
      const response = await axios.get(documentUrl, {
        responseType: 'arraybuffer',
        headers: {
          'X-API-Key': process.env.DOCASSEMBLE_API_KEY
        },
        timeout: 60000
      });

      const buffer = Buffer.from(response.data);

      // Generate S3 key
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const s3Key = `docassemble/interviews/${interview.portfolioCompanyId}/${interview.interviewId}-${timestamp}.${format.toLowerCase()}`;

      // Upload to S3
      const uploadResult = await s3Service.uploadDocument(buffer, s3Key, {
        contentType: this.getContentType(format),
        metadata: {
          interviewId: interview.interviewId,
          portfolioCompanyId: interview.portfolioCompanyId,
          format: format,
          source: 'docassemble-callback'
        }
      });

      logger.info('Document downloaded and stored in S3', {
        interviewId: interview.interviewId,
        s3Key,
        size: buffer.length
      });

      return {
        success: true,
        s3Key,
        s3Bucket: process.env.S3_BUCKET_NAME,
        size: buffer.length
      };

    } catch (error) {
      logger.error('Failed to download and store document', {
        documentUrl,
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get content type for document format
   * @param {string} format - Document format
   * @returns {string} Content type
   */
  getContentType(format) {
    const contentTypes = {
      'PDF': 'application/pdf',
      'DOCX': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'HTML': 'text/html'
    };
    return contentTypes[format.toUpperCase()] || 'application/octet-stream';
  }

  /**
   * Handle status update callback (for progress updates)
   * POST /api/callbacks/docassemble/status
   */
  async handleStatusUpdate(req, res) {
    try {
      const { sessionId, interviewId, status, progress, metadata } = req.body;

      logger.info('DocAssemble status update received', {
        sessionId,
        interviewId,
        status,
        progress
      });

      // Find interview
      let interview = null;
      if (interviewId) {
        interview = await Interview.findOne({ interviewId });
      } else if (sessionId) {
        interview = await Interview.findOne({ sessionId });
      }

      if (!interview) {
        return res.status(404).json({
          success: false,
          error: 'Interview not found'
        });
      }

      // Update status if changed
      if (status && status !== interview.status) {
        const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABANDONED'];
        if (validStatuses.includes(status.toUpperCase())) {
          interview.status = status.toUpperCase();
        }
      }

      // Store metadata if provided
      if (metadata) {
        interview.metadata = {
          ...interview.metadata,
          ...metadata,
          lastProgressUpdate: new Date()
        };
      }

      await interview.save();

      res.status(200).json({
        success: true,
        message: 'Status updated successfully',
        data: {
          interviewId: interview.interviewId,
          status: interview.status
        }
      });

    } catch (error) {
      logger.error('Status update processing error', {
        error: error.message,
        body: req.body
      });

      res.status(500).json({
        success: false,
        error: 'Failed to process status update',
        details: error.message
      });
    }
  }

  /**
   * Verify callback authenticity (optional, for security)
   * Can be enhanced with signature verification if DocAssemble supports it
   */
  verifyCallbackSignature(req, res, next) {
    const signature = req.headers['x-docassemble-signature'];
    const secret = process.env.DOCASSEMBLE_CALLBACK_SECRET;

    if (!secret) {
      // Signature verification not configured, skip
      return next();
    }

    if (!signature) {
      logger.warn('Missing callback signature');
      return res.status(401).json({
        success: false,
        error: 'Missing callback signature'
      });
    }

    try {
      const crypto = require('crypto');
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature) {
        logger.warn('Invalid callback signature');
        return res.status(401).json({
          success: false,
          error: 'Invalid callback signature'
        });
      }

      next();

    } catch (error) {
      logger.error('Signature verification error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Signature verification failed'
      });
    }
  }
}

module.exports = new CallbackController();
