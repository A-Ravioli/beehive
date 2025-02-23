const { jest } = require('@jest/globals');
const offlineCapabilities = require('../../offline/capabilities');

describe('Offline Capabilities', () => {
  beforeEach(async () => {
    // Reset offline capabilities before each test
    offlineCapabilities.syncState = {
      lastSync: null,
      syncInProgress: false,
      pendingChanges: new Set(),
      versionVector: new Map()
    };
  });

  describe('initialization', () => {
    it('should initialize offline capabilities', async () => {
      await offlineCapabilities.initialize();
      
      expect(offlineCapabilities.db).toBeDefined();
      expect(offlineCapabilities.vectorDB).toBeDefined();
    });

    it('should set up database schema', async () => {
      await offlineCapabilities.initialize();
      
      expect(offlineCapabilities.db.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS documents')
      );
    });

    it('should handle initialization errors', async () => {
      const sqlite3 = require('better-sqlite3');
      sqlite3.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      await expect(offlineCapabilities.initialize()).rejects.toThrow();
    });
  });

  describe('resource management', () => {
    beforeEach(async () => {
      await offlineCapabilities.initialize();
    });

    it('should monitor resource usage', async () => {
      const metrics = await offlineCapabilities.getCurrentResourceMetrics();
      
      expect(metrics.cpu).toBeDefined();
      expect(metrics.memory).toBeDefined();
      expect(metrics.storage).toBeDefined();
    });

    it('should enforce resource limits', async () => {
      const metrics = {
        storage: {
          used: offlineCapabilities.resourceMetrics.storage.quota + 1
        },
        cpu: {
          current: offlineCapabilities.resourceMetrics.cpu.limit + 0.1
        },
        memory: {
          used: offlineCapabilities.resourceMetrics.memory.limit + 1
        }
      };

      await expect(
        offlineCapabilities.enforceResourceLimits(metrics)
      ).rejects.toThrow();
    });

    it('should calculate storage usage', async () => {
      const fs = require('fs').promises;
      fs.stat.mockResolvedValueOnce({ size: 1024 });

      const usage = await offlineCapabilities.calculateStorageUsage();
      expect(usage).toBe(1024);
    });
  });

  describe('document processing', () => {
    beforeEach(async () => {
      await offlineCapabilities.initialize();
    });

    it('should process documents locally', async () => {
      const document = {
        id: 'test-doc',
        title: 'Test Document',
        content: 'Test content'
      };

      const result = await offlineCapabilities.processDocument(document);
      expect(result.id).toBe(document.id);
    });

    it('should check resources before processing', async () => {
      // Mock resource exhaustion
      jest.spyOn(offlineCapabilities, 'ensureResourcesAvailable')
        .mockRejectedValueOnce(new Error('STORAGE_FULL'));

      const document = {
        id: 'test-doc',
        title: 'Test Document'
      };

      await expect(
        offlineCapabilities.processDocument(document)
      ).rejects.toThrow();
    });

    it('should update local state after processing', async () => {
      const document = {
        id: 'test-doc',
        title: 'Test Document'
      };

      await offlineCapabilities.processDocument(document);
      
      expect(offlineCapabilities.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO documents')
      );
    });
  });

  describe('sync functionality', () => {
    beforeEach(async () => {
      await offlineCapabilities.initialize();
    });

    it('should prevent concurrent syncs', async () => {
      offlineCapabilities.syncState.syncInProgress = true;

      await expect(
        offlineCapabilities.syncWithPeers([])
      ).rejects.toThrow();
    });

    it('should sync with peers', async () => {
      const peers = [
        {
          id: 'peer-1',
          getVersionVector: jest.fn().mockResolvedValue(new Map())
        }
      ];

      await offlineCapabilities.syncWithPeers(peers);
      expect(offlineCapabilities.syncState.lastSync).toBeDefined();
    });

    it('should handle sync errors gracefully', async () => {
      const peers = [
        {
          id: 'peer-1',
          getVersionVector: jest.fn().mockRejectedValue(new Error('Sync error'))
        }
      ];

      await offlineCapabilities.syncWithPeers(peers);
      expect(offlineCapabilities.syncState.syncInProgress).toBe(false);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await offlineCapabilities.initialize();
    });

    it('should handle storage quota exceeded', async () => {
      const error = { code: 'STORAGE_FULL' };
      const context = { operation: 'processDocument' };

      await offlineCapabilities.handleError(error, context);
      expect(offlineCapabilities.db.prepare).toHaveBeenCalled();
    });

    it('should handle resource exhaustion', async () => {
      const error = {
        code: 'RESOURCE_EXHAUSTED',
        resource: 'memory'
      };
      const context = { operation: 'processDocument' };

      await offlineCapabilities.handleError(error, context);
      expect(offlineCapabilities.db.prepare).toHaveBeenCalled();
    });

    it('should attempt state recovery', async () => {
      const error = { code: 'STATE_CORRUPTION' };
      const context = { operation: 'processDocument' };

      await offlineCapabilities.handleError(error, context);
      expect(offlineCapabilities.db.prepare).toHaveBeenCalled();
    });
  });

  describe('network state', () => {
    beforeEach(async () => {
      await offlineCapabilities.initialize();
    });

    it('should detect offline state', () => {
      jest.spyOn(offlineCapabilities, 'checkP2PConnections')
        .mockReturnValue(false);
      jest.spyOn(offlineCapabilities, 'checkInternetConnection')
        .mockReturnValue(false);

      const status = offlineCapabilities.getNetworkStatus();
      expect(status).toBe('offline');
    });

    it('should detect P2P connections', () => {
      jest.spyOn(offlineCapabilities, 'checkP2PConnections')
        .mockReturnValue(true);
      jest.spyOn(offlineCapabilities, 'checkInternetConnection')
        .mockReturnValue(false);

      const status = offlineCapabilities.getNetworkStatus();
      expect(status).toBe('p2p-connected');
    });

    it('should detect online state', () => {
      jest.spyOn(offlineCapabilities, 'checkP2PConnections')
        .mockReturnValue(false);
      jest.spyOn(offlineCapabilities, 'checkInternetConnection')
        .mockReturnValue(true);

      const status = offlineCapabilities.getNetworkStatus();
      expect(status).toBe('online');
    });
  });
}); 