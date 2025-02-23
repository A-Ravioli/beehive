// Local Storage Structure Specification

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { setupLogging } = require('../utils/logging');
const { paths } = require('../config/paths');

const logger = setupLogging('storage-structure');

class StorageStructure {
  constructor() {
    this.paths = {
      // Document Storage Structure
      documents: {
        uploads: {
          pending: path.join(paths.documents.uploads, 'pending'),
          processing: path.join(paths.documents.uploads, 'processing'),
          completed: path.join(paths.documents.uploads, 'completed')
        },
        processed: {
          text: path.join(paths.documents.processed, 'text'),
          metadata: path.join(paths.documents.processed, 'metadata'),
          images: path.join(paths.documents.processed, 'images')
        },
        embeddings: {
          chunks: path.join(paths.documents.embeddings, 'chunks'),
          images: path.join(paths.documents.embeddings, 'images'),
          metadata: path.join(paths.documents.embeddings, 'metadata')
        },
        exports: {
          pdf: path.join(paths.documents.exports, 'pdf'),
          text: path.join(paths.documents.exports, 'text'),
          embeddings: path.join(paths.documents.exports, 'embeddings')
        }
      },

      // Model Storage Structure
      models: {
        repository: {
          base: path.join(paths.models.repository, 'base'),
          quantized: path.join(paths.models.repository, 'quantized'),
          custom: path.join(paths.models.repository, 'custom')
        },
        cache: {
          weights: path.join(paths.models.cache, 'weights'),
          configs: path.join(paths.models.cache, 'configs'),
          optimized: path.join(paths.models.cache, 'optimized')
        },
        partitioned: {
          active: path.join(paths.models.repository, 'partitioned/active'),
          archived: path.join(paths.models.repository, 'partitioned/archived')
        },
        metadata: {
          configs: path.join(paths.models.configs, 'configs'),
          stats: path.join(paths.models.configs, 'stats'),
          performance: path.join(paths.models.configs, 'performance')
        }
      }
    };

    // Storage management settings
    this.settings = {
      maxCacheSize: 1024 * 1024 * 1024, // 1GB
      maxUploadSize: 100 * 1024 * 1024, // 100MB
      gcInterval: 24 * 60 * 60 * 1000, // 24 hours
      backupInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
      retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
    };
  }

  // Initialize storage structure
  async initialize() {
    try {
      // Create directory structure
      await this.createDirectoryStructure(this.paths);

      // Initialize storage management
      await this.initializeStorageManagement();

      logger.info('Storage structure initialized');
      return true;
    } catch (err) {
      logger.error('Failed to initialize storage structure:', err);
      throw err;
    }
  }

  // Create directory structure recursively
  async createDirectoryStructure(structure, basePath = '') {
    for (const [key, value] of Object.entries(structure)) {
      if (typeof value === 'string') {
        await fs.mkdir(value, { recursive: true });
        await fs.chmod(value, 0o700); // Restrictive permissions
      } else if (typeof value === 'object') {
        await this.createDirectoryStructure(value, path.join(basePath, key));
      }
    }
  }

  // File naming utilities
  generateDocumentFileName(originalName, timestamp = Date.now()) {
    const hash = crypto.createHash('sha256')
      .update(originalName + timestamp)
      .digest('hex')
      .slice(0, 8);
    
    const ext = path.extname(originalName);
    const sanitizedName = path.basename(originalName, ext)
      .replace(/[^a-zA-Z0-9]/g, '-');
    
    return `${timestamp}-${hash}-${sanitizedName}${ext}`;
  }

  generateModelFileName(modelName, version, type = 'base') {
    const hash = crypto.createHash('sha256')
      .update(`${modelName}-${version}-${type}`)
      .digest('hex')
      .slice(0, 8);
    
    switch (type) {
      case 'quantized':
        return `${modelName}-${version}-q8-${hash}.bin`;
      case 'partitioned':
        return `${modelName}-${version}-part-${hash}.bin`;
      default:
        return `${modelName}-${version}-${hash}.bin`;
    }
  }

