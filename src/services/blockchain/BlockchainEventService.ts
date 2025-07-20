import { EventEmitter } from 'events';

import Web3 from 'web3';

import { Logger } from '../../core/logging/logger';
import { pubsub } from '../../graphql/context';

import { blockchainService } from './BlockchainService';

const logger = new Logger('BlockchainEventService');

export interface BlockchainEvent {
  eventName: string;
  blockNumber: number;
  transactionHash: string;
  address: string;
  returnValues: Record<string, any>;
  timestamp: Date;
}

export class BlockchainEventService extends EventEmitter {
  private web3: Web3;
  private readonly eventSubscriptions: Map<string, any> = new Map();
  private isListening: boolean = false;

  constructor() {
    super();
    this.initializeEventListening();
  }

  private async initializeEventListening() {
    try {
      // Initialize Web3 for event listening
      const providerUrl = process.env.BLOCKCHAIN_PROVIDER_URL || 'ws://localhost:8545';

      if (providerUrl.startsWith('ws')) {
        this.web3 = new Web3(new Web3.providers.WebsocketProvider(providerUrl));
      } else {
        // Fallback to HTTP provider with polling
        this.web3 = new Web3(new Web3.providers.HttpProvider(providerUrl));
      }

      await this.setupEventListeners();
      this.isListening = true;

      logger.info('Blockchain event service initialized');

    } catch (error) {
      logger.error('Failed to initialize blockchain event service', error);
      // Continue without blockchain events
    }
  }

  private async setupEventListeners() {
    try {
      const contractAddress = process.env.SUPPLY_CHAIN_CONTRACT_ADDRESS;
      if (!contractAddress) {
        logger.warn('Contract address not configured, skipping event listeners');
        return;
      }

      // Get contract ABI (in real implementation, load from artifacts)
      const contract = new this.web3.eth.Contract(
        this.getContractABI(),
        contractAddress
      );

      // Listen for BatchCreated events
      const batchCreatedSubscription = contract.events.BatchCreated({
        fromBlock: 'latest'
      })
        .on('data', async (event: any) => this.handleBatchCreatedEvent(event))
        .on('error', (error: any) => logger.error('BatchCreated event error', error));

      this.eventSubscriptions.set('BatchCreated', batchCreatedSubscription);

      // Listen for SupplyChainEventAdded events
      const eventAddedSubscription = contract.events.SupplyChainEventAdded({
        fromBlock: 'latest'
      })
        .on('data', async (event: any) => this.handleSupplyChainEventAdded(event))
        .on('error', (error: any) => logger.error('SupplyChainEventAdded event error', error));

      this.eventSubscriptions.set('SupplyChainEventAdded', eventAddedSubscription);

      // Listen for ActorAuthorized events
      const actorAuthorizedSubscription = contract.events.ActorAuthorized({
        fromBlock: 'latest'
      })
        .on('data', async (event: any) => this.handleActorAuthorizedEvent(event))
        .on('error', (error: any) => logger.error('ActorAuthorized event error', error));

      this.eventSubscriptions.set('ActorAuthorized', actorAuthorizedSubscription);

      logger.info('Blockchain event listeners set up successfully');

    } catch (error) {
      logger.error('Failed to setup event listeners', error);
      throw error;
    }
  }

  private getContractABI() {
    // Same ABI as in BlockchainService - should be centralized in real implementation
    return [
      {
        'anonymous': false,
        'inputs': [
          {'indexed': true, 'name': 'batchId', 'type': 'string'},
          {'indexed': true, 'name': 'productId', 'type': 'string'},
          {'indexed': false, 'name': 'batchNumber', 'type': 'string'},
          {'indexed': false, 'name': 'creator', 'type': 'address'}
        ],
        'name': 'BatchCreated',
        'type': 'event'
      },
      {
        'anonymous': false,
        'inputs': [
          {'indexed': true, 'name': 'batchId', 'type': 'string'},
          {'indexed': false, 'name': 'eventType', 'type': 'string'},
          {'indexed': false, 'name': 'actor', 'type': 'address'},
          {'indexed': false, 'name': 'timestamp', 'type': 'uint256'}
        ],
        'name': 'SupplyChainEventAdded',
        'type': 'event'
      },
      {
        'anonymous': false,
        'inputs': [
          {'indexed': true, 'name': 'actor', 'type': 'address'},
          {'indexed': false, 'name': 'authorized', 'type': 'bool'}
        ],
        'name': 'ActorAuthorized',
        'type': 'event'
      }
    ];
  }

  private async handleBatchCreatedEvent(event: any) {
    try {
      const { batchId, productId, batchNumber, creator } = event.returnValues;

      logger.info('BatchCreated event received', {
        batchId,
        productId,
        batchNumber,
        creator,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });

      // Emit to internal event system
      this.emit('batchCreated', {
        batchId,
        productId,
        batchNumber,
        creator,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });

      // Publish to GraphQL subscriptions
      pubsub.publish('BATCH_CREATED', {
        batchCreated: {
          batchId,
          productId,
          batchNumber,
          creator,
          timestamp: new Date()
        }
      });

      // Process any additional business logic
      await this.processBatchCreatedEvent(event);

    } catch (error) {
      logger.error('Failed to handle BatchCreated event', error);
    }
  }

