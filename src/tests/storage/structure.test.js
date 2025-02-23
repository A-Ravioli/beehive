const { jest } = require('@jest/globals');
const path = require('path');
const storageStructure = require('../../storage/structure');

describe('Storage Structure', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize storage structure', async () => {
      await storageStructure.initialize();
      
      const fs = require('fs').promises;
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.chmod).toHaveBeenCalled();
    });

    it('should create all required directories', async () => {
      await storageStructure.initialize();
      
      const fs = require('fs').promises;
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('documents'),
        expect.any(Object)
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('models'),
        expect.any(Object)
      );
    });

    it('should handle initialization errors', async () => {
      const fs = require('fs').promises;
      fs.mkdir.mockRejectedValueOnce(new Error('Failed to create directory'));

      await expect(storageStructure.initialize()).rejects.toThrow();
    });
  });

  describe('file naming', () => {
    it('should generate valid document file names', () => {
      const originalName = 'test document.pdf';
      const timestamp = Date.now();
      
      const fileName = storageStructure.generateDocumentFileName(
        originalName,
        timestamp
      );

      expect(fileName).toMatch(/^\d+-[a-f0-9]{8}-test-document\.pdf$/);
    });

    it('should generate valid model file names', () => {
      const modelName = 'bert-base';
      const version = 'v1.0';
      
      const fileName = storageStructure.generateModelFileName(
        modelName,
        version,
        'base'
      );

      expect(fileName).toMatch(/^bert-base-v1\.0-[a-f0-9]{8}\.bin$/);
    });

    it('should handle special characters in file names', () => {
      const originalName = 'test@document#.pdf';
      
      const fileName = storageStructure.generateDocumentFileName(originalName);
      expect(fileName).not.toContain('@');
      expect(fileName).not.toContain('#');
    });
  });

  describe('metadata management', () => {
    it('should create metadata', async () => {
      const type = 'document';
      const id = 'test-doc';
      const data = {
        title: 'Test Document',
        author: 'Test Author'
      };

      const metadata = await storageStructure.createMetadata(type, id, data);
      
      expect(metadata.id).toBe(id);
      expect(metadata.type).toBe(type);
      expect(metadata.title).toBe(data.title);
    });

    it('should update metadata', async () => {
      const type = 'document';
      const id = 'test-doc';
      const updates = {
        title: 'Updated Title'
      };

      const fs = require('fs').promises;
      fs.readFile.mockResolvedValueOnce(JSON.stringify({
        id,
        type,
        title: 'Original Title'
      }));

      const updated = await storageStructure.updateMetadata(type, id, updates);
      expect(updated.title).toBe(updates.title);
    });

    it('should read metadata', async () => {
      const type = 'document';
      const id = 'test-doc';
      const data = {
        id,
        type,
        title: 'Test Document'
      };

      const fs = require('fs').promises;
      fs.readFile.mockResolvedValueOnce(JSON.stringify(data));

      const metadata = await storageStructure.readMetadata(type, id);
      expect(metadata).toEqual(data);
    });
  });

  describe('storage management', () => {
    beforeEach(async () => {
      await storageStructure.initialize();
    });

    it('should monitor storage space', async () => {
      const fs = require('fs').promises;
      fs.statfs.mockResolvedValueOnce({
        blocks: 1000,
        bfree: 500,
        bsize: 1024
      });

      const usage = await storageStructure.calculateStorageUsage();
      expect(usage.percentUsed).toBe(50);
    });

    it('should handle storage pressure', async () => {
      const fs = require('fs').promises;
      fs.statfs.mockResolvedValueOnce({
        blocks: 1000,
        bfree: 50, // 95% used
        bsize: 1024
      });

      await storageStructure.monitorStorageSpace();
      // Should trigger storage pressure handling
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should run garbage collection', async () => {
      await storageStructure.runGarbageCollection();
      
      const fs = require('fs').promises;
      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining('temp'),
        expect.any(Object)
      );
    });
  });

  describe('backup functionality', () => {
    beforeEach(async () => {
      await storageStructure.initialize();
    });

    it('should create backups', async () => {
      await storageStructure.createBackup();
      
      const fs = require('fs').promises;
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('backup'),
        expect.any(Object)
      );
    });

    it('should clean up old backups', async () => {
      const fs = require('fs').promises;
      fs.readdir.mockResolvedValueOnce([
        'backup-2024-01-01',
        'backup-2024-01-02',
        'backup-2024-01-03',
        'backup-2024-01-04',
        'backup-2024-01-05',
        'backup-2024-01-06'
      ]);

      await storageStructure.cleanupOldBackups();
      expect(fs.rm).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle file system errors', async () => {
      const fs = require('fs').promises;
      fs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));

      await expect(
        storageStructure.createDirectoryStructure({
          test: '/invalid/path'
        })
      ).rejects.toThrow();
    });

    it('should handle metadata errors', async () => {
      const fs = require('fs').promises;
      fs.readFile.mockRejectedValueOnce(new Error('File not found'));

      await expect(
        storageStructure.readMetadata('document', 'invalid-id')
      ).rejects.toThrow();
    });

    it('should handle backup errors', async () => {
      const fs = require('fs').promises;
      fs.mkdir.mockRejectedValueOnce(new Error('Backup failed'));

      await expect(storageStructure.createBackup()).rejects.toThrow();
    });
  });

  describe('path management', () => {
    it('should resolve document paths correctly', () => {
      const docPath = storageStructure.getMetadataPath('document', 'test-id');
      expect(docPath).toContain('documents');
      expect(docPath).toContain('metadata');
    });

    it('should resolve model paths correctly', () => {
      const modelPath = storageStructure.getMetadataPath('model', 'test-id');
      expect(modelPath).toContain('models');
      expect(modelPath).toContain('configs');
    });

    it('should handle invalid path types', () => {
      expect(() => {
        storageStructure.getMetadataPath('invalid', 'test-id');
      }).toThrow('Unknown metadata type');
    });
  });
}); 