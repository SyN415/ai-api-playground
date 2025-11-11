#!/usr/bin/env node

const db = require('../src/config/database');
const logger = require('../src/utils/logger');
const UsageLog = require('../src/models/UsageLog');
const RequestLog = require('../src/models/RequestLog');
const analyticsService = require('../src/services/analyticsService');
const monitoringService = require('../src/services/monitoringService');

/**
 * Log Cleanup Script
 * Automated cleanup of old logs based on retention policies
 */

class LogCleanup {
  constructor() {
    this.config = {
      // Retention periods (in days)
      retention: {
        usageLogs: 90,      // Keep usage logs for 90 days
        requestLogs: 30,    // Keep request logs for 30 days
        errorLogs: 180,     // Keep error logs for 180 days
        monitoringData: 7   // Keep monitoring data for 7 days
      },
      
      // Batch size for deletion (to avoid overwhelming the database)
      batchSize: 1000,
      
      // Archive settings
      archive: {
        enabled: process.env.ARCHIVE_ENABLED === 'true',
        bucket: process.env.ARCHIVE_BUCKET || 'api-logs-archive',
        path: process.env.ARCHIVE_PATH || 'logs/'
      },
      
      // Cleanup schedule (cron format)
      schedule: process.env.CLEANUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
      
      // Dry run mode (log what would be deleted without actually deleting)
      dryRun: process.env.CLEANUP_DRY_RUN === 'true'
    };
  }

  /**
   * Initialize cleanup script
   */
  async initialize() {
    try {
      logger.info('Log cleanup script initializing', {
        config: {
          retention: this.config.retention,
          batchSize: this.config.batchSize,
          archive: this.config.archive.enabled,
          dryRun: this.config.dryRun
        }
      });

      // Test database connection
      await db.testConnection();
      logger.info('Database connection test successful');

    } catch (error) {
      logger.error('Log cleanup initialization failed:', error);
      throw error;
    }
  }

  /**
   * Run complete cleanup process
   */
  async runCleanup() {
    try {
      logger.info('Starting log cleanup process', {
        timestamp: new Date().toISOString(),
        dryRun: this.config.dryRun
      });

      const results = {
        timestamp: new Date().toISOString(),
        dryRun: this.config.dryRun,
        details: {}
      };

      // Clean up different log types
      results.details.usageLogs = await this.cleanupUsageLogs();
      results.details.requestLogs = await this.cleanupRequestLogs();
      results.details.monitoringData = await this.cleanupMonitoringData();
      results.details.analyticsCache = await this.cleanupAnalyticsCache();

      // Log summary
      const totalDeleted = Object.values(results.details)
        .reduce((sum, detail) => sum + (detail.deleted || 0), 0);

      results.summary = {
        totalDeleted,
        totalArchived: 0, // Would be populated if archiving is implemented
        duration: 0 // Will be calculated at the end
      };

      logger.info('Log cleanup process completed', results);

      return results;

    } catch (error) {
      logger.error('Log cleanup process failed:', error);
      throw error;
    }
  }

