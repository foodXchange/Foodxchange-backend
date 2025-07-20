import HDWalletProvider from '@truffle/hdwallet-provider';
import crypto from 'crypto-js';
import Web3 from 'web3';

import { Logger } from '../../core/logging/logger';
import { optimizedCache } from '../cache/OptimizedCacheService';

const logger = new Logger('BlockchainService');

export interface SupplyChainEvent {
  id: string;
  productId: string;
  eventType: 'CREATED' | 'SHIPPED' | 'RECEIVED' | 'QUALITY_CHECK' | 'STORED' | 'DELIVERED';
  timestamp: Date;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  actor: {
    id: string;
    name: string;
    role: string;
  };
  metadata: Record<string, any>;
  hash: string;
  blockNumber?: number;
  transactionHash?: string;
}

export interface ProductBatch {
  id: string;
  productId: string;
  batchNumber: string;
  manufacturingDate: Date;
  expiryDate: Date;
  origin: {
    farm: string;
    location: string;
    certifications: string[];
  };
  qualityMetrics: {
    grade: string;
    freshness: number;
    organic: boolean;
    tests: Record<string, any>;
  };
  events: SupplyChainEvent[];
  currentLocation: string;
  currentOwner: string;
  verified: boolean;
}

export class BlockchainService {
  private web3: Web3;
  private contract: any;
  private account: string;
  private contractAddress: string;

  constructor() {
    this.initializeWeb3();
  }

  private async initializeWeb3() {
    try {
      const providerUrl = process.env.BLOCKCHAIN_PROVIDER_URL || 'http://localhost:8545';
      const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
      const contractAddress = process.env.SUPPLY_CHAIN_CONTRACT_ADDRESS;

      if (!privateKey || !contractAddress) {
        logger.warn('Blockchain configuration missing, using mock mode');
        return;
      }

      // Initialize provider
      const provider = new HDWalletProvider({
        privateKeys: [privateKey],
        providerOrUrl: providerUrl
      });

      this.web3 = new Web3(provider);
      this.account = (await this.web3.eth.getAccounts())[0];
      this.contractAddress = contractAddress;

      // Initialize contract (ABI would be loaded from file in real implementation)
      this.contract = new this.web3.eth.Contract(this.getContractABI(), contractAddress);

      logger.info('Blockchain service initialized', {
        account: this.account,
        contractAddress: this.contractAddress,
        network: await this.web3.eth.net.getId()
      });

    } catch (error) {
      logger.error('Failed to initialize blockchain service', error);
      // Fall back to mock mode
    }
  }

  private getContractABI() {
    // In real implementation, this would be loaded from compiled contract artifacts
    return [
      {
        'inputs': [
          {'name': '_productId', 'type': 'string'},
          {'name': '_batchNumber', 'type': 'string'},
          {'name': '_dataHash', 'type': 'string'}
        ],
        'name': 'createBatch',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function'
      },
      {
        'inputs': [
          {'name': '_batchId', 'type': 'string'},
          {'name': '_eventType', 'type': 'string'},
          {'name': '_location', 'type': 'string'},
          {'name': '_metadata', 'type': 'string'}
        ],
        'name': 'addEvent',
        'outputs': [],
        'stateMutability': 'nonpayable',
        'type': 'function'
      },
      {
        'inputs': [{'name': '_batchId', 'type': 'string'}],
        'name': 'getBatch',
        'outputs': [
          {'name': 'productId', 'type': 'string'},
          {'name': 'batchNumber', 'type': 'string'},
          {'name': 'dataHash', 'type': 'string'},
          {'name': 'verified', 'type': 'bool'}
        ],
        'stateMutability': 'view',
        'type': 'function'
      }
    ];
  }

