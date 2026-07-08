const Template = require('../models/Template');
const docassembleClient = require('../services/docassembleClient');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');
const yaml = require('js-yaml');

/**
 * Template Controller
 * Handles HTTP requests for template operations
 */
class TemplateController {
  /**
   * List all templates
   * GET /api/templates
   */
  async listTemplates(req, res) {
    try {
      const filters = {
        isActive: req.query.isActive !== 'false', // Default to active only
        documentType: req.query.documentType,
        category: req.query.category,
        isCustom: req.query.isCustom
      };

      const query = {};

      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      }

      if (filters.documentType) {
        query.documentType = filters.documentType;
      }

      if (filters.category) {
        query.category = filters.category;
      }

      if (filters.isCustom !== undefined) {
        query.isCustom = filters.isCustom === 'true';
      }

      const templates = await Template.find(query)
        .sort({ name: 1 })
        .select('-yamlContent'); // Exclude YAML content from list

      res.status(200).json({
        success: true,
        data: templates,
        count: templates.length
      });

    } catch (error) {
      logger.error('List templates API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get template by ID
   * GET /api/templates/:templateId
   */
  async getTemplate(req, res) {
    try {
      const { templateId } = req.params;

      const template = await Template.findOne({ templateId });

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      res.status(200).json({
        success: true,
        data: template
      });

    } catch (error) {
      logger.error('Get template API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get templates by document type
   * GET /api/templates/type/:documentType
   */
  async getTemplatesByType(req, res) {
    try {
      const { documentType } = req.params;

      const templates = await Template.find({
        documentType,
        isActive: true
      })
        .sort({ name: 1 })
        .select('-yamlContent');

      res.status(200).json({
        success: true,
        data: templates,
        count: templates.length
      });

    } catch (error) {
      logger.error('Get templates by type API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Create custom template
   * POST /api/templates
   */
  async createTemplate(req, res) {
    try {
      const {
        name,
        documentType,
        description,
        category,
        jurisdiction,
        yamlContent,
        fields,
        outputFormats
      } = req.body;

      const userId = req.user?.id || req.body.userId;

      // Validate YAML syntax
      try {
        yaml.load(yamlContent);
      } catch (yamlError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid YAML syntax',
          details: yamlError.message
        });
      }

      // Generate template ID
      const templateId = uuidv4();

      // Generate YAML file path
      const yamlFilePath = `custom/${templateId}.yml`;

      // Upload template to DocAssemble (optional, for validation)
      try {
        await docassembleClient.uploadTemplate(yamlContent, templateId);
      } catch (uploadError) {
        logger.warn('Failed to upload template to DocAssemble:', uploadError);
        // Continue anyway - template will be used from local storage
      }

      // Create template record
      const template = new Template({
        templateId,
        name,
        documentType,
        description,
        category,
        jurisdiction,
        yamlFilePath,
        yamlContent,
        fields,
        outputFormats: outputFormats || ['PDF'],
        isActive: true,
        isCustom: true,
        createdBy: userId
      });

      await template.save();

      logger.info('Custom template created', {
        templateId,
        name,
        userId
      });

      res.status(201).json({
        success: true,
        data: template
      });

    } catch (error) {
      logger.error('Create template API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Update template
   * PUT /api/templates/:templateId
   */
  async updateTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const updates = req.body;

      const template = await Template.findOne({ templateId });

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      // Only allow updating custom templates
      if (!template.isCustom) {
        return res.status(403).json({
          success: false,
          error: 'Cannot update built-in templates'
        });
      }

      // Validate YAML if provided
      if (updates.yamlContent) {
        try {
          yaml.load(updates.yamlContent);
        } catch (yamlError) {
          return res.status(400).json({
            success: false,
            error: 'Invalid YAML syntax',
            details: yamlError.message
          });
        }
      }

      // Update allowed fields
      const allowedUpdates = [
        'name',
        'description',
        'yamlContent',
        'fields',
        'outputFormats',
        'jurisdiction',
        'isActive'
      ];

      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          template[field] = updates[field];
        }
      });

      // Increment version
      template.version += 1;

      await template.save();

      logger.info('Template updated', {
        templateId,
        version: template.version
      });

      res.status(200).json({
        success: true,
        data: template
      });

    } catch (error) {
      logger.error('Update template API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Delete/deactivate template
   * DELETE /api/templates/:templateId
   */
  async deleteTemplate(req, res) {
    try {
      const { templateId } = req.params;

      const template = await Template.findOne({ templateId });

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Template not found'
        });
      }

      // Only allow deleting custom templates
      if (!template.isCustom) {
        return res.status(403).json({
          success: false,
          error: 'Cannot delete built-in templates'
        });
      }

      // Soft delete by marking as inactive
      template.isActive = false;
      await template.save();

      logger.info('Template deactivated', { templateId });

      res.status(200).json({
        success: true,
        message: 'Template deactivated successfully'
      });

    } catch (error) {
      logger.error('Delete template API error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new TemplateController();
