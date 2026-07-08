const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { authenticate } = require('../middleware/auth');
const { validateTemplateCreation } = require('../middleware/validation');

/**
 * Template Routes
 */

// List all templates
router.get(
  '/',
  authenticate,
  templateController.listTemplates
);

// Get template by ID
router.get(
  '/:templateId',
  authenticate,
  templateController.getTemplate
);

// Get templates by document type
router.get(
  '/type/:documentType',
  authenticate,
  templateController.getTemplatesByType
);

// Create custom template
router.post(
  '/',
  authenticate,
  validateTemplateCreation,
  templateController.createTemplate
);

// Update template
router.put(
  '/:templateId',
  authenticate,
  templateController.updateTemplate
);

// Delete/deactivate template
router.delete(
  '/:templateId',
  authenticate,
  templateController.deleteTemplate
);

module.exports = router;
