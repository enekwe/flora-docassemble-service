const axios = require('axios');
const FormData = require('form-data');
const logger = require('../config/logger');

/**
 * DocAssemble Client
 * Real implementation for DocAssemble REST API integration
 */
class DocAssembleClient {
  constructor() {
    this.baseURL = process.env.DOCASSEMBLE_URL || 'https://docassemble.org';
    this.apiKey = process.env.DOCASSEMBLE_API_KEY;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-API-Key': this.apiKey
      },
      timeout: 60000 // 60 seconds for document generation
    });

    logger.info('DocAssemble client initialized', {
      baseURL: this.baseURL
    });
  }

  /**
   * Generate document using DocAssemble API
   * @param {string} templatePath - Path to YAML template
   * @param {Object} inputData - Form data for document generation
   * @param {string} outputFormat - Output format (pdf, docx, html)
   * @returns {Promise<Buffer>} Generated document buffer
   */
  async generateDocument(templatePath, inputData, outputFormat = 'pdf') {
    try {
      logger.info('Generating document via DocAssemble', {
        templatePath,
        outputFormat
      });

      // DocAssemble REST API endpoint for document generation
      // Reference: https://docassemble.org/docs/api.html
      const response = await this.client.post('/api/session/question', {
        i: templatePath, // Interview/template path
        variables: inputData, // Input variables
        format: outputFormat
      }, {
        responseType: 'arraybuffer'
      });

      logger.info('Document generated successfully', {
        templatePath,
        size: response.data.length
      });

      return Buffer.from(response.data);

    } catch (error) {
      logger.error('DocAssemble document generation failed:', {
        error: error.message,
        templatePath,
        response: error.response?.data
      });
      throw new Error(`Document generation failed: ${error.message}`);
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
   * Get session status for document generation
   * @param {string} sessionId - DocAssemble session ID
   * @returns {Promise<Object>} Session status
   */
  async getSessionStatus(sessionId) {
    try {
      const response = await this.client.get(`/api/session/${sessionId}`);

      return {
        status: response.data.status,
        progress: response.data.progress,
        error: response.data.error,
        result: response.data.result
      };

    } catch (error) {
      logger.error('Failed to get session status:', {
        error: error.message,
        sessionId
      });
      throw new Error(`Session status check failed: ${error.message}`);
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