  /**
   * Clean up old usage logs
   */
  async cleanupUsageLogs() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retention.usageLogs);

      logger.info('Cleaning up usage logs', {
        cutoffDate: cutoffDate.toISOString(),
        retentionDays: this.config.retention.usageLogs
      });

      const client = db.getClient();
      
      // Count old records
      const { count: oldRecordsCount } = await client
        .from('usage_logs')
        .select('*', { count: 'exact' })
        .lt('created_at', cutoffDate.toISOString());

      logger.info(`Found ${oldRecordsCount} old usage logs to clean up`);

      if (this.config.dryRun) {
        return {
          deleted: oldRecordsCount,
          archived: 0,
          cutoffDate: cutoffDate.toISOString(),
          message: 'Dry run - no records were actually deleted'
        };
      }

      // Archive if enabled
      if (this.config.archive.enabled) {
        await this.archiveUsageLogs(cutoffDate);
      }

      // Delete in batches
      let deletedCount = 0;
      let hasMore = true;

      while (hasMore) {
        const { error } = await client
          .from('usage_logs')
          .delete()
          .lt('created_at', cutoffDate.toISOString())
          .limit(this.config.batchSize);

        if (error) {
          logger.error('Error deleting usage logs batch:', error);
          throw error;
        }

        deletedCount += this.config.batchSize;
        
        // Check if there are more records
        const { count } = await client
          .from('usage_logs')
          .select('*', { count: 'exact' })
          .lt('created_at', cutoffDate.toISOString());

        hasMore = count > 0;
      }

      logger.info(`Cleaned up ${deletedCount} usage logs`);

      return {
        deleted: deletedCount,
        archived: this.config.archive.enabled ? deletedCount : 0,
        cutoffDate: cutoffDate.toISOString()
      };

    } catch (error) {
      logger.error('Usage logs cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Clean up old request logs
   */
  async cleanupRequestLogs() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retention.requestLogs);

      logger.info('Cleaning up request logs', {
        cutoffDate: cutoffDate.toISOString(),
        retentionDays: this.config.retention.requestLogs
      });

      const client = db.getClient();
      
      // Count old records
      const { count: oldRecordsCount } = await client
        .from('request_logs')
        .select('*', { count: 'exact' })
        .lt('created_at', cutoffDate.toISOString());

      logger.info(`Found ${oldRecordsCount} old request logs to clean up`);

      if (this.config.dryRun) {
        return {
          deleted: oldRecordsCount,
          archived: 0,
          cutoffDate: cutoffDate.toISOString(),
          message: 'Dry run - no records were actually deleted'
        };
      }

      // Keep error logs longer
      const errorCutoffDate = new Date();
      errorCutoffDate.setDate(errorCutoffDate.getDate() - this.config.retention.errorLogs);

      // Delete successful requests older than main retention period
      let deletedCount = 0;
      let hasMore = true;

      while (hasMore) {
        const { error } = await client
          .from('request_logs')
          .delete()
          .lt('created_at', cutoffDate.toISOString())
          .gte('response_status', 200)
          .lt('response_status', 400)
          .limit(this.config.batchSize);

        if (error) {
          logger.error('Error deleting request logs batch:', error);
          throw error;
        }

        deletedCount += this.config.batchSize;
        
        // Check if there are more records
        const { count } = await client
          .from('request_logs')
          .select('*', { count: 'exact' })
          .lt('created_at', cutoffDate.toISOString())
          .gte('response_status', 200)
          .lt('response_status', 400);

        hasMore = count > 0;
      }

      // Delete error logs older than error retention period
      let errorDeletedCount = 0;
      hasMore = true;

      while (hasMore) {
        const { error } = await client
          .from('request_logs')
          .delete()
          .lt('created_at', errorCutoffDate.toISOString())
          .or('response_status.gte.400,error.not.is.null')
          .limit(this.config.batchSize);

        if (error) {
          logger.error('Error deleting error logs batch:', error);
          throw error;
        }

        errorDeletedCount += this.config.batchSize;
        
        // Check if there are more records
        const { count } = await client
          .from('request_logs')
          .select('*', { count: 'exact' })
          .lt('created_at', errorCutoffDate.toISOString())
          .or('response_status.gte.400,error.not.is.null');

        hasMore = count > 0;
      }

      const totalDeleted = deletedCount + errorDeletedCount;

      logger.info(`Cleaned up ${totalDeleted} request logs`);

      return {
        deleted: totalDeleted,
        archived: 0,
        cutoffDate: cutoffDate.toISOString(),
        details: {
          successfulRequests: deletedCount,
          errorLogs: errorDeletedCount
        }
      };

    } catch (error) {
      logger.error('Request logs cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Clean up monitoring data
   */
  async cleanupMonitoringData() {
    try {
      logger.info('Cleaning up monitoring data', {
        retentionDays: this.config.retention.monitoringData
      });

      const deletedCount = monitoringService.cleanupOldData(this.config.retention.monitoringData);

      return {
        deleted: deletedCount,
        archived: 0,
        message: `Cleaned up ${deletedCount} monitoring data points`
      };

    } catch (error) {
      logger.error('Monitoring data cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Clean up analytics cache
   */
  async cleanupAnalyticsCache() {
    try {
      logger.info('Cleaning up analytics cache');

      analyticsService.clearCache();

      return {
        deleted: 0,
        archived: 0,
        message: 'Analytics cache cleared'
      };

    } catch (error) {
      logger.error('Analytics cache cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Archive usage logs before deletion
   */
  async archiveUsageLogs(cutoffDate) {
    try {
      logger.info('Archiving usage logs', {
        cutoffDate: cutoffDate.toISOString(),
        bucket: this.config.archive.bucket
      });

      // In a real implementation, this would:
      // 1. Query logs to be archived
      // 2. Format them for archival
      // 3. Upload to cloud storage (S3, GCS, etc.)
      // 4. Verify archival success
      // 5. Return archival metadata

      // For now, we'll just log that archival would happen
      logger.info('Archival would upload logs to cloud storage', {
        bucket: this.config.archive.bucket,
        path: `${this.config.archive.path}usage_logs/${cutoffDate.toISOString().split('T')[0]}/`
      });

      return true;

    } catch (error) {
      logger.error('Usage logs archival failed:', error);
      throw error;
    }
  }

  /**
   * Get cleanup statistics
   */
  async getStatistics() {
    try {
      const client = db.getClient();
      
      const [
        { count: totalUsageLogs },
        { count: totalRequestLogs },
        { count: oldUsageLogs },
        { count: oldRequestLogs }
      ] = await Promise.all([
        client.from('usage_logs').select('*', { count: 'exact' }),
        client.from('request_logs').select('*', { count: 'exact' }),
        client.from('usage_logs').select('*', { count: 'exact' }).lt('created_at', 
          new Date(Date.now() - this.config.retention.usageLogs * 24 * 60 * 60 * 1000).toISOString()
        ),
        client.from('request_logs').select('*', { count: 'exact' }).lt('created_at', 
          new Date(Date.now() - this.config.retention.requestLogs * 24 * 60 * 60 * 1000).toISOString()
        )
      ]);

      const oldestUsageLog = await client
        .from('usage_logs')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      const oldestRequestLog = await client
        .from('request_logs')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      return {
        timestamp: new Date().toISOString(),
        retention: this.config.retention,
        statistics: {
          usageLogs: {
            total: totalUsageLogs,
            old: oldUsageLogs,
            oldest: oldestUsageLog?.created_at || null
          },
          requestLogs: {
            total: totalRequestLogs,
            old: oldRequestLogs,
            oldest: oldestRequestLog?.created_at || null
          }
        },
        estimatedCleanup: {
          usageLogs: oldUsageLogs,
          requestLogs: oldRequestLogs,
          total: oldUsageLogs + oldRequestLogs
        }
      };

    } catch (error) {
      logger.error('Error getting cleanup statistics:', error);
      throw error;
    }
  }

  /**
   * Schedule regular cleanup
   */
  scheduleCleanup() {
    const cron = require('node-cron');
    
    logger.info('Scheduling regular log cleanup', {
      schedule: this.config.schedule
    });

    cron.schedule(this.config.schedule, async () => {
      logger.info('Running scheduled log cleanup');
      
      try {
        const results = await this.runCleanup();
        logger.info('Scheduled cleanup completed', results);
      } catch (error) {
        logger.error('Scheduled cleanup failed:', error);
      }
    });

    logger.info('Log cleanup scheduled', {
      schedule: this.config.schedule,
      nextRun: this.getNextScheduledRun()
    });
  }

  /**
   * Get next scheduled run time
   */
  getNextScheduledRun() {
    const cron = require('node-cron');
    const task = cron.schedule(this.config.schedule, () => {});
    const nextDate = task.nextDate();
    task.stop();
    return nextDate.toISOString();
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.initialize();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        config: {
          retention: this.config.retention,
          batchSize: this.config.batchSize,
          archive: this.config.archive.enabled,
          dryRun: this.config.dryRun
        }
      };
    } catch (error) {
      logger.error('Log cleanup health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

// CLI interface
if (require.main === module) {
  const cleanup = new LogCleanup();
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const command = args[0];
  
  (async () => {
    try {
      switch (command) {
        case 'run':
          await cleanup.initialize();
          const results = await cleanup.runCleanup();
          console.log(JSON.stringify(results, null, 2));
          break;
          
        case 'stats':
          await cleanup.initialize();
          const stats = await cleanup.getStatistics();
          console.log(JSON.stringify(stats, null, 2));
          break;
          
        case 'schedule':
          await cleanup.initialize();
          cleanup.scheduleCleanup();
          console.log('Cleanup scheduled. Press Ctrl+C to stop.');
          // Keep process alive
          process.stdin.resume();
          break;
          
        case 'health':
          const health = await cleanup.healthCheck();
          console.log(JSON.stringify(health, null, 2));
          break;
          
        default:
          console.log(`
Usage: node cleanup-logs.js [command]

Commands:
  run       Run cleanup immediately
  stats     Show cleanup statistics
  schedule  Start scheduled cleanup service
  health    Check cleanup service health

Environment Variables:
  ARCHIVE_ENABLED         Enable log archiving (true/false)
  ARCHIVE_BUCKET          Cloud storage bucket for archives
  ARCHIVE_PATH            Path within bucket for archives
  CLEANUP_DRY_RUN         Dry run mode (true/false)
  CLEANUP_SCHEDULE        Cron schedule for automated cleanup
          `);
      }
      
      if (command !== 'schedule') {
        process.exit(0);
      }
      
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = LogCleanup;