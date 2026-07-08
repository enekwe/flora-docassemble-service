const express = require('express');
const router = express.Router();
const documentRoutes = require('./documentRoutes');
const templateRoutes = require('./templateRoutes');

/**
 * Main Routes
 */

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'flora-docassemble-service',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// API routes
router.use('/api/documents', documentRoutes);
router.use('/api/templates', templateRoutes);

// Root endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'Flora DocAssemble Service',
    version: '1.0.0',
    description: 'Document generation microservice using DocAssemble',
    endpoints: {
      health: '/health',
      documents: '/api/documents',
      templates: '/api/templates'
    }
  });
});

module.exports = router;
