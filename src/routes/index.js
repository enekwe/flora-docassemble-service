const express = require('express');
const router = express.Router();
const documentRoutes = require('./documentRoutes');
const templateRoutes = require('./templateRoutes');
const callbackController = require('../controllers/callbackController');
const syncService = require('../services/syncService');
const logger = require('../config/logger');

/**
 * Main Routes
 * Enhanced with callback and sync endpoints for self-hosted DocAssemble integration
 */

// Health check
router.get('/health', async (req, res) => {
  try {
    const syncHealth = syncService.getHealthStatus();
    const syncStats = await syncService.getSyncStatistics();

    res.status(200).json({
      success: true,
      service: 'flora-docassemble-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      sync: {
        isRunning: syncHealth.isRunning,
        statistics: syncStats
      }
    });
  } catch (error) {
    logger.error('Health check error', { error: error.message });
    res.status(200).json({
      success: true,
      service: 'flora-docassemble-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      sync: {
        error: 'Failed to get sync statistics'
      }
    });
  }
});

// API routes
router.use('/api/documents', documentRoutes);
router.use('/api/templates', templateRoutes);

/**
 * Callback endpoints for self-hosted DocAssemble
 */

// DocAssemble completion callback
router.post(
  '/api/callbacks/docassemble',
  callbackController.handleCompletion.bind(callbackController)
);

// DocAssemble status update callback
router.post(
  '/api/callbacks/docassemble/status',
  callbackController.handleStatusUpdate.bind(callbackController)
);

/**
 * Sync management endpoints
 */

// Manual sync retry for specific interview
router.post('/api/sync/retry/:interviewId', async (req, res) => {
  try {
    const { interviewId } = req.params;

    logger.info('Manual sync retry requested via API', { interviewId });

    const result = await syncService.manualRetrySync(interviewId);

    res.status(200).json({
      success: true,
      message: 'Sync retry completed',
      data: result
    });

  } catch (error) {
    logger.error('Manual sync retry failed', {
      interviewId: req.params.interviewId,
      error: error.message
    });

    const statusCode = error.message === 'Interview not found' ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

// Retry all failed syncs
router.post('/api/sync/retry', async (req, res) => {
  try {
    logger.info('Bulk sync retry requested via API');

    const result = await syncService.processFailedSyncs();

    res.status(200).json({
      success: true,
      message: 'Failed syncs processing completed',
      data: result
    });

  } catch (error) {
    logger.error('Bulk sync retry failed', { error: error.message });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process pending syncs
router.post('/api/sync/pending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    logger.info('Process pending syncs requested via API', { limit });

    const result = await syncService.processPendingSyncs(limit);

    res.status(200).json({
      success: true,
      message: 'Pending syncs processing completed',
      data: result
    });

  } catch (error) {
    logger.error('Pending syncs processing failed', { error: error.message });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get sync statistics
router.get('/api/sync/stats', async (req, res) => {
  try {
    const stats = await syncService.getSyncStatistics();
    const health = syncService.getHealthStatus();

    res.status(200).json({
      success: true,
      data: {
        statistics: stats,
        service: health
      }
    });

  } catch (error) {
    logger.error('Failed to get sync statistics', { error: error.message });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'Flora DocAssemble Service',
    version: '1.0.0',
    description: 'Document generation microservice using self-hosted DocAssemble',
    endpoints: {
      health: '/health',
      documents: '/api/documents',
      templates: '/api/templates',
      callbacks: {
        completion: '/api/callbacks/docassemble',
        statusUpdate: '/api/callbacks/docassemble/status'
      },
      sync: {
        retryOne: '/api/sync/retry/:interviewId',
        retryAll: '/api/sync/retry',
        processPending: '/api/sync/pending',
        statistics: '/api/sync/stats'
      }
    }
  });
});

module.exports = router;
