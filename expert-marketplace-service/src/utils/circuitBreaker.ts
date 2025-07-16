import { productionLogger } from './productionLogger';

export interface CircuitBreakerOptions {
  timeout: number;
  errorThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  expectedErrors?: string[];
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private nextAttempt: number = Date.now();
  private readonly options: CircuitBreakerOptions;
  private readonly name: string;

  constructor(name: string, options: CircuitBreakerOptions) {
    this.name = name;
    this.options = {
      timeout: 5000,
      errorThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 10000,
      expectedErrors: [],
      ...options
    };

    // Start monitoring
    this.startMonitoring();
  }

  private startMonitoring(): void {
    setInterval(() => {
      this.logMetrics();
      this.resetCounters();
    }, this.options.monitoringPeriod);
  }

  private resetCounters(): void {
    this.failures = 0;
    this.successes = 0;
  }

  private logMetrics(): void {
    productionLogger.info(`Circuit breaker metrics for ${this.name}`, {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttempt: this.nextAttempt
    });
  }

  private shouldAttemptReset(): boolean {
    return Date.now() >= this.nextAttempt;
  }

  private onSuccess(): void {
    this.failures = 0;
    this.successes++;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
      productionLogger.info(`Circuit breaker ${this.name} closed after successful request`);
    }
  }

  private onFailure(error: Error): void {
    this.failures++;
    
    // Check if it's an expected error that shouldn't count as failure
    if (this.options.expectedErrors?.some(expected => error.message.includes(expected))) {
      return;
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      productionLogger.warn(`Circuit breaker ${this.name} opened after failure in half-open state`);
    } else if (this.failures >= this.options.errorThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = Date.now() + this.options.resetTimeout;
      productionLogger.error(`Circuit breaker ${this.name} opened after ${this.failures} failures`);
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
        productionLogger.info(`Circuit breaker ${this.name} entering half-open state`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Circuit breaker timeout')), this.options.timeout);
        })
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics(): {
    state: CircuitBreakerState;
    failures: number;
    successes: number;
    nextAttempt: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttempt: this.nextAttempt
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    productionLogger.info(`Circuit breaker ${this.name} manually reset`);
  }
}

// Circuit breaker registry
export class CircuitBreakerRegistry {
  private static breakers: Map<string, CircuitBreaker> = new Map();

  static getOrCreate(name: string, options: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name)!;
  }

  static get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  static getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  static reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }

  static resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }
}

// Pre-configured circuit breakers for common services
export const circuitBreakers = {
  database: CircuitBreakerRegistry.getOrCreate('database', {
    timeout: 5000,
    errorThreshold: 5,
    resetTimeout: 30000,
    monitoringPeriod: 10000
  }),
  
  redis: CircuitBreakerRegistry.getOrCreate('redis', {
    timeout: 3000,
    errorThreshold: 3,
    resetTimeout: 15000,
    monitoringPeriod: 5000
  }),
  
  whatsapp: CircuitBreakerRegistry.getOrCreate('whatsapp', {
    timeout: 10000,
    errorThreshold: 5,
    resetTimeout: 60000,
    monitoringPeriod: 30000,
    expectedErrors: ['rate_limit', 'temporary_failure']
  }),
  
  azure: CircuitBreakerRegistry.getOrCreate('azure', {
    timeout: 15000,
    errorThreshold: 3,
    resetTimeout: 45000,
    monitoringPeriod: 20000
  }),
  
  email: CircuitBreakerRegistry.getOrCreate('email', {
    timeout: 10000,
    errorThreshold: 5,
    resetTimeout: 30000,
    monitoringPeriod: 15000
  })
};