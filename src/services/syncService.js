const Interview = require('../models/Interview');
const docassembleClient = require('./docassembleClient');
const logger = require('../config/logger');

/**
 * Sync Service
 * Handles synchronization between MongoDB and self-hosted DocAssemble
 * Implements retry logic with exponential backoff for failed syncs
 */
class SyncService {
  constructor() {
    this.isRunning = false;
    this.syncInterval = null;
    this.retryDelays = [
      1 * 60 * 1000,      // 1 minute
      5 * 60 * 1000,      // 5 minutes
      30 * 60 * 1000,     // 30 minutes
      2 * 60 * 60 * 1000, // 2 hours
      24 * 60 * 60 * 1000 // 24 hours
    ];
  }

  /**
   * Start background sync job
   * Processes failed syncs periodically
   * @param {number} intervalMs - Interval in milliseconds (default: 5 minutes)
   */
  startBackgroundSync(intervalMs = 5 * 60 * 1000) {
    if (this.isRunning) {
      logger.warn('Sync service already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting sync service background job', {
      intervalMs,
      intervalMinutes: intervalMs / 60000
    });

    // Run immediately on start
    this.processFailedSyncs().catch(error => {
      logger.error('Initial sync processing failed', { error: error.message });
    });

    // Then run periodically
    this.syncInterval = setInterval(() => {
      this.processFailedSyncs().catch(error => {
        logger.error('Scheduled sync processing failed', { error: error.message });
      });
    }, intervalMs);
  }

  /**
   * Stop background sync job
   */
  stopBackgroundSync() {
    if (!this.isRunning) {
      logger.warn('Sync service not running');
      return;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.isRunning = false;
    logger.info('Sync service stopped');
  }

  /**
   * Process failed syncs with exponential backoff
   * Finds interviews with FAILED or RETRY sync status and attempts to sync them
   * @returns {Promise<Object>} Sync processing result
   */
  async processFailedSyncs() {
    try {
      logger.info('Processing failed syncs');

      // Find interviews with failed syncs
      const failedInterviews = await Interview.findFailedSyncs(100);

      if (failedInterviews.length === 0) {
        logger.debug('No failed syncs to process');
        return {
          success: true,
          processed: 0,
          retried: 0,
          succeeded: 0,
          failed: 0
        };
      }

      logger.info('Found failed syncs to process', {
        count: failedInterviews.length
      });

      const results = {
        processed: 0,
        retried: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0
      };

      for (const interview of failedInterviews) {
        results.processed++;

        try {
          // Check if enough time has passed for retry based on retry count
          const retryCount = interview.syncErrors.length;
          const shouldRetry = this.shouldRetrySync(interview, retryCount);

          if (!shouldRetry) {
            results.skipped++;
            logger.debug('Skipping interview - not ready for retry', {
              interviewId: interview.interviewId,
              retryCount,
              lastSyncAt: interview.lastSyncAt
            });
            continue;
          }

          // Attempt to sync
          results.retried++;
          await this.retryInterviewSync(interview);
          results.succeeded++;

          logger.info('Interview sync retry succeeded', {
            interviewId: interview.interviewId,
            retryCount
          });

        } catch (error) {
          results.failed++;
          logger.error('Interview sync retry failed', {
            interviewId: interview.interviewId,
            error: error.message
          });

          // Mark sync as failed
          await interview.markSyncFailed(error, {
            retryAttempt: true,
            timestamp: new Date()
          });
        }
      }

      logger.info('Failed syncs processing completed', results);

      return {
        success: true,
        ...results
      };

    } catch (error) {
      logger.error('Failed syncs processing error', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Determine if interview should be retried based on exponential backoff
   * @param {Object} interview - Interview document
   * @param {number} retryCount - Number of previous retry attempts
   * @returns {boolean} Whether to retry
   */
  shouldRetrySync(interview, retryCount) {
    // If marked as RETRY (exhausted retries), only retry once per day
    if (interview.syncStatus === 'RETRY') {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return !interview.lastSyncAt || interview.lastSyncAt < oneDayAgo;
    }

    // Get delay for this retry attempt
    const delayIndex = Math.min(retryCount, this.retryDelays.length - 1);
    const delay = this.retryDelays[delayIndex];

    // Check if enough time has passed
    if (!interview.lastSyncAt) {
      return true; // No previous sync attempt, retry now
    }

    const nextRetryTime = new Date(interview.lastSyncAt.getTime() + delay);
    return new Date() >= nextRetryTime;
  }

  /**
   * Retry syncing an interview to DocAssemble
   * @param {Object} interview - Interview document
   * @returns {Promise<Object>} Sync result
   */
  async retryInterviewSync(interview) {
    logger.info('Retrying interview sync', {
      interviewId: interview.interviewId,
      portfolioCompanyId: interview.portfolioCompanyId
    });

    // Check if interview already has external ID (was synced before)
    if (interview.externalInterviewId && interview.sessionId) {
      // Check status in DocAssemble
      const status = await docassembleClient.getSessionStatus(interview.sessionId);

      if (status.isComplete) {
        // Interview completed, fetch documents
        const documents = await docassembleClient.getSessionDocuments(interview.sessionId);

        // Update interview
        await interview.markCompleted(status.result || {});

        for (const doc of documents) {
          await interview.addGeneratedDocument({
            documentId: doc.documentId,
            documentUrl: doc.downloadUrl,
            format: doc.format,
            fileSize: doc.size
          });
        }

        await interview.markSynced(interview.externalInterviewId);

        return {
          success: true,
          action: 'completed',
          documentCount: documents.length
        };
      } else {
        // Still in progress, just update sync status
        await interview.markSynced(interview.externalInterviewId);

        return {
          success: true,
          action: 'status_updated',
          status: status.status
        };
      }
    } else {
      // Interview was never synced, create session
      const callbackUrl = this.getCallbackUrl();

      const result = await docassembleClient.createInterviewSession(
        interview.templateId,
        interview.inputData,
        callbackUrl
      );

      // Update interview with session info
      interview.externalInterviewId = result.externalInterviewId;
      interview.sessionId = result.sessionId;
      interview.interviewUrl = result.interviewUrl;
      interview.status = 'IN_PROGRESS';

      await interview.markSynced(result.externalInterviewId);

      return {
        success: true,
        action: 'session_created',
        sessionId: result.sessionId
      };
    }
  }

  /**
   * Manually retry sync for specific interview
   * Used by admin endpoint for troubleshooting
   * @param {string} interviewId - Interview ID
   * @returns {Promise<Object>} Sync result
   */
  async manualRetrySync(interviewId) {
    try {
      logger.info('Manual sync retry requested', { interviewId });

      const interview = await Interview.findOne({ interviewId });

      if (!interview) {
        throw new Error('Interview not found');
      }

      const result = await this.retryInterviewSync(interview);

      logger.info('Manual sync retry completed', {
        interviewId,
        success: result.success,
        action: result.action
      });

      return {
        success: true,
        interviewId,
        result
      };

    } catch (error) {
      logger.error('Manual sync retry failed', {
        interviewId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Retry all pending syncs
   * Creates sessions for interviews that were never synced
   * @param {number} limit - Maximum number to process
   * @returns {Promise<Object>} Processing result
   */
  async processPendingSyncs(limit = 50) {
    try {
      logger.info('Processing pending syncs', { limit });

      const pendingInterviews = await Interview.findPendingSyncs(limit);

      if (pendingInterviews.length === 0) {
        logger.debug('No pending syncs to process');
        return {
          success: true,
          processed: 0
        };
      }

      logger.info('Found pending syncs to process', {
        count: pendingInterviews.length
      });

      const results = {
        processed: 0,
        succeeded: 0,
        failed: 0
      };

      for (const interview of pendingInterviews) {
        results.processed++;

        try {
          await this.retryInterviewSync(interview);
          results.succeeded++;

        } catch (error) {
          results.failed++;
          logger.error('Pending sync failed', {
            interviewId: interview.interviewId,
            error: error.message
          });

          await interview.markSyncFailed(error);
        }
      }

      logger.info('Pending syncs processing completed', results);

      return {
        success: true,
        ...results
      };

    } catch (error) {
      logger.error('Pending syncs processing error', {
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get sync statistics
   * @returns {Promise<Object>} Sync statistics
   */
  async getSyncStatistics() {
    try {
      const stats = await Interview.aggregate([
        {
          $group: {
            _id: '$syncStatus',
            count: { $sum: 1 }
          }
        }
      ]);

      const statusCounts = {
        PENDING: 0,
        SYNCED: 0,
        FAILED: 0,
        RETRY: 0
      };

      stats.forEach(stat => {
        if (stat._id) {
          statusCounts[stat._id] = stat.count;
        }
      });

      // Get failed syncs by retry count
      const failedByRetry = await Interview.aggregate([
        {
          $match: {
            syncStatus: { $in: ['FAILED', 'RETRY'] }
          }
        },
        {
          $project: {
            retryCount: { $size: '$syncErrors' }
          }
        },
        {
          $group: {
            _id: '$retryCount',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      return {
        syncStatus: statusCounts,
        failedByRetryCount: failedByRetry,
        isRunning: this.isRunning
      };

    } catch (error) {
      logger.error('Failed to get sync statistics', {
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get callback URL for DocAssemble
   * @returns {string} Callback URL
   */
  getCallbackUrl() {
    const baseUrl = process.env.SERVICE_BASE_URL || 'http://localhost:3013';
    return `${baseUrl}/api/callbacks/docassemble`;
  }

  /**
   * Health check for sync service
   * @returns {Object} Health status
   */
  getHealthStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.syncInterval ? 5 * 60 * 1000 : null,
      retryDelays: this.retryDelays
    };
  }
}

module.exports = new SyncService();
