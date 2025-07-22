/**
 * Circuit Breaker Pattern Implementation
 * Provides fault tolerance and prevents cascading failures
 */

import { EventEmitter } from 'events';
import { Logger } from '../logging/logger';
import { MetricsService } from '../monitoring/metrics';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors?: (error: Error) => boolean;
  onStateChange?: (state: CircuitState, error?: Error) => void;
  fallback?: () => any;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  failureRate: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

export class CircuitBreaker extends EventEmitter {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly name: string;
  private readonly options: CircuitBreakerOptions;

  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;

  constructor(
    name: string,
    options: CircuitBreakerOptions,
    metrics: MetricsService
  ) {
    super();
    this.name = name;
    this.options = {
      expectedErrors: () => true, // All errors are expected by default
      ...options
    };
    this.metrics = metrics;
    this.logger = new Logger(`CircuitBreaker:${name}`);

    this.setupMetrics();
    this.startMonitoring();
  }

  private setupMetrics(): void {
    this.on('stateChange', (newState: CircuitState, oldState: CircuitState) => {
      this.metrics.setGauge('circuit_breaker_state', this.getStateValue(newState), { 
        name: this.name 
      });
      
      this.metrics.incrementCounter('circuit_breaker_state_changes_total', { 
        name: this.name,
        from: oldState,
        to: newState
      });

      this.logger.info('Circuit breaker state changed', { 
        name: this.name,
        from: oldState,
        to: newState 
      });
    });

    this.on('success', () => {
      this.metrics.incrementCounter('circuit_breaker_successes_total', { name: this.name });
    });

    this.on('failure', () => {
      this.metrics.incrementCounter('circuit_breaker_failures_total', { name: this.name });
    });

    this.on('fallback', () => {
      this.metrics.incrementCounter('circuit_breaker_fallbacks_total', { name: this.name });
    });
  }

  private startMonitoring(): void {
    setInterval(() => {
      this.updateMetrics();
      this.checkStateTransitions();
    }, this.options.monitoringPeriod);
  }