  private async handleSupplyChainEventAdded(event: any) {
    try {
      const { batchId, eventType, actor, timestamp } = event.returnValues;

      logger.info('SupplyChainEventAdded event received', {
        batchId,
        eventType,
        actor,
        timestamp,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });

      // Emit to internal event system
      this.emit('supplyChainEventAdded', {
        batchId,
        eventType,
        actor,
        timestamp,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });

      // Publish to GraphQL subscriptions
      pubsub.publish('SUPPLY_CHAIN_EVENT_ADDED', {
        supplyChainEventAdded: {
          batchId,
          eventType,
          actor,
          timestamp: new Date(parseInt(timestamp) * 1000)
        }
      });

      // Process any additional business logic
      await this.processSupplyChainEventAdded(event);

    } catch (error) {
      logger.error('Failed to handle SupplyChainEventAdded event', error);
    }
  }

  private async handleActorAuthorizedEvent(event: any) {
    try {
      const { actor, authorized } = event.returnValues;

      logger.info('ActorAuthorized event received', {
        actor,
        authorized,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });

      // Emit to internal event system
      this.emit('actorAuthorized', {
        actor,
        authorized,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });

      // Process any additional business logic
      await this.processActorAuthorizedEvent(event);

    } catch (error) {
      logger.error('Failed to handle ActorAuthorized event', error);
    }
  }

  private async processBatchCreatedEvent(event: any) {
    // Additional processing for batch creation
    // e.g., update local database, trigger notifications, etc.

    try {
      // Validate that the batch exists in our system
      const batch = await blockchainService.getProductBatch(event.returnValues.batchId);

      if (batch) {
        // Update verification status
        logger.info('Batch verified on blockchain', {
          batchId: event.returnValues.batchId
        });
      } else {
        logger.warn('Blockchain event for unknown batch', {
          batchId: event.returnValues.batchId
        });
      }

    } catch (error) {
      logger.error('Failed to process BatchCreated event', error);
    }
  }

  private async processSupplyChainEventAdded(event: any) {
    // Additional processing for supply chain events

    try {
      const { batchId, eventType } = event.returnValues;

      // Trigger quality checks for certain event types
      if (['RECEIVED', 'QUALITY_CHECK'].includes(eventType)) {
        // Could trigger automated quality analysis
        logger.info('Quality check triggered by blockchain event', {
          batchId,
          eventType
        });
      }

      // Trigger compliance checks
      if (eventType === 'DELIVERED') {
        // Could trigger automated compliance reporting
        logger.info('Delivery compliance check triggered', {
          batchId
        });
      }

    } catch (error) {
      logger.error('Failed to process SupplyChainEventAdded event', error);
    }
  }

  private async processActorAuthorizedEvent(event: any) {
    // Additional processing for actor authorization

    try {
      const { actor, authorized } = event.returnValues;

      logger.info('Actor authorization processed', {
        actor,
        authorized
      });

      // Could update local permission cache, notify admin, etc.

    } catch (error) {
      logger.error('Failed to process ActorAuthorized event', error);
    }
  }

  async getEventHistory(
    eventName: string,
    fromBlock: number = 0,
    toBlock: number | string = 'latest'
  ): Promise<BlockchainEvent[]> {
    try {
      if (!this.web3) {
        throw new Error('Web3 not initialized');
      }

      const contractAddress = process.env.SUPPLY_CHAIN_CONTRACT_ADDRESS;
      if (!contractAddress) {
        throw new Error('Contract address not configured');
      }

      const contract = new this.web3.eth.Contract(
        this.getContractABI(),
        contractAddress
      );

      const events = await contract.getPastEvents(eventName, {
        fromBlock,
        toBlock
      });

      return events.map(event => ({
        eventName: event.event,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        address: event.address,
        returnValues: event.returnValues,
        timestamp: new Date() // Would need to get actual block timestamp
      }));

    } catch (error) {
      logger.error('Failed to get event history', error);
      throw error;
    }
  }

  async subscribeToCustomEvent(
    eventName: string,
    filter: Record<string, any> = {},
    callback: (event: BlockchainEvent) => void
  ): Promise<string> {
    try {
      const subscriptionId = `${eventName}_${Date.now()}`;

      // Add internal event listener
      this.on(eventName, callback);

      logger.info('Custom event subscription created', {
        eventName,
        subscriptionId,
        filter
      });

      return subscriptionId;

    } catch (error) {
      logger.error('Failed to subscribe to custom event', error);
      throw error;
    }
  }

  async unsubscribeFromEvent(subscriptionId: string): Promise<void> {
    try {
      const subscription = this.eventSubscriptions.get(subscriptionId);

      if (subscription) {
        await subscription.unsubscribe();
        this.eventSubscriptions.delete(subscriptionId);

        logger.info('Event subscription removed', { subscriptionId });
      }

    } catch (error) {
      logger.error('Failed to unsubscribe from event', error);
      throw error;
    }
  }

  getSubscriptionStatus(): {
    isListening: boolean;
    activeSubscriptions: string[];
    connectionStatus: 'connected' | 'disconnected' | 'error';
    } {
    return {
      isListening: this.isListening,
      activeSubscriptions: Array.from(this.eventSubscriptions.keys()),
      connectionStatus: this.web3 ? 'connected' : 'disconnected'
    };
  }

  async stop(): Promise<void> {
    try {
      // Unsubscribe from all events
      for (const [name, subscription] of this.eventSubscriptions) {
        try {
          await subscription.unsubscribe();
        } catch (error) {
          logger.error(`Failed to unsubscribe from ${name}`, error);
        }
      }

      this.eventSubscriptions.clear();
      this.isListening = false;

      logger.info('Blockchain event service stopped');

    } catch (error) {
      logger.error('Failed to stop blockchain event service', error);
      throw error;
    }
  }
}

export const blockchainEventService = new BlockchainEventService();