  async createProductBatch(batch: Omit<ProductBatch, 'id' | 'events' | 'verified'>): Promise<ProductBatch> {
    try {
      const batchId = this.generateBatchId(batch.productId, batch.batchNumber);

      // Create initial supply chain event
      const creationEvent: SupplyChainEvent = {
        id: this.generateEventId(),
        productId: batch.productId,
        eventType: 'CREATED',
        timestamp: new Date(),
        location: {
          latitude: 0,
          longitude: 0,
          address: batch.origin.location
        },
        actor: {
          id: 'system',
          name: 'Supply Chain System',
          role: 'SYSTEM'
        },
        metadata: {
          batchNumber: batch.batchNumber,
          origin: batch.origin,
          qualityMetrics: batch.qualityMetrics
        },
        hash: ''
      };

      // Calculate event hash
      creationEvent.hash = this.calculateEventHash(creationEvent);

      const productBatch: ProductBatch = {
        id: batchId,
        ...batch,
        events: [creationEvent],
        verified: false
      };

      // Store on blockchain if available
      if (this.contract) {
        const dataHash = this.calculateBatchHash(productBatch);

        try {
          const receipt = await this.contract.methods.createBatch(
            batch.productId,
            batch.batchNumber,
            dataHash
          ).send({
            from: this.account,
            gas: 300000
          });

          creationEvent.blockNumber = receipt.blockNumber;
          creationEvent.transactionHash = receipt.transactionHash;
          productBatch.verified = true;

          logger.info('Batch created on blockchain', {
            batchId,
            transactionHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber
          });
        } catch (blockchainError) {
          logger.error('Failed to create batch on blockchain', blockchainError);
          // Continue with local storage
        }
      }

      // Store in cache for quick access
      await optimizedCache.set(`batch:${batchId}`, productBatch, { ttl: 86400 }); // 24 hours

      logger.info('Product batch created', {
        batchId,
        productId: batch.productId,
        batchNumber: batch.batchNumber
      });

      return productBatch;

    } catch (error) {
      logger.error('Failed to create product batch', error);
      throw error;
    }
  }

  async addSupplyChainEvent(batchId: string, event: Omit<SupplyChainEvent, 'id' | 'hash'>): Promise<SupplyChainEvent> {
    try {
      const batch = await this.getProductBatch(batchId);
      if (!batch) {
        throw new Error('Batch not found');
      }

      const supplyChainEvent: SupplyChainEvent = {
        id: this.generateEventId(),
        ...event,
        hash: ''
      };

      // Calculate event hash
      supplyChainEvent.hash = this.calculateEventHash(supplyChainEvent);

      // Add to blockchain if available
      if (this.contract) {
        try {
          const receipt = await this.contract.methods.addEvent(
            batchId,
            event.eventType,
            JSON.stringify(event.location),
            JSON.stringify(event.metadata)
          ).send({
            from: this.account,
            gas: 200000
          });

          supplyChainEvent.blockNumber = receipt.blockNumber;
          supplyChainEvent.transactionHash = receipt.transactionHash;

          logger.info('Event added to blockchain', {
            batchId,
            eventType: event.eventType,
            transactionHash: receipt.transactionHash
          });
        } catch (blockchainError) {
          logger.error('Failed to add event to blockchain', blockchainError);
          // Continue with local storage
        }
      }

      // Update batch
      batch.events.push(supplyChainEvent);

      // Update current location and owner if provided
      if (event.metadata.location) {
        batch.currentLocation = event.metadata.location;
      }
      if (event.metadata.owner) {
        batch.currentOwner = event.metadata.owner;
      }

      // Store updated batch
      await optimizedCache.set(`batch:${batchId}`, batch, { ttl: 86400 });

      logger.info('Supply chain event added', {
        batchId,
        eventId: supplyChainEvent.id,
        eventType: event.eventType
      });

      return supplyChainEvent;

    } catch (error) {
      logger.error('Failed to add supply chain event', error);
      throw error;
    }
  }

  async getProductBatch(batchId: string): Promise<ProductBatch | null> {
    try {
      // Try cache first
      const cached = await optimizedCache.get(`batch:${batchId}`);
      if (cached) {
        return cached;
      }

      // Try blockchain if available
      if (this.contract) {
        try {
          const result = await this.contract.methods.getBatch(batchId).call();

          if (result.productId) {
            // Reconstruct batch from blockchain data
            // In real implementation, you'd need to store and retrieve events separately
            logger.info('Batch retrieved from blockchain', { batchId });

            // For now, return null and let the application handle missing data
            return null;
          }
        } catch (blockchainError) {
          logger.error('Failed to retrieve batch from blockchain', blockchainError);
        }
      }

      return null;

    } catch (error) {
      logger.error('Failed to get product batch', error);
      throw error;
    }
  }

