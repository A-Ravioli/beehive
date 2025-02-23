const { jest } = require('@jest/globals');
const path = require('path');
const configSystem = require('../../config/default');

describe('Configuration System', () => {
  beforeEach(() => {
    // Reset the configuration system before each test
    configSystem.store.clear();
  });

  describe('initialization', () => {
    it('should initialize with default values', async () => {
      await configSystem.initialize();
      
      expect(configSystem.get('app.name')).toBe('Beehive');
      expect(configSystem.get('security.encryptStorage')).toBe(true);
      expect(configSystem.get('features.offlineMode')).toBe(true);
    });

    it('should create necessary directories', async () => {
      const fs = require('fs').promises;
      await configSystem.initialize();
      
      expect(fs.mkdir).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      const fs = require('fs').promises;
      fs.mkdir.mockRejectedValueOnce(new Error('Failed to create directory'));

      await expect(configSystem.initialize()).rejects.toThrow();
    });
  });

  describe('configuration management', () => {
    beforeEach(async () => {
      await configSystem.initialize();
    });

    it('should get and set configuration values', async () => {
      await configSystem.set('test.value', 123);
      expect(configSystem.get('test.value')).toBe(123);
    });

    it('should validate configuration values', async () => {
      await expect(
        configSystem.set('security.maxLoginAttempts', 'invalid')
      ).rejects.toThrow();
    });

    it('should merge environment-specific overrides', async () => {
      process.env.NODE_ENV = 'development';
      await configSystem.loadConfig();
      
      expect(configSystem.get('security.encryptStorage')).toBe(false);
    });

    it('should handle deep merging of configurations', () => {
      const target = { a: { b: 1 } };
      const source = { a: { c: 2 } };
      
      const result = configSystem.deepMerge(target, source);
      expect(result).toEqual({ a: { b: 1, c: 2 } });
    });
  });

  describe('backup functionality', () => {
    beforeEach(async () => {
      await configSystem.initialize();
    });

    it('should create configuration backups', async () => {
      const fs = require('fs').promises;
      await configSystem.createConfigBackup();
      
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should clean up old backups', async () => {
      const fs = require('fs').promises;
      fs.readdir.mockResolvedValueOnce([
        'config-2024-01-01.json',
        'config-2024-01-02.json',
        'config-2024-01-03.json',
        'config-2024-01-04.json',
        'config-2024-01-05.json',
        'config-2024-01-06.json'
      ]);

      await configSystem.cleanupOldBackups();
      
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('security features', () => {
    beforeEach(async () => {
      await configSystem.initialize();
    });

    it('should generate consistent encryption keys', () => {
      const key1 = configSystem.getEncryptionKey();
      const key2 = configSystem.getEncryptionKey();
      
      expect(key1).toBe(key2);
      expect(key1.length).toBe(32);
    });

    it('should validate security settings', async () => {
      await expect(
        configSystem.set('security.minPasswordLength', 4)
      ).rejects.toThrow();
    });
  });

  describe('feature flags', () => {
    beforeEach(async () => {
      await configSystem.initialize();
    });

    it('should initialize feature flags', async () => {
      await configSystem.initializeFeatureFlags();
      
      const flags = configSystem.get('featureFlags');
      expect(flags).toBeDefined();
      expect(flags.offlineMode).toBeDefined();
    });

    it('should track feature flag updates', async () => {
      await configSystem.initializeFeatureFlags();
      await configSystem.set('features.offlineMode', false);
      
      const flags = configSystem.get('featureFlags');
      expect(flags.offlineMode.enabled).toBe(false);
      expect(flags.offlineMode.lastUpdated).toBeDefined();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await configSystem.initialize();
    });

    it('should handle invalid configuration keys', async () => {
      await expect(
        configSystem.set('invalid.key', 'value')
      ).rejects.toThrow('Invalid configuration key');
    });

    it('should handle validation errors', async () => {
      await expect(
        configSystem.set('network.p2p.maxPeers', 'invalid')
      ).rejects.toThrow();
    });

    it('should handle storage errors', async () => {
      const fs = require('fs').promises;
      fs.writeFile.mockRejectedValueOnce(new Error('Storage error'));

      await expect(
        configSystem.createConfigBackup()
      ).rejects.toThrow();
    });
  });
}); 