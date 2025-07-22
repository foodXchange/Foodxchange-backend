/**
 * Advanced Dependency Injection Container
 * Enterprise-grade IoC container with lifecycle management, decorators, and async resolution
 */

import { EventEmitter } from 'events';
import { Logger } from '../logging/logger';

export interface ServiceLifecycle {
  singleton: 'singleton';
  transient: 'transient';
  scoped: 'scoped';
  request: 'request';
}

export interface ServiceOptions {
  lifecycle?: keyof ServiceLifecycle;
  lazy?: boolean;
  tags?: string[];
  metadata?: Record<string, any>;
  onActivation?: (instance: any, container: AdvancedContainer) => any;
  onDeactivation?: (instance: any, container: AdvancedContainer) => void;
}

export interface ServiceDescriptor<T = any> {
  token: string | symbol | Function;
  implementation?: new (...args: any[]) => T;
  factory?: (...args: any[]) => T | Promise<T>;
  instance?: T;
  dependencies?: (string | symbol | Function)[];
  options: ServiceOptions;
}

export class AdvancedContainer extends EventEmitter {
  private readonly logger = new Logger('AdvancedContainer');
  private readonly services = new Map<string | symbol | Function, ServiceDescriptor>();
  private readonly instances = new Map<string | symbol | Function, any>();
  private readonly scopedInstances = new Map<string, Map<string | symbol | Function, any>>();
  private readonly requestInstances = new Map<string, Map<string | symbol | Function, any>>();
  
  private static instance: AdvancedContainer;
  private isStarted = false;

  constructor() {
    super();
    this.setupErrorHandling();
  }

  public static getInstance(): AdvancedContainer {
    if (!AdvancedContainer.instance) {
      AdvancedContainer.instance = new AdvancedContainer();
    }
    return AdvancedContainer.instance;
  }

  private setupErrorHandling(): void {
    this.on('error', (error) => {
      this.logger.error('Container error', { error: error.message, stack: error.stack });
    });
  }

  /**
   * Register a service with advanced options
   */
  public register<T>(
    token: string | symbol | Function,
    implementation?: new (...args: any[]) => T,
    options: ServiceOptions = {}
  ): this {
    const descriptor: ServiceDescriptor<T> = {
      token,
      implementation,
      options: {
        lifecycle: 'singleton',
        lazy: false,
        tags: [],
        ...options
      }
    };

    this.services.set(token, descriptor);
    this.emit('service:registered', { token, descriptor });
    
    this.logger.debug('Service registered', { 
      token: this.getTokenName(token), 
      lifecycle: descriptor.options.lifecycle 
    });

    return this;
  }

  /**
   * Register a factory function
   */
  public registerFactory<T>(
    token: string | symbol | Function,
    factory: (...args: any[]) => T | Promise<T>,
    dependencies: (string | symbol | Function)[] = [],
    options: ServiceOptions = {}
  ): this {
    const descriptor: ServiceDescriptor<T> = {
      token,
      factory,
      dependencies,
      options: {
        lifecycle: 'singleton',
        lazy: false,
        tags: [],
        ...options
      }
    };

    this.services.set(token, descriptor);
    this.emit('service:registered', { token, descriptor });
    
    this.logger.debug('Factory registered', { 
      token: this.getTokenName(token), 
      dependencies: dependencies.length 
    });

    return this;
  }

  /**
   * Register an instance
   */
  public registerInstance<T>(
    token: string | symbol | Function,
    instance: T,
    options: ServiceOptions = {}
  ): this {
    const descriptor: ServiceDescriptor<T> = {
      token,
      instance,
      options: {
        lifecycle: 'singleton',
        lazy: false,
        tags: [],
        ...options
      }
    };

    this.services.set(token, descriptor);
    this.instances.set(token, instance);
    this.emit('service:registered', { token, descriptor });
    
    this.logger.debug('Instance registered', { token: this.getTokenName(token) });

    return this;
  }