  async getSupplyChainHistory(productId: string): Promise<SupplyChainEvent[]> {
    try {
      const cacheKey = `supply_chain:${productId}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // In real implementation, query blockchain for all events related to this product
      const events: SupplyChainEvent[] = [];

      await optimizedCache.set(cacheKey, events, { ttl: 3600 }); // 1 hour
      return events;

    } catch (error) {
      logger.error('Failed to get supply chain history', error);
      throw error;
    }
  }

  async verifySupplyChainIntegrity(batchId: string): Promise<{
    isValid: boolean;
    issues: string[];
    verificationDetails: Record<string, any>;
  }> {
    try {
      const batch = await this.getProductBatch(batchId);
      if (!batch) {
        return {
          isValid: false,
          issues: ['Batch not found'],
          verificationDetails: {}
        };
      }

      const issues: string[] = [];
      const verificationDetails: Record<string, any> = {
        batchId,
        eventCount: batch.events.length,
        blockchainVerified: batch.verified
      };

      // Verify event hashes
      for (const event of batch.events) {
        const calculatedHash = this.calculateEventHash(event);
        if (calculatedHash !== event.hash) {
          issues.push(`Event ${event.id} has invalid hash`);
        }
      }

      // Verify chronological order
      for (let i = 1; i < batch.events.length; i++) {
        if (batch.events[i].timestamp < batch.events[i - 1].timestamp) {
          issues.push(`Event ${batch.events[i].id} is out of chronological order`);
        }
      }

      // Verify blockchain data if available
      if (this.contract && batch.verified) {
        try {
          const blockchainData = await this.contract.methods.getBatch(batchId).call();
          const currentHash = this.calculateBatchHash(batch);

          if (blockchainData.dataHash !== currentHash) {
            issues.push('Batch data does not match blockchain record');
          }
        } catch (error) {
          issues.push('Failed to verify against blockchain');
        }
      }

      const isValid = issues.length === 0;

      logger.info('Supply chain verification completed', {
        batchId,
        isValid,
        issueCount: issues.length
      });

      return {
        isValid,
        issues,
        verificationDetails
      };

    } catch (error) {
      logger.error('Failed to verify supply chain integrity', error);
      throw error;
    }
  }

  private generateBatchId(productId: string, batchNumber: string): string {
    return crypto.SHA256(`${productId}_${batchNumber}_${Date.now()}`).toString();
  }

  private generateEventId(): string {
    return crypto.SHA256(`${Date.now()}_${Math.random()}`).toString();
  }

  private calculateEventHash(event: Omit<SupplyChainEvent, 'hash'>): string {
    const eventData = {
      id: event.id,
      productId: event.productId,
      eventType: event.eventType,
      timestamp: event.timestamp.toISOString(),
      location: event.location,
      actor: event.actor,
      metadata: event.metadata
    };

    return crypto.SHA256(JSON.stringify(eventData)).toString();
  }

  private calculateBatchHash(batch: ProductBatch): string {
    const batchData = {
      id: batch.id,
      productId: batch.productId,
      batchNumber: batch.batchNumber,
      manufacturingDate: batch.manufacturingDate.toISOString(),
      expiryDate: batch.expiryDate.toISOString(),
      origin: batch.origin,
      qualityMetrics: batch.qualityMetrics,
      events: batch.events.map(e => e.hash)
    };

    return crypto.SHA256(JSON.stringify(batchData)).toString();
  }

  async getNetworkStatus(): Promise<{
    connected: boolean;
    networkId?: number;
    blockNumber?: number;
    gasPrice?: string;
  }> {
    try {
      if (!this.web3) {
        return { connected: false };
      }

      const [networkId, blockNumber, gasPrice] = await Promise.all([
        this.web3.eth.net.getId(),
        this.web3.eth.getBlockNumber(),
        this.web3.eth.getGasPrice()
      ]);

      return {
        connected: true,
        networkId,
        blockNumber,
        gasPrice: this.web3.utils.fromWei(gasPrice, 'gwei')
      };

    } catch (error) {
      logger.error('Failed to get network status', error);
      return { connected: false };
    }
  }
}

export const blockchainService = new BlockchainService();
