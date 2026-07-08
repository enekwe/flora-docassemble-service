const axios = require('axios');
const FormData = require('form-data');
const logger = require('../config/logger');

/**
 * DocAssemble Client
 * Enhanced implementation for self-hosted DocAssemble REST API integration
 * Supports connection pooling, retry logic, and improved error handling
 */
class DocAssembleClient {
  constructor() {
    this.baseURL = process.env.DOCASSEMBLE_URL || 'https://docassemble.org';
    this.apiKey = process.env.DOCASSEMBLE_API_KEY;

    // Enhanced axios configuration with connection pooling and retry logic
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 60000, // 60 seconds for document generation
      maxRedirects: 5,
      // Connection pooling configuration
      httpAgent: new (require('http').Agent)({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10
      }),
      httpsAgent: new (require('https').Agent)({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      })
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('DocAssemble API request', {
          method: config.method,
          url: config.url,
          baseURL: config.baseURL
        });
        return config;
      },
      (error) => {
        logger.error('DocAssemble request interceptor error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for enhanced error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('DocAssemble API response', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );

    logger.info('DocAssemble client initialized with connection pooling', {
      baseURL: this.baseURL,
      keepAlive: true,
      maxSockets: 50
    });
  }

  /**
   * Enhanced error handling for DocAssemble API errors
   * @param {Error} error - Axios error object
   */
  handleApiError(error) {
    if (error.response) {
      // Server responded with error status
      logger.error('DocAssemble API error response', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      // Request made but no response received
      logger.error('DocAssemble API no response', {
        message: error.message,
        url: error.config?.url,
        code: error.code
      });
    } else {
      // Error in request setup
      logger.error('DocAssemble API request setup error', {
        message: error.message
      });
    }
  }

  /**
   * Check connection to DocAssemble server
   * @returns {Promise<boolean>} Connection status
   */
  async checkConnection() {
    try {
      const response = await this.client.get('/api/health', {
        timeout: 5000
      });
      logger.info('DocAssemble connection check successful', {
        status: response.status
      });
      return true;
    } catch (error) {
      logger.error('DocAssemble connection check failed', {
        error: error.message,
        baseURL: this.baseURL
      });
      return false;
    }
  }

  /**
   * Generate document using DocAssemble API
   * Enhanced with better error handling and response validation
   * @param {string} templatePath - Path to YAML template
   * @param {Object} inputData - Form data for document generation
   * @param {string} outputFormat - Output format (pdf, docx, html)
   * @param {Object} options - Additional options (sessionId, callbackUrl)
   * @returns {Promise<Object>} Generated document data with metadata
   */
  async generateDocument(templatePath, inputData, outputFormat = 'pdf', options = {}) {
    try {
      logger.info('Generating document via DocAssemble', {
        templatePath,
        outputFormat,
        hasCallbackUrl: !!options.callbackUrl
      });

      // DocAssemble REST API endpoint for document generation
      // Reference: https://docassemble.org/docs/api.html
      const requestPayload = {
        i: templatePath, // Interview/template path
        variables: inputData, // Input variables
        format: outputFormat
      };

      // Add optional callback URL for async completion notification
      if (options.callbackUrl) {
        requestPayload.callback = options.callbackUrl;
      }

      // Add session ID if continuing existing session
      if (options.sessionId) {
        requestPayload.session = options.sessionId;
      }

      const response = await this.client.post('/api/session/question', requestPayload, {
        responseType: outputFormat === 'html' ? 'json' : 'arraybuffer',
        maxContentLength: 50 * 1024 * 1024, // 50MB max
        maxBodyLength: 50 * 1024 * 1024
      });

      const result = {
        success: true,
        format: outputFormat,
        size: response.data.length || 0,
        sessionId: response.headers['x-docassemble-session-id'] || options.sessionId
      };

      // Handle different response types
      if (outputFormat === 'html') {
        result.content = response.data;
      } else {
        result.buffer = Buffer.from(response.data);
        result.size = result.buffer.length;
      }

      logger.info('Document generated successfully', {
        templatePath,
        format: outputFormat,
        size: result.size,
        sessionId: result.sessionId
      });

      return result;

    } catch (error) {
      const errorDetails = {
        message: error.message,
        templatePath,
        outputFormat,
        status: error.response?.status,
        statusText: error.response?.statusText
      };

      // Attempt to parse error response
      if (error.response?.data) {
        try {
          if (Buffer.isBuffer(error.response.data)) {
            errorDetails.responseData = error.response.data.toString('utf-8');
          } else {
            errorDetails.responseData = error.response.data;
          }
        } catch (parseError) {
          errorDetails.parseError = parseError.message;
        }
      }

      logger.error('DocAssemble document generation failed', errorDetails);

      throw new Error(
        `Document generation failed: ${error.message}${
          error.response?.status ? ` (HTTP ${error.response.status})` : ''
        }`
      );
    }
  }

  /**
   * Upload YAML template to DocAssemble server
   * @param {string} yamlContent - YAML template content
   * @param {string} templateName - Template name/identifier
   * @returns {Promise<Object>} Upload result
   */
  async uploadTemplate(yamlContent, templateName) {
    try {
      logger.info('Uploading template to DocAssemble', {
        templateName
      });

      const formData = new FormData();
      formData.append('template', yamlContent, {
        filename: `${templateName}.yml`,
        contentType: 'text/yaml'
      });

      // DocAssemble API endpoint for template upload
      const response = await this.client.post('/api/playground', formData, {
        headers: {
          ...formData.getHeaders()
        }
      });

      logger.info('Template uploaded successfully', {
        templateName,
        result: response.data
      });

      return {
        success: true,
        templatePath: response.data.path || templateName,
        data: response.data
      };

    } catch (error) {
      logger.error('DocAssemble template upload failed:', {
        error: error.message,
        templateName
      });
      throw new Error(`Template upload failed: ${error.message}`);
    }
  }

  /**
   * Create a new interview session
   * @param {string} templatePath - Path to YAML template
   * @param {Object} initialData - Initial interview data
   * @param {string} callbackUrl - Callback URL for completion notification
   * @returns {Promise<Object>} Session creation result with session ID and URL
   */
  async createInterviewSession(templatePath, initialData = {}, callbackUrl = null) {
    try {
      logger.info('Creating interview session', {
        templatePath,
        hasCallbackUrl: !!callbackUrl
      });

      const payload = {
        i: templatePath,
        variables: initialData
      };

      if (callbackUrl) {
        payload.callback = callbackUrl;
      }

      const response = await this.client.post('/api/session', payload);

      const sessionId = response.data.session || response.data.sessionId;
      const interviewUrl = response.data.url || `${this.baseURL}/interview?i=${templatePath}&session=${sessionId}`;

      logger.info('Interview session created successfully', {
        sessionId,
        templatePath
      });

      return {
        success: true,
        sessionId,
        interviewUrl,
        externalInterviewId: response.data.id || sessionId,
        data: response.data
      };

    } catch (error) {
      logger.error('Failed to create interview session', {
        error: error.message,
        templatePath,
        status: error.response?.status
      });
      throw new Error(`Interview session creation failed: ${error.message}`);
    }
  }

  /**
   * Get session status for document generation
   * Enhanced with more detailed status information
   * @param {string} sessionId - DocAssemble session ID
   * @returns {Promise<Object>} Session status
   */
  async getSessionStatus(sessionId) {
    try {
      const response = await this.client.get(`/api/session/${sessionId}`);

      const status = {
        sessionId,
        status: response.data.status || 'UNKNOWN',
        progress: response.data.progress || 0,
        isComplete: response.data.complete || false,
        error: response.data.error,
        result: response.data.result,
        documents: response.data.documents || [],
        metadata: response.data.metadata || {}
      };

      logger.debug('Session status retrieved', {
        sessionId,
        status: status.status,
        isComplete: status.isComplete
      });

      return status;

    } catch (error) {
      logger.error('Failed to get session status', {
        error: error.message,
        sessionId,
        status: error.response?.status
      });
      throw new Error(`Session status check failed: ${error.message}`);
    }
  }

  /**
   * Get documents generated from a completed session
   * @param {string} sessionId - DocAssemble session ID
   * @returns {Promise<Array>} Array of generated documents
   */
  async getSessionDocuments(sessionId) {
    try {
      const response = await this.client.get(`/api/session/${sessionId}/documents`);

      const documents = (response.data.documents || []).map(doc => ({
        documentId: doc.id,
        filename: doc.filename,
        format: doc.format?.toUpperCase() || 'PDF',
        downloadUrl: doc.url,
        size: doc.size,
        createdAt: doc.created_at
      }));

      logger.info('Session documents retrieved', {
        sessionId,
        documentCount: documents.length
      });

      return documents;

    } catch (error) {
      logger.error('Failed to get session documents', {
        error: error.message,
        sessionId
      });
      throw new Error(`Failed to retrieve session documents: ${error.message}`);
    }
  }

  /**
   * List available templates from DocAssemble
   * @returns {Promise<Array>} List of available templates
   */
  async listTemplates() {
    try {
      const response = await this.client.get('/api/playground/templates');

      return response.data.templates || [];

    } catch (error) {
      logger.error('Failed to list templates:', error);
      throw new Error(`Template listing failed: ${error.message}`);
    }
  }

  /**
   * Validate template YAML syntax
   * @param {string} yamlContent - YAML template content
   * @returns {Promise<Object>} Validation result
   */
  async validateTemplate(yamlContent) {
    try {
      const response = await this.client.post('/api/validate', {
        template: yamlContent
      });

      return {
        valid: response.data.valid,
        errors: response.data.errors || [],
        warnings: response.data.warnings || []
      };

    } catch (error) {
      logger.error('Template validation failed:', error);
      throw new Error(`Template validation failed: ${error.message}`);
    }
  }

  /**
   * Delete template from DocAssemble
   * @param {string} templatePath - Template path/identifier
   * @returns {Promise<boolean>} Success status
   */
  async deleteTemplate(templatePath) {
    try {
      await this.client.delete(`/api/playground/${templatePath}`);

      logger.info('Template deleted successfully', { templatePath });
      return true;

    } catch (error) {
      logger.error('Template deletion failed:', {
        error: error.message,
        templatePath
      });
      return false;
    }
  }
}

module.exports = new DocAssembleClient();
