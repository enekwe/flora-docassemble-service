/**
 * Flora DocAssemble Microservice
 * Handles document generation via DocAssemble API and S3 storage
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');
const routes = require('./routes');
const logger = require('./config/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3013;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Routes
app.use('/', routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Import and start sync service
    const syncService = require('./services/syncService');

    // Start background sync job (5 minute interval)
    if (process.env.ENABLE_SYNC_SERVICE !== 'false') {
      const syncIntervalMs = parseInt(process.env.SYNC_INTERVAL_MS) || 5 * 60 * 1000;
      syncService.startBackgroundSync(syncIntervalMs);
      logger.info('Sync service started', {
        intervalMs: syncIntervalMs,
        intervalMinutes: syncIntervalMs / 60000
      });
    } else {
      logger.info('Sync service disabled by configuration');
    }

    // Start listening
    app.listen(PORT, () => {
      logger.info(`Flora DocAssemble Service running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Database: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/flora-docassemble'}`);
      logger.info(`S3 Bucket: ${process.env.S3_BUCKET_NAME || 'flora-documents'}`);
      logger.info(`DocAssemble URL: ${process.env.DOCASSEMBLE_URL || 'https://docassemble.org'}`);
      logger.info(`Service Base URL: ${process.env.SERVICE_BASE_URL || 'http://localhost:3013'}`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  const syncService = require('./services/syncService');
  syncService.stopBackgroundSync();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  const syncService = require('./services/syncService');
  syncService.stopBackgroundSync();
  process.exit(0);
});

// Start the server
startServer();

module.exports = app; // For testing
