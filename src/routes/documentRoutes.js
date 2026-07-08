const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');
const { validateDocumentGeneration } = require('../middleware/validation');

/**
 * Document Routes
 */

// Generate new document
router.post(
  '/generate',
  authenticate,
  validateDocumentGeneration,
  documentController.generateDocument
);

// Get document by ID
router.get(
  '/:documentId',
  authenticate,
  documentController.getDocument
);

// Get document download URL
router.get(
  '/:documentId/download',
  authenticate,
  documentController.getDownloadUrl
);

// List documents by company
router.get(
  '/company/:companyId',
  authenticate,
  documentController.listDocumentsByCompany
);

// Delete document
router.delete(
  '/:documentId',
  authenticate,
  documentController.deleteDocument
);

// Create new version of document
router.post(
  '/:documentId/version',
  authenticate,
  validateDocumentGeneration,
  documentController.createNewVersion
);

// Get statistics
router.get(
  '/stats/:companyId?',
  authenticate,
  documentController.getStatistics
);

module.exports = router;
