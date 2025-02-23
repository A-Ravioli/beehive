// TODO: Local Configuration System
// TODO: Set up local environment variables
// TODO: Create local settings storage
// TODO: Implement local config validation
// TODO: Handle local environment detection
// TODO: Set up local secrets storage (encrypted)
// TODO: Create local feature flags
// TODO: Implement local config updates
// TODO: Handle local data migrations
// TODO: Set up local backups
// TODO: Create local documentation
// TODO: Implement local security measures
// TODO: Handle local user preferences

// Default paths for local storage
// TODO: Define local database path
// TODO: Define local model storage
// TODO: Define local document storage
// TODO: Define local cache directory
// TODO: Define local log directory 

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const Store = require('electron-store');
const { setupLogging } = require('../utils/logging');
const { paths } = require('./paths');

const logger = setupLogging('config');

class ConfigurationSystem {
  constructor() {
    // Initialize electron-store with encryption
    this.store = new Store({
      name: 'config',
      encryptionKey: this.getEncryptionKey(),
      clearInvalidConfig: true
    });

    // Default configuration
    this.defaults = {
      app: {
        name: 'Beehive',
        version: app.getVersion(),
        environment: process.env.NODE_ENV || 'production'
      },
      security: {
        encryptStorage: true,
        maxLoginAttempts: 3,
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        minPasswordLength: 12,
        requireMFA: false
      },
      network: {
        p2p: {
          enabled: true,
          maxPeers: 10,
          discoveryInterval: 60000,
          connectionTimeout: 30000
        },
        rateLimit: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 100
        }
      },
      storage: {
        maxCacheSize: 1024 * 1024 * 1024, // 1GB
        maxUploadSize: 100 * 1024 * 1024, // 100MB
        backupInterval: 7 * 24 * 60 * 60 * 1000 // 7 days
      },
      inference: {
        maxBatchSize: 32,
        timeout: 30000,
        maxConcurrent: 2,
        preferredDevice: 'cpu'
      },
      features: {
        offlineMode: true,
        p2pSharing: true,
        localInference: true,
        distributedCompute: false
      }
    };

