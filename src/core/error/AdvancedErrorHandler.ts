/**
 * Advanced Error Handling and Recovery System
 * Enterprise-grade error handling with automatic recovery, circuit breakers,
 * dead letter queues, and comprehensive error analysis
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from '../logging/logger';
import { MetricsService } from '../monitoring/metrics';
import { EventBus, EventFactory } from '../events/EventBus';
import { CircuitBreaker, CircuitBreakerManager } from '../resilience/CircuitBreaker';
import { TracingService } from '../observability/TracingService';

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  correlationId?: string;
  operation?: string;
  resource?: string;
  metadata?: Record<string, any>;
}

export interface ErrorRecoveryStrategy {
  type: 'retry' | 'fallback' | 'circuit_breaker' | 'dead_letter' | 'manual';
  maxAttempts?: number;
  backoffMs?: number;
  fallbackValue?: any;
  fallbackFunction?: () => Promise<any> | any;
}

export interface ErrorPattern {
  name: string;
  matcher: (error: Error, context?: ErrorContext) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recovery: ErrorRecoveryStrategy;
  alertThreshold?: number;
  suppressDuplicates?: boolean;
}

export interface ErrorAnalysis {
  errorType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern?: ErrorPattern;
  frequency: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  recoverable: boolean;
  suggestedActions: string[];
}

export class AdvancedErrorHandler {
  private readonly logger = new Logger('AdvancedErrorHandler');
  private readonly metrics: MetricsService;
  private readonly eventBus: EventBus;
  private readonly circuitBreakerManager: CircuitBreakerManager;
  private readonly tracing: TracingService;

  // Error tracking
  private readonly errorHistory = new Map<string, ErrorAnalysis>();
  private readonly recentErrors = new Map<string, number>(); // For duplicate suppression
  private readonly deadLetterQueue: Array<{ error: Error; context: ErrorContext; timestamp: Date }> = [];
  
  // Built-in error patterns
  private readonly errorPatterns: ErrorPattern[] = [
    {
      name: 'DatabaseTimeout',
      matcher: (error) => error.message.includes('timeout') && error.message.includes('database'),
      severity: 'high',
      recovery: { type: 'retry', maxAttempts: 3, backoffMs: 1000 },
      alertThreshold: 5
    },
    {
      name: 'ExternalServiceUnavailable',
      matcher: (error) => error.message.includes('ECONNREFUSED') || error.message.includes('503'),
      severity: 'medium',
      recovery: { type: 'circuit_breaker', fallbackValue: null },
      alertThreshold: 10
    },
    {
      name: 'ValidationError',
      matcher: (error) => error.name === 'ValidationError',
      severity: 'low',
      recovery: { type: 'fallback', fallbackValue: { error: 'Invalid input' } },
      suppressDuplicates: true
    },
    {
      name: 'AuthenticationError',
      matcher: (error) => error.message.includes('authentication') || error.message.includes('unauthorized'),
      severity: 'medium',
      recovery: { type: 'fallback', fallbackValue: { error: 'Authentication required' } },
      alertThreshold: 50
    },
    {
      name: 'RateLimitExceeded',
      matcher: (error) => error.message.includes('rate limit') || error.message.includes('too many requests'),
      severity: 'medium',
      recovery: { type: 'retry', maxAttempts: 1, backoffMs: 5000 },
      suppressDuplicates: true
    },
    {
      name: 'OutOfMemory',
      matcher: (error) => error.message.includes('out of memory') || error.name === 'HeapSpaceError',
      severity: 'critical',
      recovery: { type: 'dead_letter' },
      alertThreshold: 1
    }
  ];

  constructor(
    metrics: MetricsService,
    eventBus: EventBus,
    circuitBreakerManager: CircuitBreakerManager,
    tracing: TracingService
  ) {
    this.metrics = metrics;
    this.eventBus = eventBus;
    this.circuitBreakerManager = circuitBreakerManager;
    this.tracing = tracing;

    this.initialize();
  }

  private initialize(): void {
    // Setup periodic cleanup and analysis
    setInterval(() => {
      this.analyzeErrorPatterns();
      this.cleanupOldErrors();
    }, 60000); // Every minute

    // Setup dead letter queue processing
    setInterval(() => {
      this.processDeadLetterQueue();
    }, 300000); // Every 5 minutes

    this.logger.info('Advanced error handler initialized');
  }

  /**
   * Express middleware for automatic error handling
   */
  public middleware() {
    return (error: Error, req: Request, res: Response, next: NextFunction) => {
      this.handleError(error, {
        requestId: (req as any).requestId,
        userId: (req as any).user?.id,
        correlationId: (req as any).correlationId,
        operation: `${req.method} ${req.path}`,
        resource: req.originalUrl,
        metadata: {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          body: req.body,
          query: req.query
        }
      }).then(result => {
        if (result.handled) {
          if (result.response) {
            res.status(result.statusCode || 500).json(result.response);
          } else {
            res.status(500).json({ error: 'Internal server error' });
          }
        } else {
          next(error);
        }
      }).catch(handlerError => {
        this.logger.error('Error handler failed', { originalError: error, handlerError });
        res.status(500).json({ error: 'Internal server error' });
      });
    };
  }

  /**
   * Handle error with automatic recovery and analysis
   */
  public async handleError(
    error: Error,
    context: ErrorContext = {}
  ): Promise<{
    handled: boolean;
    recovered?: boolean;
    response?: any;
    statusCode?: number;
    retryAfter?: number;
  }> {
    const errorId = this.generateErrorId(error, context);
    
    try {
      // Create trace span for error handling
      return await this.tracing.withSpan(
        'error.handle',
        async (span) => {
          span.setAttributes({
            'error.name': error.name,
            'error.message': error.message,
            'error.stack': error.stack || '',
            'error.context.operation': context.operation || 'unknown',
            'error.context.userId': context.userId || 'anonymous'
          });

          // Update error analysis
          this.updateErrorAnalysis(error, context);

          // Find matching pattern
          const pattern = this.findErrorPattern(error, context);
          
          // Record metrics
          this.recordErrorMetrics(error, pattern, context);

          // Attempt recovery
          let result = await this.attemptRecovery(error, pattern, context);

          // Publish error event
          await this.publishErrorEvent(error, context, pattern, result.recovered);

          // Check if alerting is needed
          if (pattern && this.shouldAlert(pattern, error)) {
            await this.triggerAlert(error, pattern, context);
          }

          span.setAttributes({
            'error.handled': result.handled,
            'error.recovered': result.recovered || false,
            'error.pattern': pattern?.name || 'unknown'
          });

          return result;
        },
        {
          kind: 1, // SpanKind.INTERNAL
          userId: context.userId,
          correlationId: context.correlationId
        }
      );

    } catch (handlerError) {
      this.logger.error('Critical error in error handler', {
        originalError: error,
        handlerError,
        context
      });

      // Fallback response
      return {
        handled: true,
        recovered: false,
        response: { error: 'Internal server error' },
        statusCode: 500
      };
    }
  }

  /**
   * Execute operation with automatic error recovery
   */
  public async executeWithRecovery<T>(
    operation: () => Promise<T>,
    options: {
      operationName: string;
      context?: ErrorContext;
      customPatterns?: ErrorPattern[];
      timeout?: number;
    }
  ): Promise<T> {
    const { operationName, context = {}, customPatterns = [], timeout } = options;
    
    return await this.tracing.withSpan(
      `operation.${operationName}`,
      async (span) => {
        span.setAttributes({
          'operation.name': operationName,
          'operation.timeout': timeout || 0
        });

        try {
          let operationPromise = operation();
          
          if (timeout) {
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Operation timeout: ${operationName}`)), timeout);
            });
            operationPromise = Promise.race([operationPromise, timeoutPromise]);
          }

          const result = await operationPromise;
          span.setAttributes({ 'operation.success': true });
          return result;

        } catch (error) {
          span.recordException(error as Error);
          span.setAttributes({ 'operation.success': false });

          // Try to recover using custom patterns first, then built-in patterns
          const allPatterns = [...customPatterns, ...this.errorPatterns];
          const pattern = allPatterns.find(p => p.matcher(error as Error, context));

          if (pattern) {
            const recovery = await this.executeRecoveryStrategy(
              error as Error,
              pattern.recovery,
              context
            );

            if (recovery.recovered && recovery.result !== undefined) {
              this.logger.info('Operation recovered from error', {
                operation: operationName,
                error: (error as Error).message,
                pattern: pattern.name
              });
              return recovery.result;
            }
          }

          // Re-throw if no recovery possible
          throw error;
        }
      },
      {
        correlationId: context.correlationId,
        userId: context.userId
      }
    );
  }

  private async attemptRecovery(
    error: Error,
    pattern: ErrorPattern | null,
    context: ErrorContext
  ): Promise<{
    handled: boolean;
    recovered?: boolean;
    response?: any;
    statusCode?: number;
    retryAfter?: number;
  }> {
    if (!pattern) {
      // No specific pattern, use default handling
      return {
        handled: true,
        recovered: false,
        response: { error: this.sanitizeErrorMessage(error.message) },
        statusCode: this.getStatusCodeFromError(error)
      };
    }

    const recovery = await this.executeRecoveryStrategy(error, pattern.recovery, context);
    
    return {
      handled: true,
      recovered: recovery.recovered,
      response: recovery.result || { error: this.sanitizeErrorMessage(error.message) },
      statusCode: recovery.statusCode || this.getStatusCodeFromError(error),
      retryAfter: recovery.retryAfter
    };
  }

  private async executeRecoveryStrategy(
    error: Error,
    strategy: ErrorRecoveryStrategy,
    context: ErrorContext
  ): Promise<{
    recovered: boolean;
    result?: any;
    statusCode?: number;
    retryAfter?: number;
  }> {
    switch (strategy.type) {
      case 'retry':
        return this.executeRetryStrategy(error, strategy, context);

      case 'fallback':
        return {
          recovered: true,
          result: strategy.fallbackValue || (strategy.fallbackFunction ? await strategy.fallbackFunction() : null)
        };

      case 'circuit_breaker':
        return this.executeCircuitBreakerStrategy(error, strategy, context);

      case 'dead_letter':
        this.addToDeadLetterQueue(error, context);
        return {
          recovered: false,
          result: { error: 'Request queued for retry' },
          statusCode: 503,
          retryAfter: 60
        };

      default:
        return { recovered: false };
    }
  }

  private async executeRetryStrategy(
    error: Error,
    strategy: ErrorRecoveryStrategy,
    context: ErrorContext
  ): Promise<{ recovered: boolean; result?: any }> {
    // This is a simplified retry - in practice, you'd need the original operation
    // For Express middleware, retries are typically handled at the client level
    this.logger.debug('Retry strategy executed', {
      error: error.message,
      maxAttempts: strategy.maxAttempts
    });

    return {
      recovered: false,
      result: {
        error: 'Operation failed, please retry',
        retryable: true,
        backoffMs: strategy.backoffMs
      }
    };
  }

  private async executeCircuitBreakerStrategy(
    error: Error,
    strategy: ErrorRecoveryStrategy,
    context: ErrorContext
  ): Promise<{ recovered: boolean; result?: any }> {
    const circuitBreakerName = `${context.operation || 'default'}_circuit_breaker`;
    
    // Circuit breaker handling would be done at the service level
    // Here we just provide fallback behavior
    return {
      recovered: true,
      result: strategy.fallbackValue || { error: 'Service temporarily unavailable' }
    };
  }

  private findErrorPattern(error: Error, context: ErrorContext): ErrorPattern | null {
    return this.errorPatterns.find(pattern => pattern.matcher(error, context)) || null;
  }

  private updateErrorAnalysis(error: Error, context: ErrorContext): void {
    const errorType = `${error.name}:${this.hashMessage(error.message)}`;
    const now = new Date();

    let analysis = this.errorHistory.get(errorType);
    if (!analysis) {
      analysis = {
        errorType,
        severity: 'medium',
        frequency: 0,
        firstOccurrence: now,
        lastOccurrence: now,
        recoverable: false,
        suggestedActions: []
      };
    }

    analysis.frequency++;
    analysis.lastOccurrence = now;
    
    // Update severity based on frequency
    if (analysis.frequency > 100) {
      analysis.severity = 'critical';
    } else if (analysis.frequency > 50) {
      analysis.severity = 'high';
    } else if (analysis.frequency > 10) {
      analysis.severity = 'medium';
    }

    this.errorHistory.set(errorType, analysis);
  }

  private recordErrorMetrics(error: Error, pattern: ErrorPattern | null, context: ErrorContext): void {
    this.metrics.incrementCounter('errors_total', {
      error_type: error.name,
      pattern: pattern?.name || 'unknown',
      operation: context.operation || 'unknown',
      severity: pattern?.severity || 'unknown'
    });

    if (pattern?.severity === 'critical') {
      this.metrics.incrementCounter('critical_errors_total', {
        pattern: pattern.name,
        operation: context.operation || 'unknown'
      });
    }
  }

  private async publishErrorEvent(
    error: Error,
    context: ErrorContext,
    pattern: ErrorPattern | null,
    recovered: boolean
  ): Promise<void> {
    const errorEvent = EventFactory.createDomainEvent(
      'error.occurred',
      context.requestId || 'unknown',
      'ErrorEvent',
      1,
      {
        errorName: error.name,
        errorMessage: this.sanitizeErrorMessage(error.message),
        pattern: pattern?.name,
        severity: pattern?.severity || 'unknown',
        recovered,
        operation: context.operation,
        resource: context.resource
      },
      context.userId,
      context.correlationId
    );

    await this.eventBus.publishDomainEvent(errorEvent);
  }

  private shouldAlert(pattern: ErrorPattern, error: Error): boolean {
    if (!pattern.alertThreshold) return false;
    
    const errorType = `${error.name}:${this.hashMessage(error.message)}`;
    const analysis = this.errorHistory.get(errorType);
    
    return analysis ? analysis.frequency >= pattern.alertThreshold : false;
  }

  private async triggerAlert(error: Error, pattern: ErrorPattern, context: ErrorContext): Promise<void> {
    const alertEvent = EventFactory.createIntegrationEvent(
      'alert.error.threshold_exceeded',
      {
        errorName: error.name,
        pattern: pattern.name,
        severity: pattern.severity,
        operation: context.operation,
        threshold: pattern.alertThreshold
      },
      context.correlationId
    );

    await this.eventBus.publishIntegrationEvent(alertEvent);
    
    this.logger.error('Error alert threshold exceeded', {
      pattern: pattern.name,
      error: error.message,
      threshold: pattern.alertThreshold
    });
  }

  private addToDeadLetterQueue(error: Error, context: ErrorContext): void {
    this.deadLetterQueue.push({
      error,
      context,
      timestamp: new Date()
    });

    // Limit queue size
    if (this.deadLetterQueue.length > 1000) {
      this.deadLetterQueue.shift();
    }
  }

  private async processDeadLetterQueue(): Promise<void> {
    const itemsToProcess = this.deadLetterQueue.splice(0, 10); // Process in batches
    
    for (const item of itemsToProcess) {
      try {
        // In a real implementation, you'd retry the original operation
        this.logger.info('Processing dead letter item', {
          error: item.error.message,
          age: Date.now() - item.timestamp.getTime()
        });
      } catch (error) {
        this.logger.error('Failed to process dead letter item', { error });
        // Re-add to queue if failed
        this.deadLetterQueue.push(item);
      }
    }
  }

  private analyzeErrorPatterns(): void {
    // Analyze error frequency and patterns for insights
    const criticalErrors = Array.from(this.errorHistory.values())
      .filter(analysis => analysis.severity === 'critical')
      .sort((a, b) => b.frequency - a.frequency);

    if (criticalErrors.length > 0) {
      this.logger.warn('Critical error patterns detected', {
        patterns: criticalErrors.slice(0, 5).map(e => ({
          type: e.errorType,
          frequency: e.frequency,
          firstOccurrence: e.firstOccurrence
        }))
      });
    }
  }

  private cleanupOldErrors(): void {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    for (const [errorType, analysis] of this.errorHistory.entries()) {
      if (analysis.lastOccurrence < oneWeekAgo && analysis.frequency < 5) {
        this.errorHistory.delete(errorType);
      }
    }

    // Clean recent errors cache
    this.recentErrors.clear();
  }

  private generateErrorId(error: Error, context: ErrorContext): string {
    const hash = this.hashMessage(`${error.name}:${error.message}:${context.operation || ''}`);
    return `err-${Date.now()}-${hash}`;
  }

  private hashMessage(message: string): string {
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  private sanitizeErrorMessage(message: string): string {
    // Remove sensitive information from error messages
    return message
      .replace(/password[=:]\w+/gi, 'password=[REDACTED]')
      .replace(/token[=:]\w+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\w+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\w+/gi, 'secret=[REDACTED]');
  }

  private getStatusCodeFromError(error: Error): number {
    // Map common error types to HTTP status codes
    if (error.name === 'ValidationError') return 400;
    if (error.message.includes('unauthorized')) return 401;
    if (error.message.includes('forbidden')) return 403;
    if (error.message.includes('not found')) return 404;
    if (error.message.includes('timeout')) return 504;
    if (error.message.includes('rate limit')) return 429;
    
    return 500; // Internal server error
  }

  /**
   * Get error handler statistics
   */
  public getStats(): {
    totalErrors: number;
    criticalErrors: number;
    recoveredErrors: number;
    deadLetterQueueSize: number;
    topErrors: Array<{
      type: string;
      frequency: number;
      severity: string;
    }>;
  } {
    const criticalErrors = Array.from(this.errorHistory.values())
      .filter(analysis => analysis.severity === 'critical');

    const topErrors = Array.from(this.errorHistory.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10)
      .map(analysis => ({
        type: analysis.errorType,
        frequency: analysis.frequency,
        severity: analysis.severity
      }));

    return {
      totalErrors: this.errorHistory.size,
      criticalErrors: criticalErrors.length,
      recoveredErrors: 0, // Would be tracked from metrics
      deadLetterQueueSize: this.deadLetterQueue.length,
      topErrors
    };
  }

  /**
   * Add custom error pattern
   */
  public addErrorPattern(pattern: ErrorPattern): void {
    this.errorPatterns.push(pattern);
    this.logger.info('Custom error pattern added', { name: pattern.name });
  }

  /**
   * Remove error pattern
   */
  public removeErrorPattern(name: string): boolean {
    const index = this.errorPatterns.findIndex(p => p.name === name);
    if (index !== -1) {
      this.errorPatterns.splice(index, 1);
      this.logger.info('Error pattern removed', { name });
      return true;
    }
    return false;
  }
}

export default AdvancedErrorHandler;