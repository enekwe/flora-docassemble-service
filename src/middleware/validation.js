const { body, validationResult } = require('express-validator');
const logger = require('../config/logger');

/**
 * Validation Middleware
 */

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    logger.warn('Validation failed', {
      errors: errors.array(),
      body: req.body
    });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  next();
};

/**
 * Validate document generation request
 */
const validateDocumentGeneration = [
  body('templateId')
    .notEmpty()
    .withMessage('Template ID is required')
    .isString()
    .withMessage('Template ID must be a string'),

  body('companyId')
    .notEmpty()
    .withMessage('Company ID is required')
    .isString()
    .withMessage('Company ID must be a string'),

  body('title')
    .notEmpty()
    .withMessage('Document title is required')
    .isString()
    .withMessage('Title must be a string')
    .isLength({ max: 200 })
    .withMessage('Title must not exceed 200 characters'),

  body('documentType')
    .notEmpty()
    .withMessage('Document type is required')
    .isIn([
      '83B_ELECTION',
      'OPERATING_AGREEMENT',
      'EMPLOYMENT_AGREEMENT',
      'STOCK_PURCHASE_AGREEMENT',
      'CUSTOM'
    ])
    .withMessage('Invalid document type'),

  body('inputData')
    .notEmpty()
    .withMessage('Input data is required')
    .isObject()
    .withMessage('Input data must be an object'),

  body('format')
    .optional()
    .isIn(['PDF', 'DOCX', 'HTML'])
    .withMessage('Invalid format'),

  body('companyName')
    .optional()
    .isString()
    .withMessage('Company name must be a string'),

  body('studioCompanyId')
    .optional()
    .isString()
    .withMessage('Studio company ID must be a string'),

  handleValidationErrors
];

/**
 * Validate template creation request
 */
const validateTemplateCreation = [
  body('name')
    .notEmpty()
    .withMessage('Template name is required')
    .isString()
    .withMessage('Name must be a string')
    .isLength({ max: 200 })
    .withMessage('Name must not exceed 200 characters'),

  body('documentType')
    .notEmpty()
    .withMessage('Document type is required')
    .isIn([
      '83B_ELECTION',
      'OPERATING_AGREEMENT',
      'EMPLOYMENT_AGREEMENT',
      'STOCK_PURCHASE_AGREEMENT',
      'CUSTOM'
    ])
    .withMessage('Invalid document type'),

  body('yamlContent')
    .notEmpty()
    .withMessage('YAML content is required')
    .isString()
    .withMessage('YAML content must be a string'),

  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string'),

  body('category')
    .optional()
    .isIn(['FORMATION', 'EQUITY', 'EMPLOYMENT', 'COMPLIANCE', 'CUSTOM'])
    .withMessage('Invalid category'),

  body('jurisdiction')
    .optional()
    .isArray()
    .withMessage('Jurisdiction must be an array'),

  body('fields')
    .optional()
    .isArray()
    .withMessage('Fields must be an array'),

  body('outputFormats')
    .optional()
    .isArray()
    .withMessage('Output formats must be an array'),

  handleValidationErrors
];

/**
 * Validate UUID format
 */
const validateUUID = (paramName) => {
  return (req, res, next) => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(uuid)) {
      return res.status(400).json({
        success: false,
        error: `Invalid ${paramName} format`
      });
    }

    next();
  };
};

module.exports = {
  validateDocumentGeneration,
  validateTemplateCreation,
  validateUUID,
  handleValidationErrors
};
