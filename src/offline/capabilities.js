// Offline-First Capabilities

const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const sqlite3 = require('better-sqlite3');
const { setupLogging } = require('../utils/logging');
const { paths } = require('../config/paths');
const { LanceDB } = require('lancejs');

const logger = setupLogging('offline-capabilities');

// Core Offline Features
class OfflineCapabilities {
  constructor() {
    this.db = null;
    this.vectorDB = null;
    this.syncState = {
      lastSync: null,
      syncInProgress: false,
      pendingChanges: new Set(),
      versionVector: new Map()
    };
    this.resourceMetrics = {
      storage: {
        quota: 1024 * 1024 * 1024, // 1GB default
        used: 0
      },
      cpu: {
        limit: 0.75, // 75% max CPU usage
        current: 0
      },
      memory: {
        limit: 512 * 1024 * 1024, // 512MB default
        used: 0
      }
    };
  }

  // Initialize offline capabilities
  async initialize() {
    try {
      // Initialize SQLite database
      this.db = new sqlite3(paths.db.main, {
        verbose: logger.debug
      });

      // Initialize vector database
      this.vectorDB = await LanceDB.connect(paths.db.vector);

      // Set up database schema
      await this.setupSchema();

      // Initialize resource monitoring
      this.startResourceMonitoring();

      logger.info('Offline capabilities initialized');
      return true;
    } catch (err) {
      logger.error('Failed to initialize offline capabilities:', err);
      throw err;
    }
  }

  // Set up database schema
  async setupSchema() {
    const schema = [
      `CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        vector BLOB,
        created_at INTEGER,
        updated_at INTEGER,
        status TEXT,
        version INTEGER,
        metadata JSON
      )`,
      `CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        target_id TEXT NOT NULL,
        timestamp INTEGER,
        status TEXT,
        error TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS resource_metrics (
        timestamp INTEGER PRIMARY KEY,
        cpu_usage REAL,
        memory_usage INTEGER,
        storage_usage INTEGER,
        network_status TEXT
      )`
    ];

    for (const query of schema) {
      this.db.exec(query);
    }
  }

