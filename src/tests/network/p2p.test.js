const { jest } = require('@jest/globals');
const WebRTC = require('node-webrtc');
const p2pNetwork = require('../../network/p2p');

describe('P2P Network', () => {
  beforeEach(async () => {
    // Reset the P2P network before each test
    p2pNetwork.peers.clear();
    p2pNetwork.connections.clear();
    p2pNetwork.pendingConnections.clear();
    p2pNetwork.resourceInfo.clear();
  });

  describe('initialization', () => {
    it('should initialize P2P network', async () => {
      await p2pNetwork.initialize();
      
      expect(p2pNetwork.db).toBeDefined();
      expect(WebRTC.RTCPeerConnection).toHaveBeenCalled();
    });

    it('should set up database schema', async () => {
      await p2pNetwork.initialize();
      
      expect(p2pNetwork.db.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS peers')
      );
    });

    it('should handle initialization errors', async () => {
      const sqlite3 = require('better-sqlite3');
      sqlite3.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      await expect(p2pNetwork.initialize()).rejects.toThrow();
    });
  });

  describe('peer management', () => {
    beforeEach(async () => {
      await p2pNetwork.initialize();
    });

    it('should add new peers', async () => {
      const peer = {
        name: 'TestPeer',
        publicKey: 'test-key',
        metadata: { version: '1.0.0' }
      };

      const peerId = await p2pNetwork.addPeer(peer);
      expect(p2pNetwork.peers.has(peerId)).toBe(true);
    });

    it('should enforce peer limits', async () => {
      // Add maximum number of peers
      for (let i = 0; i < p2pNetwork.limits.maxPeers; i++) {
        await p2pNetwork.addPeer({
          name: `Peer${i}`,
          publicKey: `key-${i}`
        });
      }

      // Try to add one more
      await expect(
        p2pNetwork.addPeer({
          name: 'ExtraPeer',
          publicKey: 'extra-key'
        })
      ).rejects.toThrow('Maximum peer limit reached');
    });

    it('should remove peers', async () => {
      const peer = {
        name: 'TestPeer',
        publicKey: 'test-key'
      };

      const peerId = await p2pNetwork.addPeer(peer);
      await p2pNetwork.removePeer(peerId);

      expect(p2pNetwork.peers.has(peerId)).toBe(false);
    });
  });

  describe('connection management', () => {
    beforeEach(async () => {
      await p2pNetwork.initialize();
    });

    it('should initialize connections', async () => {
      const peer = {
        name: 'TestPeer',
        publicKey: 'test-key'
      };

      const peerId = await p2pNetwork.addPeer(peer);
      const connection = await p2pNetwork.initializeConnection(peerId);

      expect(connection.status).toBe('initializing');
      expect(p2pNetwork.connections.has(peerId)).toBe(true);
    });

    it('should enforce connection limits', async () => {
      // Add maximum number of connections
      for (let i = 0; i < p2pNetwork.limits.maxConnections; i++) {
        const peer = {
          name: `Peer${i}`,
          publicKey: `key-${i}`
        };
        const peerId = await p2pNetwork.addPeer(peer);
        await p2pNetwork.initializeConnection(peerId);
      }

      // Try to add one more
      const extraPeer = {
        name: 'ExtraPeer',
        publicKey: 'extra-key'
      };
      const extraPeerId = await p2pNetwork.addPeer(extraPeer);

      await expect(
        p2pNetwork.initializeConnection(extraPeerId)
      ).rejects.toThrow('Maximum connection limit reached');
    });

    it('should handle connection errors', async () => {
      const peer = {
        name: 'TestPeer',
        publicKey: 'test-key'
      };

      const peerId = await p2pNetwork.addPeer(peer);
      p2pNetwork.peerConnection.createOffer.mockRejectedValueOnce(
        new Error('Connection error')
      );

      await expect(
        p2pNetwork.establishConnection(peerId)
      ).rejects.toThrow();
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await p2pNetwork.initialize();
    });

    it('should validate messages', async () => {
      const invalidMessage = {
        type: 'TEST',
        // Missing data field
      };

      await expect(
        p2pNetwork.handleMessage(invalidMessage)
      ).rejects.toThrow('Invalid message format');
    });

    it('should handle peer announcements', async () => {
      const message = {
        type: 'PEER_ANNOUNCE',
        data: {
          name: 'TestPeer',
          publicKey: 'test-key'
        }
      };

      await p2pNetwork.handleMessage(message);
      expect(p2pNetwork.peers.size).toBe(1);
    });

    it('should handle resource updates', async () => {
      const peerId = 'test-peer-id';
      const message = {
        type: 'RESOURCE_UPDATE',
        data: {
          cpu: 0.5,
          memory: {
            total: 1000,
            free: 500
          }
        }
      };

      await p2pNetwork.handleMessage(message);
      expect(p2pNetwork.db.prepare).toHaveBeenCalled();
    });
  });

  describe('resource monitoring', () => {
    beforeEach(async () => {
      await p2pNetwork.initialize();
    });

    it('should update resource information', async () => {
      await p2pNetwork.updateResourceInfo();
      
      expect(p2pNetwork.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO resources')
      );
    });

    it('should broadcast resource updates', async () => {
      const broadcast = jest.spyOn(p2pNetwork, 'broadcast');
      
      await p2pNetwork.updateResourceInfo();
      
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'RESOURCE_UPDATE'
        })
      );
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await p2pNetwork.initialize();
    });

    it('should handle connection timeouts', async () => {
      const peer = {
        name: 'TestPeer',
        publicKey: 'test-key'
      };

      const peerId = await p2pNetwork.addPeer(peer);
      await p2pNetwork.initializeConnection(peerId);

      // Simulate timeout
      const connection = p2pNetwork.connections.get(peerId);
      connection.lastActive = Date.now() - (p2pNetwork.config.connectionTimeout + 1000);

      await p2pNetwork.monitorConnections();
      expect(connection.status).not.toBe('connected');
    });

    it('should retry failed connections', async () => {
      const peer = {
        name: 'TestPeer',
        publicKey: 'test-key'
      };

      const peerId = await p2pNetwork.addPeer(peer);
      const connection = await p2pNetwork.initializeConnection(peerId);

      // Simulate failure and retry
      await p2pNetwork.handleConnectionTimeout(peerId);
      expect(connection.retries).toBe(1);
    });

    it('should respect retry limits', async () => {
      const peer = {
        name: 'TestPeer',
        publicKey: 'test-key'
      };

      const peerId = await p2pNetwork.addPeer(peer);
      const connection = await p2pNetwork.initializeConnection(peerId);

      // Simulate multiple failures
      for (let i = 0; i <= p2pNetwork.config.maxRetries; i++) {
        await p2pNetwork.handleConnectionTimeout(peerId);
      }

      expect(p2pNetwork.shouldRetryConnection(peerId)).toBe(false);
    });
  });
}); 