  /**
   * Resolve a service with advanced features
   */
  public async resolve<T>(
    token: string | symbol | Function,
    scopeId?: string,
    requestId?: string
  ): Promise<T> {
    const descriptor = this.services.get(token);
    if (!descriptor) {
      throw new Error(`Service not registered: ${this.getTokenName(token)}`);
    }

    const instance = await this.createInstance(descriptor, scopeId, requestId);
    this.emit('service:resolved', { token, instance });
    
    return instance;
  }

  /**
   * Resolve all services with specific tags
   */
  public async resolveByTag<T>(tag: string): Promise<T[]> {
    const services: T[] = [];
    
    for (const [token, descriptor] of this.services) {
      if (descriptor.options.tags?.includes(tag)) {
        const instance = await this.resolve<T>(token);
        services.push(instance);
      }
    }

    return services;
  }

  private async createInstance<T>(
    descriptor: ServiceDescriptor<T>,
    scopeId?: string,
    requestId?: string
  ): Promise<T> {
    const { token, options } = descriptor;

    // Check lifecycle and existing instances
    switch (options.lifecycle) {
      case 'singleton':
        if (this.instances.has(token)) {
          return this.instances.get(token);
        }
        break;

      case 'scoped':
        if (scopeId) {
          const scopedMap = this.scopedInstances.get(scopeId);
          if (scopedMap?.has(token)) {
            return scopedMap.get(token);
          }
        }
        break;

      case 'request':
        if (requestId) {
          const requestMap = this.requestInstances.get(requestId);
          if (requestMap?.has(token)) {
            return requestMap.get(token);
          }
        }
        break;
    }

    // Create new instance
    let instance: T;

    if (descriptor.instance) {
      instance = descriptor.instance;
    } else if (descriptor.factory) {
      const deps = await this.resolveDependencies(descriptor.dependencies || []);
      instance = await descriptor.factory(...deps);
    } else if (descriptor.implementation) {
      const deps = await this.resolveDependencies(descriptor.dependencies || []);
      instance = new descriptor.implementation(...deps);
    } else {
      throw new Error(`No implementation found for: ${this.getTokenName(token)}`);
    }

    // Apply activation hook
    if (options.onActivation) {
      instance = options.onActivation(instance, this) || instance;
    }

    // Store instance based on lifecycle
    this.storeInstance(token, instance, options.lifecycle!, scopeId, requestId);

    this.logger.debug('Instance created', { 
      token: this.getTokenName(token), 
      lifecycle: options.lifecycle 
    });

    return instance;
  }

  private async resolveDependencies(dependencies: (string | symbol | Function)[]): Promise<any[]> {
    const resolved: any[] = [];
    
    for (const dep of dependencies) {
      const instance = await this.resolve(dep);
      resolved.push(instance);
    }

    return resolved;
  }

  private storeInstance(
    token: string | symbol | Function,
    instance: any,
    lifecycle: keyof ServiceLifecycle,
    scopeId?: string,
    requestId?: string
  ): void {
    switch (lifecycle) {
      case 'singleton':
        this.instances.set(token, instance);
        break;

      case 'scoped':
        if (scopeId) {
          if (!this.scopedInstances.has(scopeId)) {
            this.scopedInstances.set(scopeId, new Map());
          }
          this.scopedInstances.get(scopeId)!.set(token, instance);
        }
        break;

      case 'request':
        if (requestId) {
          if (!this.requestInstances.has(requestId)) {
            this.requestInstances.set(requestId, new Map());
          }
          this.requestInstances.get(requestId)!.set(token, instance);
        }
        break;
    }
  }

  /**
   * Start the container and initialize eager services
   */
  public async start(): Promise<void> {
    if (this.isStarted) return;

    this.logger.info('Starting container...');

    // Initialize eager singleton services
    for (const [token, descriptor] of this.services) {
      if (descriptor.options.lifecycle === 'singleton' && !descriptor.options.lazy) {
        try {
          await this.resolve(token);
        } catch (error) {
          this.logger.error(`Failed to initialize eager service: ${this.getTokenName(token)}`, { error });
          this.emit('error', error);
        }
      }
    }

    this.isStarted = true;
    this.emit('container:started');
    this.logger.info('Container started successfully');
  }