  // Metadata management
  async createMetadata(type, id, data) {
    const metadata = {
      id,
      type,
      created: Date.now(),
      updated: Date.now(),
      ...data
    };

    const metadataPath = this.getMetadataPath(type, id);
    await fs.writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2)
    );

    return metadata;
  }

  async updateMetadata(type, id, updates) {
    const metadataPath = this.getMetadataPath(type, id);
    const existing = await this.readMetadata(type, id);

    const updated = {
      ...existing,
      ...updates,
      updated: Date.now()
    };

    await fs.writeFile(
      metadataPath,
      JSON.stringify(updated, null, 2)
    );

    return updated;
  }

  async readMetadata(type, id) {
    const metadataPath = this.getMetadataPath(type, id);
    const data = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(data);
  }

  getMetadataPath(type, id) {
    switch (type) {
      case 'document':
        return path.join(this.paths.documents.processed.metadata, `${id}.json`);
      case 'model':
        return path.join(this.paths.models.metadata.configs, `${id}.json`);
      case 'embedding':
        return path.join(this.paths.documents.embeddings.metadata, `${id}.json`);
      default:
        throw new Error(`Unknown metadata type: ${type}`);
    }
  }

  // Storage management
  async initializeStorageManagement() {
    // Start garbage collection
    setInterval(() => {
      this.runGarbageCollection();
    }, this.settings.gcInterval);

    // Start backup scheduling
    setInterval(() => {
      this.createBackup();
    }, this.settings.backupInterval);

    // Initialize space monitoring
    await this.monitorStorageSpace();
  }

  async monitorStorageSpace() {
    try {
      const usage = await this.calculateStorageUsage();
      
      if (usage.percentUsed > 90) {
        logger.warn('Storage space critical:', usage);
        await this.handleStoragePressure();
      }

      // Schedule next check
      setTimeout(() => {
        this.monitorStorageSpace();
      }, 60000); // Check every minute
    } catch (err) {
      logger.error('Storage monitoring failed:', err);
    }
  }

  async calculateStorageUsage() {
    const baseDir = paths.base.data;
    const stats = await fs.statfs(baseDir);
    
    return {
      total: stats.blocks * stats.bsize,
      free: stats.bfree * stats.bsize,
      used: (stats.blocks - stats.bfree) * stats.bsize,
      percentUsed: ((stats.blocks - stats.bfree) / stats.blocks) * 100
    };
  }

  async handleStoragePressure() {
    try {
      // Clear old cache entries
      await this.clearOldCache();

      // Remove old exports
      await this.cleanupExports();

      // Archive old processed documents
      await this.archiveOldDocuments();
    } catch (err) {
      logger.error('Failed to handle storage pressure:', err);
    }
  }

  async runGarbageCollection() {
    try {
      const tasks = [
        this.cleanupTempFiles(),
        this.removeStaleUploads(),
        this.cleanupOrphanedMetadata(),
        this.compactCache()
      ];

      await Promise.all(tasks);
      logger.info('Garbage collection completed');
    } catch (err) {
      logger.error('Garbage collection failed:', err);
    }
  }

  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(paths.db.backup, timestamp);

      // Create backup directory
      await fs.mkdir(backupDir, { recursive: true });

      // Backup critical data
      await this.backupDatabase(backupDir);
      await this.backupMetadata(backupDir);
      await this.backupConfigs(backupDir);

      // Cleanup old backups
      await this.cleanupOldBackups();

      logger.info('Backup completed:', backupDir);
    } catch (err) {
      logger.error('Backup failed:', err);
    }
  }

  // Helper methods
  async cleanupTempFiles() {
    const tempDir = paths.base.temp;
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });
  }

  async removeStaleUploads() {
    const pendingDir = this.paths.documents.uploads.pending;
    const files = await fs.readdir(pendingDir);
    
    for (const file of files) {
      const filePath = path.join(pendingDir, file);
      const stats = await fs.stat(filePath);
      
      if (Date.now() - stats.mtimeMs > this.settings.retentionPeriod) {
        await fs.unlink(filePath);
      }
    }
  }

  async cleanupOrphanedMetadata() {
    // Implementation depends on specific metadata structure
  }

  async compactCache() {
    // Implementation depends on cache structure
  }

  async backupDatabase(backupDir) {
    // Implementation depends on database type
  }

  async backupMetadata(backupDir) {
    // Implementation depends on metadata structure
  }

  async backupConfigs(backupDir) {
    // Implementation depends on config structure
  }

  async cleanupOldBackups() {
    const backupDir = paths.db.backup;
    const backups = await fs.readdir(backupDir);
    
    // Sort backups by date (newest first)
    backups.sort().reverse();

    // Keep only last 5 backups
    for (const backup of backups.slice(5)) {
      await fs.rm(path.join(backupDir, backup), { recursive: true });
    }
  }
}

module.exports = new StorageStructure(); 