    // Environment-specific overrides
    this.envOverrides = {
      development: {
        security: {
          encryptStorage: false,
          requireMFA: false
        },
        network: {
          rateLimit: {
            maxRequests: 1000
          }
        }
      },
      test: {
        security: {
          encryptStorage: false,
          requireMFA: false
        },
        storage: {
          maxCacheSize: 100 * 1024 * 1024 // 100MB
        }
      }
    };
  }

  // Initialize configuration system
  async initialize() {
    try {
      // Ensure config directory exists
      await fs.mkdir(path.dirname(this.store.path), { recursive: true });

      // Load or create configuration
      await this.loadConfig();

      // Set up environment
      await this.setupEnvironment();

      // Initialize feature flags
      await this.initializeFeatureFlags();

      // Validate configuration
      await this.validateConfig();

      logger.info('Configuration system initialized');
      return true;
    } catch (err) {
      logger.error('Failed to initialize configuration system:', err);
      throw err;
    }
  }

  // Load configuration with environment overrides
  async loadConfig() {
    try {
      // Start with defaults
      let config = { ...this.defaults };

      // Apply environment overrides
      const env = process.env.NODE_ENV || 'production';
      if (this.envOverrides[env]) {
        config = this.deepMerge(config, this.envOverrides[env]);
      }

      // Load stored configuration
      const stored = this.store.store;
      if (stored) {
        config = this.deepMerge(config, stored);
      }

      // Update store with merged config
      this.store.store = config;

      return config;
    } catch (err) {
      logger.error('Failed to load configuration:', err);
      throw err;
    }
  }

  // Set up environment
  async setupEnvironment() {
    const env = process.env.NODE_ENV || 'production';
    
    // Set environment-specific variables
    process.env.APP_ENV = env;
    process.env.APP_VERSION = this.get('app.version');
    process.env.CONFIG_PATH = this.store.path;
    
    // Set up paths
    process.env.APP_DATA = paths.base.data;
    process.env.APP_CACHE = paths.cache.ui;
    process.env.APP_LOGS = paths.logs.app;

    // Set security variables
    if (this.get('security.encryptStorage')) {
      process.env.ENCRYPT_STORAGE = '1';
    }
  }

  // Initialize feature flags
  async initializeFeatureFlags() {
    const features = this.get('features');
    const featureFlags = {};

    // Convert features to flags
    for (const [key, enabled] of Object.entries(features)) {
      featureFlags[key] = {
        enabled,
        lastUpdated: Date.now()
      };
    }

    // Store feature flags
    await this.set('featureFlags', featureFlags);
  }

  // Validate configuration
  async validateConfig() {
    const schema = {
      app: {
        name: 'string',
        version: 'string',
        environment: ['production', 'development', 'test']
      },
      security: {
        encryptStorage: 'boolean',
        maxLoginAttempts: 'number',
        sessionTimeout: 'number',
        minPasswordLength: 'number',
        requireMFA: 'boolean'
      },
      network: {
        p2p: {
          enabled: 'boolean',
          maxPeers: 'number',
          discoveryInterval: 'number',
          connectionTimeout: 'number'
        },
        rateLimit: {
          windowMs: 'number',
          maxRequests: 'number'
        }
      },
      storage: {
        maxCacheSize: 'number',
        maxUploadSize: 'number',
        backupInterval: 'number'
      },
      inference: {
        maxBatchSize: 'number',
        timeout: 'number',
        maxConcurrent: 'number',
        preferredDevice: ['cpu', 'gpu']
      },
      features: {
        offlineMode: 'boolean',
        p2pSharing: 'boolean',
        localInference: 'boolean',
        distributedCompute: 'boolean'
      }
    };

    const config = this.store.store;
    const errors = this.validateObject(config, schema);

    if (errors.length > 0) {
      logger.error('Configuration validation failed:', errors);
      throw new Error('Invalid configuration');
    }
  }

  // Get configuration value
  get(key, defaultValue = null) {
    return this.store.get(key, defaultValue);
  }

  // Set configuration value
  async set(key, value) {
    try {
      // Validate new value
      await this.validateValue(key, value);

      // Store value
      this.store.set(key, value);

      // Create backup
      await this.createConfigBackup();

      return true;
    } catch (err) {
      logger.error(`Failed to set config value for ${key}:`, err);
      throw err;
    }
  }

  // Reset configuration to defaults
  async reset() {
    try {
      // Create backup before reset
      await this.createConfigBackup();

      // Clear store
      this.store.clear();

      // Load defaults
      await this.loadConfig();

      return true;
    } catch (err) {
      logger.error('Failed to reset configuration:', err);
      throw err;
    }
  }

  // Create configuration backup
  async createConfigBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(paths.db.backup, `config-${timestamp}.json`);

      await fs.writeFile(
        backupPath,
        JSON.stringify(this.store.store, null, 2)
      );

      // Clean up old backups
      await this.cleanupOldBackups();

      return backupPath;
    } catch (err) {
      logger.error('Failed to create config backup:', err);
      throw err;
    }
  }

  // Helper methods
  getEncryptionKey() {
    // Use a stable machine-specific identifier
    const machineId = crypto.createHash('sha256')
      .update(app.getPath('userData'))
      .digest('hex');
    
    return machineId.slice(0, 32); // Use first 32 chars as key
  }

  deepMerge(target, source) {
    for (const key in source) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        this.deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
    return target;
  }

  validateObject(obj, schema, path = '') {
    const errors = [];

    for (const [key, value] of Object.entries(schema)) {
      const currentPath = path ? `${path}.${key}` : key;
      const currentValue = obj?.[key];

      if (currentValue === undefined) {
        errors.push(`Missing required field: ${currentPath}`);
        continue;
      }

      if (typeof value === 'string') {
        // Type validation
        if (typeof currentValue !== value) {
          errors.push(`Invalid type for ${currentPath}: expected ${value}, got ${typeof currentValue}`);
        }
      } else if (Array.isArray(value)) {
        // Enum validation
        if (!value.includes(currentValue)) {
          errors.push(`Invalid value for ${currentPath}: must be one of [${value.join(', ')}]`);
        }
      } else if (typeof value === 'object') {
        // Nested object validation
        errors.push(...this.validateObject(currentValue, value, currentPath));
      }
    }

    return errors;
  }

  async validateValue(key, value) {
    // Get schema for key
    const keyParts = key.split('.');
    let schema = this.defaults;
    for (const part of keyParts) {
      schema = schema[part];
      if (!schema) {
        throw new Error(`Invalid configuration key: ${key}`);
      }
    }

    // Validate value against schema
    const errors = this.validateObject({ [key]: value }, { [key]: schema });
    if (errors.length > 0) {
      throw new Error(`Invalid value for ${key}: ${errors.join(', ')}`);
    }
  }

  async cleanupOldBackups() {
    try {
      const backupDir = paths.db.backup;
      const files = await fs.readdir(backupDir);
      
      // Get config backups
      const backups = files
        .filter(f => f.startsWith('config-'))
        .sort()
        .reverse();

      // Keep only last 5 backups
      for (const backup of backups.slice(5)) {
        await fs.unlink(path.join(backupDir, backup));
      }
    } catch (err) {
      logger.error('Failed to cleanup old config backups:', err);
    }
  }
}

module.exports = new ConfigurationSystem(); 