  /**
   * Execute a function with circuit breaker protection
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.setState(CircuitState.HALF_OPEN);
      } else {
        return this.handleOpenCircuit<T>();
      }
    }

    this.totalRequests++;

    try {
      const result = await this.callFunction(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Execute with timeout
   */
  public async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timeout')), timeout);
    });

    return this.execute(() => Promise.race([fn(), timeoutPromise]));
  }

  /**
   * Execute with retry logic
   */
  public async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.execute(fn);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries && this.state !== CircuitState.OPEN) {
          await this.delay(delay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    throw lastError!;
  }

  private async callFunction<T>(fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      
      this.metrics.observeHistogram(
        'circuit_breaker_request_duration_ms',
        Date.now() - startTime,
        { name: this.name, result: 'success' }
      );
      
      return result;
    } catch (error) {
      this.metrics.observeHistogram(
        'circuit_breaker_request_duration_ms',
        Date.now() - startTime,
        { name: this.name, result: 'failure' }
      );
      
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.emit('success');

    if (this.state === CircuitState.HALF_OPEN) {
      this.setState(CircuitState.CLOSED);
      this.reset();
    }
  }

  private onFailure(error: Error): void {
    if (this.options.expectedErrors && !this.options.expectedErrors(error)) {
      return; // Don't count unexpected errors
    }

    this.failureCount++;
    this.lastFailureTime = new Date();
    this.emit('failure', error);

    if (this.shouldOpenCircuit()) {
      this.setState(CircuitState.OPEN);
      this.calculateNextAttemptTime();
    }
  }

  private shouldOpenCircuit(): boolean {
    if (this.state === CircuitState.OPEN) {
      return false;
    }

    return this.failureCount >= this.options.failureThreshold;
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) {
      return false;
    }

    return Date.now() >= this.nextAttemptTime.getTime();
  }

  private handleOpenCircuit<T>(): T {
    this.metrics.incrementCounter('circuit_breaker_rejected_requests_total', { 
      name: this.name 
    });

    if (this.options.fallback) {
      this.emit('fallback');
      return this.options.fallback();
    }

    throw new Error(`Circuit breaker '${this.name}' is OPEN`);
  }

  private setState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    
    this.emit('stateChange', newState, oldState);
    
    if (this.options.onStateChange) {
      this.options.onStateChange(newState);
    }
  }

  private calculateNextAttemptTime(): void {
    this.nextAttemptTime = new Date(Date.now() + this.options.recoveryTimeout);
  }

  private reset(): void {
    this.failureCount = 0;
    this.nextAttemptTime = undefined;
    this.lastFailureTime = undefined;
  }

  private checkStateTransitions(): void {
    if (this.state === CircuitState.OPEN && this.shouldAttemptReset()) {
      this.logger.debug('Circuit breaker ready for reset attempt', { name: this.name });
    }
  }

  private updateMetrics(): void {
    const stats = this.getStats();
    
    this.metrics.setGauge('circuit_breaker_failure_count', stats.failureCount, { 
      name: this.name 
    });
    
    this.metrics.setGauge('circuit_breaker_success_count', stats.successCount, { 
      name: this.name 
    });
    
    this.metrics.setGauge('circuit_breaker_total_requests', stats.totalRequests, { 
      name: this.name 
    });
    
    this.metrics.setGauge('circuit_breaker_failure_rate', stats.failureRate, { 
      name: this.name 
    });
  }

  private getStateValue(state: CircuitState): number {
    switch (state) {
      case CircuitState.CLOSED: return 0;
      case CircuitState.HALF_OPEN: return 1;
      case CircuitState.OPEN: return 2;
      default: return -1;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current statistics
   */
  public getStats(): CircuitBreakerStats {
    const failureRate = this.totalRequests > 0 ? 
      this.failureCount / this.totalRequests : 0;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      failureRate,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Force state change (for testing or manual intervention)
   */
  public forceState(state: CircuitState): void {
    this.setState(state);
    
    if (state === CircuitState.CLOSED) {
      this.reset();
    } else if (state === CircuitState.OPEN) {
      this.calculateNextAttemptTime();
    }
  }

  /**
   * Reset all counters
   */
  public resetCounters(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
  }
}

/**
 * Circuit Breaker Manager for handling multiple circuit breakers
 */
export class CircuitBreakerManager {
  private readonly logger = new Logger('CircuitBreakerManager');
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly metrics: MetricsService;

  constructor(metrics: MetricsService) {
    this.metrics = metrics;
  }

  /**
   * Create or get a circuit breaker
   */
  public getCircuitBreaker(
    name: string,
    options: CircuitBreakerOptions
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const circuitBreaker = new CircuitBreaker(name, options, this.metrics);
      this.circuitBreakers.set(name, circuitBreaker);
      
      this.logger.info('Circuit breaker created', { name, options });
    }

    return this.circuitBreakers.get(name)!;
  }

  /**
   * Execute function with named circuit breaker
   */
  public async execute<T>(
    name: string,
    fn: () => Promise<T>,
    options?: CircuitBreakerOptions
  ): Promise<T> {
    if (!options) {
      throw new Error(`Circuit breaker '${name}' not found and no options provided`);
    }

    const circuitBreaker = this.getCircuitBreaker(name, options);
    return circuitBreaker.execute(fn);
  }

  /**
   * Get all circuit breaker statistics
   */
  public getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, circuitBreaker] of this.circuitBreakers) {
      stats[name] = circuitBreaker.getStats();
    }

    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  public resetAll(): void {
    for (const [name, circuitBreaker] of this.circuitBreakers) {
      circuitBreaker.resetCounters();
      circuitBreaker.forceState(CircuitState.CLOSED);
      this.logger.info('Circuit breaker reset', { name });
    }
  }

  /**
   * Get circuit breaker by name
   */
  public get(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }

  /**
   * Remove circuit breaker
   */
  public remove(name: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(name);
    if (circuitBreaker) {
      circuitBreaker.removeAllListeners();
      this.circuitBreakers.delete(name);
      this.logger.info('Circuit breaker removed', { name });
      return true;
    }
    return false;
  }

  /**
   * Get health status of all circuit breakers
   */
  public getHealthStatus(): {
    healthy: boolean;
    circuitBreakers: Array<{
      name: string;
      state: CircuitState;
      healthy: boolean;
    }>;
  } {
    const circuitBreakers: Array<{
      name: string;
      state: CircuitState;
      healthy: boolean;
    }> = [];

    let allHealthy = true;

    for (const [name, circuitBreaker] of this.circuitBreakers) {
      const stats = circuitBreaker.getStats();
      const healthy = stats.state !== CircuitState.OPEN;
      
      circuitBreakers.push({
        name,
        state: stats.state,
        healthy
      });

      if (!healthy) {
        allHealthy = false;
      }
    }

    return {
      healthy: allHealthy,
      circuitBreakers
    };
  }
}

// Pre-configured circuit breakers for common scenarios
export const CircuitBreakerTemplates = {
  database: (name: string): CircuitBreakerOptions => ({
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 5000, // 5 seconds
    expectedErrors: (error: Error) => !error.message.includes('timeout')
  }),

  externalApi: (name: string): CircuitBreakerOptions => ({
    failureThreshold: 10,
    recoveryTimeout: 30000, // 30 seconds
    monitoringPeriod: 5000, // 5 seconds
    expectedErrors: (error: Error) => 
      error.message.includes('timeout') || 
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('503')
  }),

  paymentGateway: (name: string): CircuitBreakerOptions => ({
    failureThreshold: 3,
    recoveryTimeout: 120000, // 2 minutes
    monitoringPeriod: 10000, // 10 seconds
    expectedErrors: (error: Error) => 
      !error.message.includes('invalid_request') &&
      !error.message.includes('unauthorized')
  }),

  emailService: (name: string): CircuitBreakerOptions => ({
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    monitoringPeriod: 5000, // 5 seconds
    fallback: () => {
      console.log('Email service unavailable, logging instead');
      return { queued: true };
    }
  })
};

export default CircuitBreaker;