  // Resource Management
  startResourceMonitoring() {
    setInterval(async () => {
      try {
        const metrics = await this.getCurrentResourceMetrics();
        this.resourceMetrics = {
          ...this.resourceMetrics,
          ...metrics
        };

        // Store metrics
        this.db.prepare(`
          INSERT INTO resource_metrics (
            timestamp, cpu_usage, memory_usage, storage_usage, network_status
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          Date.now(),
          metrics.cpu.current,
          metrics.memory.used,
          metrics.storage.used,
          this.getNetworkStatus()
        );

        // Check resource limits
        this.enforceResourceLimits(metrics);
      } catch (err) {
        logger.error('Resource monitoring error:', err);
      }
    }, 60000); // Monitor every minute
  }

  async getCurrentResourceMetrics() {
    const process = require('process');
    const os = require('os');

    return {
      cpu: {
        current: process.cpuUsage().system / 1000000
      },
      memory: {
        used: process.memoryUsage().heapUsed
      },
      storage: {
        used: await this.calculateStorageUsage()
      }
    };
  }

  async calculateStorageUsage() {
    const baseDir = paths.base.data;
    const stats = await fs.stat(baseDir);
    return stats.size;
  }

  enforceResourceLimits(metrics) {
    if (metrics.storage.used > this.resourceMetrics.storage.quota) {
      this.handleStorageQuotaExceeded();
    }

    if (metrics.cpu.current > this.resourceMetrics.cpu.limit) {
      this.handleCPULimitExceeded();
    }

    if (metrics.memory.used > this.resourceMetrics.memory.limit) {
      this.handleMemoryLimitExceeded();
    }
  }

  // Sync Strategy
  async syncWithPeers(peers) {
    if (this.syncState.syncInProgress) {
      logger.warn('Sync already in progress');
      return;
    }

    try {
      this.syncState.syncInProgress = true;
      this.syncState.lastSync = Date.now();

      // Get local changes since last sync
      const changes = await this.getLocalChanges();

      // For each peer
      for (const peer of peers) {
        try {
          // Exchange version vectors
          const peerVector = await peer.getVersionVector();
          const diff = this.compareVersionVectors(peerVector);

          // Sync changes
          if (diff.needsUpdate) {
            await this.exchangeChanges(peer, diff);
          }

          // Update version vector
          this.updateVersionVector(peer.id, peerVector);
        } catch (err) {
          logger.error(`Failed to sync with peer ${peer.id}:`, err);
          // Continue with next peer
        }
      }
    } catch (err) {
      logger.error('Sync failed:', err);
      throw err;
    } finally {
      this.syncState.syncInProgress = false;
    }
  }

  // Error Handling
  async handleError(error, context) {
    logger.error('Error in offline operations:', error, context);

    try {
      // Log error
      await this.logError(error, context);

      // Attempt recovery based on error type
      switch (error.code) {
        case 'STORAGE_FULL':
          await this.handleStorageQuotaExceeded();
          break;
        case 'RESOURCE_EXHAUSTED':
          await this.handleResourceExhaustion(error.resource);
          break;
        case 'STATE_CORRUPTION':
          await this.attemptStateRecovery();
          break;
        default:
          // Generic error handling
          if (this.canRetry(error)) {
            await this.retryOperation(context);
          } else {
            await this.notifyUserOfError(error);
          }
      }
    } catch (recoveryError) {
      logger.error('Error recovery failed:', recoveryError);
      throw recoveryError;
    }
  }

  // Document Management
  async processDocument(document) {
    try {
      // Check available resources
      await this.ensureResourcesAvailable();

      // Process document locally
      const result = await this.localDocumentProcessing(document);

      // Update local state
      await this.updateLocalState(result);

      // Queue for sync
      this.queueForSync(result.id);

      return result;
    } catch (err) {
      await this.handleError(err, { operation: 'processDocument', document });
      throw err;
    }
  }

  // Network State Management
  getNetworkStatus() {
    // Check various network states
    const states = {
      hasP2PConnections: this.checkP2PConnections(),
      hasInternetConnection: this.checkInternetConnection(),
      syncStatus: this.syncState.syncInProgress ? 'syncing' : 'idle'
    };

    // Determine overall status
    if (!states.hasInternetConnection && !states.hasP2PConnections) {
      return 'offline';
    } else if (states.hasP2PConnections) {
      return 'p2p-connected';
    } else if (states.hasInternetConnection) {
      return 'online';
    }

    return 'degraded';
  }

  // Helper methods
  checkP2PConnections() {
    // Implementation depends on P2P module
    return false; // Placeholder
  }

  checkInternetConnection() {
    return navigator.onLine;
  }

  async localDocumentProcessing(document) {
    // Implement document processing pipeline
    return document; // Placeholder
  }

  async updateLocalState(result) {
    // Update local database
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents (
        id, title, content, vector, created_at, updated_at, status, version, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      result.id,
      result.title,
      result.content,
      result.vector,
      result.created_at || Date.now(),
      Date.now(),
      'processed',
      1,
      JSON.stringify(result.metadata || {})
    );
  }

  queueForSync(id) {
    this.syncState.pendingChanges.add(id);
  }

  async ensureResourcesAvailable() {
    const metrics = await this.getCurrentResourceMetrics();
    
    if (metrics.storage.used >= this.resourceMetrics.storage.quota) {
      throw new Error('STORAGE_FULL');
    }

    if (metrics.cpu.current >= this.resourceMetrics.cpu.limit) {
      throw new Error('CPU_LIMIT_EXCEEDED');
    }

    if (metrics.memory.used >= this.resourceMetrics.memory.limit) {
      throw new Error('MEMORY_LIMIT_EXCEEDED');
    }
  }
}

module.exports = new OfflineCapabilities(); 