  /**
   * Stop the container and cleanup resources
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) return;

    this.logger.info('Stopping container...');

    // Cleanup instances with deactivation hooks
    for (const [token, instance] of this.instances) {
      const descriptor = this.services.get(token);
      if (descriptor?.options.onDeactivation) {
        try {
          descriptor.options.onDeactivation(instance, this);
        } catch (error) {
          this.logger.error(`Failed to deactivate service: ${this.getTokenName(token)}`, { error });
        }
      }
    }

    this.instances.clear();
    this.scopedInstances.clear();
    this.requestInstances.clear();

    this.isStarted = false;
    this.emit('container:stopped');
    this.logger.info('Container stopped successfully');
  }

  /**
   * Clear scoped instances
   */
  public clearScope(scopeId: string): void {
    const scopedMap = this.scopedInstances.get(scopeId);
    if (scopedMap) {
      // Run deactivation hooks
      for (const [token, instance] of scopedMap) {
        const descriptor = this.services.get(token);
        if (descriptor?.options.onDeactivation) {
          try {
            descriptor.options.onDeactivation(instance, this);
          } catch (error) {
            this.logger.error(`Failed to deactivate scoped service: ${this.getTokenName(token)}`, { error });
          }
        }
      }
      this.scopedInstances.delete(scopeId);
    }
  }

  /**
   * Clear request instances
   */
  public clearRequest(requestId: string): void {
    const requestMap = this.requestInstances.get(requestId);
    if (requestMap) {
      // Run deactivation hooks
      for (const [token, instance] of requestMap) {
        const descriptor = this.services.get(token);
        if (descriptor?.options.onDeactivation) {
          try {
            descriptor.options.onDeactivation(instance, this);
          } catch (error) {
            this.logger.error(`Failed to deactivate request service: ${this.getTokenName(token)}`, { error });
          }
        }
      }
      this.requestInstances.delete(requestId);
    }
  }

  /**
   * Get container statistics
   */
  public getStats(): {
    registeredServices: number;
    singletonInstances: number;
    scopedInstances: number;
    requestInstances: number;
  } {
    return {
      registeredServices: this.services.size,
      singletonInstances: this.instances.size,
      scopedInstances: this.scopedInstances.size,
      requestInstances: this.requestInstances.size
    };
  }

  /**
   * Check if service is registered
   */
  public isRegistered(token: string | symbol | Function): boolean {
    return this.services.has(token);
  }

  /**
   * Get service metadata
   */
  public getServiceInfo(token: string | symbol | Function): ServiceDescriptor | undefined {
    return this.services.get(token);
  }

  private getTokenName(token: string | symbol | Function): string {
    if (typeof token === 'string') return token;
    if (typeof token === 'symbol') return token.toString();
    if (typeof token === 'function') return token.name || token.toString();
    return 'unknown';
  }
}

// Service decorators for easier registration
export function Injectable(options: ServiceOptions = {}) {
  return function <T extends new (...args: any[]) => any>(constructor: T) {
    const container = AdvancedContainer.getInstance();
    container.register(constructor, constructor, options);
    return constructor;
  };
}

export function Inject(token: string | symbol | Function) {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    // Store injection metadata for future use
    const existingTokens = Reflect.getMetadata('design:inject', target) || [];
    existingTokens[parameterIndex] = token;
    Reflect.defineMetadata('design:inject', existingTokens, target);
  };
}

// Tokens for common services
export const SERVICE_TOKENS = {
  LOGGER: Symbol('Logger'),
  DATABASE: Symbol('Database'),
  CACHE: Symbol('Cache'),
  EVENT_BUS: Symbol('EventBus'),
  AUTH_SERVICE: Symbol('AuthService'),
  NOTIFICATION_SERVICE: Symbol('NotificationService'),
  METRICS_SERVICE: Symbol('MetricsService'),
} as const;

export default AdvancedContainer;