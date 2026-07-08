const s3Config = require('../config/s3');
const logger = require('../config/logger');

/**
 * S3 Service
 * Integration with Flora's S3 bucket for document storage
 */
class S3Service {
  constructor() {
    this.s3 = s3Config.getClient();
    this.bucket = s3Config.getBucketName();
    this.region = s3Config.getRegion();
  }

  /**
   * Upload document to S3
   * @param {string} key - S3 object key
   * @param {Buffer} buffer - Document buffer
   * @param {string} contentType - Content type
   * @returns {Promise<Object>} Upload result
   */
  async uploadDocument(key, buffer, contentType = 'application/pdf') {
    try {
      logger.info('Uploading document to S3', {
        key,
        size: buffer.length,
        contentType
      });

      const params = {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'uploaded-by': 'flora-docassemble-service',
          'upload-timestamp': new Date().toISOString()
        }
      };

      const result = await this.s3.upload(params).promise();

      logger.info('Document uploaded to S3 successfully', {
        key,
        location: result.Location
      });

      return {
        bucket: this.bucket,
        key: key,
        url: result.Location,
        etag: result.ETag
      };

    } catch (error) {
      logger.error('S3 upload failed:', {
        error: error.message,
        key
      });
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Get signed download URL for document
   * @param {string} key - S3 object key
   * @param {number} expiresIn - URL expiry in seconds
   * @returns {Promise<string>} Signed URL
   */
  async getSignedDownloadUrl(key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.bucket,
        Key: key,
        Expires: expiresIn
      };

      const url = await this.s3.getSignedUrlPromise('getObject', params);

      logger.info('Generated signed URL', {
        key,
        expiresIn
      });

      return url;

    } catch (error) {
      logger.error('Failed to generate signed URL:', {
        error: error.message,
        key
      });
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Delete document from S3
   * @param {string} key - S3 object key
   * @returns {Promise<boolean>} Success status
   */
  async deleteDocument(key) {
    try {
      await this.s3.deleteObject({
        Bucket: this.bucket,
        Key: key
      }).promise();

      logger.info('Document deleted from S3', { key });
      return true;

    } catch (error) {
      logger.error('S3 deletion failed:', {
        error: error.message,
        key
      });
      return false;
    }
  }

  /**
   * Check if document exists in S3
   * @param {string} key - S3 object key
   * @returns {Promise<boolean>} Existence status
   */
  async documentExists(key) {
    try {
      await this.s3.headObject({
        Bucket: this.bucket,
        Key: key
      }).promise();

      return true;

    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get document metadata from S3
   * @param {string} key - S3 object key
   * @returns {Promise<Object>} Document metadata
   */
  async getDocumentMetadata(key) {
    try {
      const result = await this.s3.headObject({
        Bucket: this.bucket,
        Key: key
      }).promise();

      return {
        size: result.ContentLength,
        lastModified: result.LastModified,
        contentType: result.ContentType,
        etag: result.ETag,
        metadata: result.Metadata
      };

    } catch (error) {
      logger.error('Failed to get document metadata:', {
        error: error.message,
        key
      });
      throw new Error(`Failed to get document metadata: ${error.message}`);
    }
  }

  /**
   * Copy document to a new location
   * @param {string} sourceKey - Source S3 key
   * @param {string} destinationKey - Destination S3 key
   * @returns {Promise<Object>} Copy result
   */
  async copyDocument(sourceKey, destinationKey) {
    try {
      const params = {
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey
      };

      const result = await this.s3.copyObject(params).promise();

      logger.info('Document copied in S3', {
        sourceKey,
        destinationKey
      });

      return {
        success: true,
        etag: result.CopyObjectResult.ETag
      };

    } catch (error) {
      logger.error('S3 copy failed:', {
        error: error.message,
        sourceKey,
        destinationKey
      });
      throw new Error(`S3 copy failed: ${error.message}`);
    }
  }

  /**
   * Generate S3 key for document
   * @param {string} companyId - Company ID
   * @param {string} documentId - Document ID
   * @param {string} format - File format
   * @returns {string} S3 key
   */
  generateDocumentKey(companyId, documentId, format = 'pdf') {
    const timestamp = new Date().toISOString().split('T')[0];
    return `documents/${companyId}/${timestamp}/${documentId}.${format.toLowerCase()}`;
  }
}

module.exports = new S3Service();
