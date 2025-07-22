/**
 * Enterprise Event Bus Implementation
 * Supports domain events, integration events, and event sourcing patterns
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { Logger } from '../logging/logger';
import { MetricsService } from '../monitoring/metrics';

export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  data: Record<string, any>;
  metadata: {
    timestamp: Date;
    userId?: string;
    correlationId?: string;
    causationId?: string;
    source: string;
  };
}

export interface IntegrationEvent {
  id: string;
  type: string;
  data: Record<string, any>;
  metadata: {
    timestamp: Date;
    source: string;
    version: string;
    correlationId?: string;
  };
}

export interface EventHandler<T = any> {
  handle(event: T): Promise<void> | void;
}

export interface EventSubscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  options: SubscriptionOptions;
}

export interface SubscriptionOptions {
  retryPolicy?: RetryPolicy;
  deadLetterQueue?: boolean;
  maxRetries?: number;
  timeout?: number;
  bulkSize?: number;
  concurrency?: number;
}

export interface RetryPolicy {
  type: 'exponential' | 'linear' | 'fixed';
  initialDelay: number;
  maxDelay: number;
  multiplier?: number;
}

export class EventBus extends EventEmitter {
  private readonly logger = new Logger('EventBus');
  private readonly metrics: MetricsService;
  private readonly redis?: Redis;
  private readonly subscriptions = new Map<string, EventSubscription[]>();
  private readonly eventStore = new Map<string, DomainEvent[]>();
  private readonly processing = new Map<string, boolean>();

  constructor(
    metrics: MetricsService,
    redisClient?: Redis
  ) {
    super();
    this.metrics = metrics;
    this.redis = redisClient;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.on('error', (error) => {
      this.logger.error('EventBus error', { error: error.message, stack: error.stack });
      this.metrics.incrementCounter('eventbus_errors_total');
    });

    // Setup Redis event handling if available
    if (this.redis) {
      this.setupRedisEventHandling();
    }
  }

  private setupRedisEventHandling(): void {
    if (!this.redis) return;

    // Subscribe to Redis Streams for distributed events
    this.redis.xgroup(
      'CREATE', 
      'domain_events', 
      'foodxchange_consumers', 
      '$', 
      'MKSTREAM'
    ).catch(() => {
      // Group might already exist
    });

    this.startRedisConsumer();
  }

  private async startRedisConsumer(): Promise<void> {
    if (!this.redis) return;

    const consumerId = `consumer-${process.pid}-${Date.now()}`;
    
    while (true) {
      try {
        const results = await this.redis.xreadgroup(
          'GROUP', 'foodxchange_consumers', consumerId,
          'COUNT', '10',
          'BLOCK', '1000',
          'STREAMS', 'domain_events', '>'
        );

        if (results && results.length > 0) {
          for (const result of results) {
            const [stream, messages] = result as [string, [string, string[]][]];
            for (const [messageId, fields] of messages) {
              await this.processRedisMessage(messageId, fields);
            }
          }
        }
      } catch (error) {
        this.logger.error('Redis consumer error', { error });
        await this.delay(5000); // Wait before retry
      }
    }
  }

  private async processRedisMessage(messageId: string, fields: string[]): Promise<void> {
    try {
      // Parse Redis message format
      const eventData: any = {};
      for (let i = 0; i < fields.length; i += 2) {
        eventData[fields[i]] = JSON.parse(fields[i + 1]);
      }

      const event: DomainEvent = eventData as DomainEvent;
      await this.handleEvent(event);

      // Acknowledge message
      if (this.redis) {
        await this.redis.xack('domain_events', 'foodxchange_consumers', messageId);
      }
    } catch (error) {
      this.logger.error('Failed to process Redis message', { messageId, error });
    }
  }

  /**
   * Publish a domain event
   */
  public async publishDomainEvent(event: DomainEvent): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Store event locally
      this.storeEvent(event);

      // Emit locally
      super.emit(event.type, event);

      // Publish to Redis if available
      if (this.redis) {
        await this.redis.xadd(
          'domain_events',
          '*',
          'id', event.id,
          'type', event.type,
          'aggregateId', event.aggregateId,
          'aggregateType', event.aggregateType,
          'version', event.version.toString(),
          'data', JSON.stringify(event.data),
          'metadata', JSON.stringify(event.metadata)
        );
      }

      this.metrics.incrementCounter('eventbus_events_published_total', { type: event.type });
      this.metrics.observeHistogram('eventbus_publish_duration_ms', Date.now() - startTime);
      
      this.logger.debug('Domain event published', { 
        eventType: event.type, 
        aggregateId: event.aggregateId 
      });

    } catch (error) {
      this.metrics.incrementCounter('eventbus_publish_errors_total', { type: event.type });
      this.logger.error('Failed to publish domain event', { event, error });
      throw error;
    }
  }

  /**
   * Publish an integration event
   */
  public async publishIntegrationEvent(event: IntegrationEvent): Promise<void> {
    const startTime = Date.now();

    try {
      // Emit locally
      super.emit(event.type, event);

      // Publish to Redis if available
      if (this.redis) {
        await this.redis.xadd(
          'integration_events',
          '*',
          'id', event.id,
          'type', event.type,
          'data', JSON.stringify(event.data),
          'metadata', JSON.stringify(event.metadata)
        );
      }

      this.metrics.incrementCounter('eventbus_integration_events_published_total', { type: event.type });
      this.metrics.observeHistogram('eventbus_integration_publish_duration_ms', Date.now() - startTime);
      
      this.logger.debug('Integration event published', { eventType: event.type });

    } catch (error) {
      this.metrics.incrementCounter('eventbus_integration_publish_errors_total', { type: event.type });
      this.logger.error('Failed to publish integration event', { event, error });
      throw error;
    }
  }

  /**
   * Subscribe to events with advanced options
   */
  public subscribe<T>(
    eventType: string,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): string {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const subscription: EventSubscription = {
      id: subscriptionId,
      eventType,
      handler,
      options: {
        maxRetries: 3,
        timeout: 30000,
        deadLetterQueue: true,
        ...options
      }
    };

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    this.subscriptions.get(eventType)!.push(subscription);

    // Register local event handler
    super.on(eventType, (event) => this.handleSubscription(subscription, event));

    this.logger.debug('Event subscription created', { eventType, subscriptionId });
    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  public unsubscribe(subscriptionId: string): boolean {
    for (const [eventType, subscriptions] of this.subscriptions) {
      const index = subscriptions.findIndex(sub => sub.id === subscriptionId);
      if (index !== -1) {
        subscriptions.splice(index, 1);
        if (subscriptions.length === 0) {
          this.subscriptions.delete(eventType);
        }
        this.logger.debug('Event subscription removed', { subscriptionId, eventType });
        return true;
      }
    }
    return false;
  }

  private async handleSubscription(subscription: EventSubscription, event: any): Promise<void> {
    const { handler, options } = subscription;
    const key = `${subscription.id}-${event.id || Date.now()}`;

    if (this.processing.has(key)) {
      return; // Already processing
    }

    this.processing.set(key, true);

    try {
      await this.executeWithRetry(
        () => this.executeHandler(handler, event, options.timeout),
        options.retryPolicy || { type: 'exponential', initialDelay: 1000, maxDelay: 30000 },
        options.maxRetries || 3
      );

      this.metrics.incrementCounter('eventbus_events_processed_total', { 
        type: event.type || 'unknown' 
      });

    } catch (error) {
      this.metrics.incrementCounter('eventbus_events_failed_total', { 
        type: event.type || 'unknown' 
      });

      if (options.deadLetterQueue) {
        await this.sendToDeadLetterQueue(event, subscription, error);
      }

      this.logger.error('Event handler failed', { 
        subscriptionId: subscription.id, 
        eventType: subscription.eventType, 
        error 
      });
    } finally {
      this.processing.delete(key);
    }
  }

  private async executeHandler(
    handler: EventHandler,
    event: any,
    timeout?: number
  ): Promise<void> {
    if (timeout) {
      return Promise.race([
        Promise.resolve(handler.handle(event)),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Handler timeout')), timeout)
        )
      ]);
    } else {
      return Promise.resolve(handler.handle(event));
    }
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retryPolicy: RetryPolicy,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          const delay = this.calculateDelay(retryPolicy, attempt);
          await this.delay(delay);
        }
      }
    }

    throw lastError!;
  }

  private calculateDelay(retryPolicy: RetryPolicy, attempt: number): number {
    switch (retryPolicy.type) {
      case 'exponential':
        return Math.min(
          retryPolicy.initialDelay * Math.pow(retryPolicy.multiplier || 2, attempt),
          retryPolicy.maxDelay
        );
      case 'linear':
        return Math.min(
          retryPolicy.initialDelay + (attempt * (retryPolicy.multiplier || 1000)),
          retryPolicy.maxDelay
        );
      case 'fixed':
      default:
        return retryPolicy.initialDelay;
    }
  }

  private async sendToDeadLetterQueue(
    event: any,
    subscription: EventSubscription,
    error: Error
  ): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.xadd(
          'dead_letter_queue',
          '*',
          'subscriptionId', subscription.id,
          'eventType', subscription.eventType,
          'event', JSON.stringify(event),
          'error', error.message,
          'timestamp', new Date().toISOString()
        );
      }

      this.logger.warn('Event sent to dead letter queue', { 
        subscriptionId: subscription.id, 
        eventType: subscription.eventType,
        error: error.message
      });
    } catch (dlqError) {
      this.logger.error('Failed to send to dead letter queue', { dlqError });
    }
  }

  private async handleEvent(event: DomainEvent): Promise<void> {
    const subscriptions = this.subscriptions.get(event.type) || [];
    
    await Promise.all(
      subscriptions.map(subscription => 
        this.handleSubscription(subscription, event)
      )
    );
  }

  private storeEvent(event: DomainEvent): void {
    const key = `${event.aggregateType}:${event.aggregateId}`;
    
    if (!this.eventStore.has(key)) {
      this.eventStore.set(key, []);
    }
    
    this.eventStore.get(key)!.push(event);

    // Keep only last 1000 events per aggregate
    const events = this.eventStore.get(key)!;
    if (events.length > 1000) {
      events.splice(0, events.length - 1000);
    }
  }

  /**
   * Get event history for an aggregate
   */
  public getEventHistory(aggregateType: string, aggregateId: string): DomainEvent[] {
    const key = `${aggregateType}:${aggregateId}`;
    return this.eventStore.get(key) || [];
  }

  /**
   * Replay events for an aggregate
   */
  public async replayEvents(
    aggregateType: string,
    aggregateId: string,
    fromVersion?: number
  ): Promise<void> {
    const events = this.getEventHistory(aggregateType, aggregateId);
    const filteredEvents = fromVersion ? 
      events.filter(e => e.version >= fromVersion) : 
      events;

    for (const event of filteredEvents) {
      await this.handleEvent(event);
    }
  }

  /**
   * Get event bus statistics
   */
  public getStats(): {
    subscriptions: number;
    processingEvents: number;
    storedEvents: number;
  } {
    let totalSubscriptions = 0;
    for (const subs of this.subscriptions.values()) {
      totalSubscriptions += subs.length;
    }

    let totalStoredEvents = 0;
    for (const events of this.eventStore.values()) {
      totalStoredEvents += events.length;
    }

    return {
      subscriptions: totalSubscriptions,
      processingEvents: this.processing.size,
      storedEvents: totalStoredEvents
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Event factory helpers
export class EventFactory {
  public static createDomainEvent<T>(
    type: string,
    aggregateId: string,
    aggregateType: string,
    version: number,
    data: T,
    userId?: string,
    correlationId?: string
  ): DomainEvent {
    return {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      aggregateId,
      aggregateType,
      version,
      data: data as Record<string, any>,
      metadata: {
        timestamp: new Date(),
        userId,
        correlationId,
        source: 'foodxchange-backend'
      }
    };
  }

  public static createIntegrationEvent<T>(
    type: string,
    data: T,
    correlationId?: string
  ): IntegrationEvent {
    return {
      id: `int-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      data: data as Record<string, any>,
      metadata: {
        timestamp: new Date(),
        source: 'foodxchange-backend',
        version: '1.0.0',
        correlationId
      }
    };
  }
}

export default EventBus;