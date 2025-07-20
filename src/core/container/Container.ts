import { Logger } from '../logging/logger';

const logger = new Logger('Container');

export interface ServiceDefinition {
  factory: (...args: any[]) => any;
  dependencies?: string[];
  singleton?: boolean;
  metadata?: Record<string, any>;
}

export interface ServiceInstance {
  instance: any;
  definition: ServiceDefinition;
  createdAt: Date;
  accessCount: number;
}

export class Container {
  private static instance: Container;
  private readonly services: Map<string, ServiceDefinition> = new Map();
  private readonly instances: Map<string, ServiceInstance> = new Map();
  private readonly circularDependencyCheck: Set<string> = new Set();
  private readonly maxCircularDepth = 10;

  private constructor() {}

  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  /**
   * Register a service with the container
   */
  public register<T>(
    name: string,
    factory: (...args: any[]) => T,
    options: {
      dependencies?: string[];
      singleton?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): this {
    const definition: ServiceDefinition = {
      factory,
      dependencies: options.dependencies || [],
      singleton: options.singleton !== false, // Default to singleton
      metadata: options.metadata || {}
    };

    this.services.set(name, definition);
    logger.debug('Service registered', { name, dependencies: definition.dependencies });
    return this;
  }

  /**
   * Register a singleton service
   */
  public singleton<T>(
    name: string,
    factory: (...args: any[]) => T,
    dependencies: string[] = []
  ): this {
    return this.register(name, factory, { dependencies, singleton: true });
  }

  /**
   * Register a transient service (new instance each time)
   */
  public transient<T>(
    name: string,
    factory: (...args: any[]) => T,
    dependencies: string[] = []
  ): this {
    return this.register(name, factory, { dependencies, singleton: false });
  }

  /**
   * Register a value as a service
   */
  public value(name: string, value: any): this {
    return this.register(name, () => value, { singleton: true });
  }

  /**
   * Register a class as a service
   */
  public class<T>(
    name: string,
    constructor: new (...args: any[]) => T,
    dependencies: string[] = []
  ): this {
    return this.register(name, (...args: any[]) => new constructor(...args), { dependencies });
  }

  /**
   * Resolve a service from the container
   */
  public resolve<T>(name: string): T {
    // Check for circular dependencies
    if (this.circularDependencyCheck.has(name)) {
      throw new Error(`Circular dependency detected for service: ${name}`);
    }

    if (this.circularDependencyCheck.size > this.maxCircularDepth) {
      throw new Error(`Maximum circular dependency depth exceeded: ${this.maxCircularDepth}`);
    }

    const definition = this.services.get(name);
    if (!definition) {
      throw new Error(`Service not found: ${name}`);
    }

    // Check if singleton and already instantiated
    if (definition.singleton && this.instances.has(name)) {
      const serviceInstance = this.instances.get(name);
      serviceInstance.accessCount++;
      return serviceInstance.instance;
    }

    // Add to circular dependency check
    this.circularDependencyCheck.add(name);

    try {
      // Resolve dependencies
      const dependencies = definition.dependencies.map(dep => this.resolve(dep));

      // Create instance
      const instance = definition.factory(...dependencies);

      // Store instance if singleton
      if (definition.singleton) {
        this.instances.set(name, {
          instance,
          definition,
          createdAt: new Date(),
          accessCount: 1
        });
      }

      logger.debug('Service resolved', { name, dependencies: definition.dependencies });
      return instance;
    } finally {
      // Remove from circular dependency check
      this.circularDependencyCheck.delete(name);
    }
  }

  /**
   * Check if a service is registered
   */
  public has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get all registered service names
   */
  public getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get service definition
   */
  public getDefinition(name: string): ServiceDefinition | undefined {
    return this.services.get(name);
  }

  /**
   * Get service instance info
   */
  public getInstanceInfo(name: string): ServiceInstance | undefined {
    return this.instances.get(name);
  }

  /**
   * Clear all services and instances
   */
  public clear(): void {
    this.services.clear();
    this.instances.clear();
    this.circularDependencyCheck.clear();
    logger.info('Container cleared');
  }

  /**
   * Remove a specific service
   */
  public remove(name: string): boolean {
    const removed = this.services.delete(name);
    this.instances.delete(name);
    logger.debug('Service removed', { name, removed });
    return removed;
  }

  /**
   * Create a child container
   */
  public createChild(): Container {
    const child = new Container();
    // Copy parent services
    for (const [name, definition] of this.services) {
      child.services.set(name, definition);
    }
    return child;
  }

  /**
   * Get container statistics
   */
  public getStats(): {
    totalServices: number;
    totalInstances: number;
    singletons: number;
    transients: number;
    mostUsedServices: { name: string; accessCount: number }[];
    } {
    const totalServices = this.services.size;
    const totalInstances = this.instances.size;

    let singletons = 0;
    let transients = 0;

    for (const definition of this.services.values()) {
      if (definition.singleton) {
        singletons++;
      } else {
        transients++;
      }
    }

    const mostUsedServices = Array.from(this.instances.entries())
      .map(([name, instance]) => ({ name, accessCount: instance.accessCount }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10);

    return {
      totalServices,
      totalInstances,
      singletons,
      transients,
      mostUsedServices
    };
  }

  /**
   * Validate container configuration
   */
  public validate(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const [name, definition] of this.services) {
      // Check if all dependencies are registered
      for (const dep of definition.dependencies || []) {
        if (!this.services.has(dep)) {
          errors.push(`Service '${name}' depends on unregistered service '${dep}'`);
        }
      }

      // Check for potential circular dependencies
      try {
        this.checkCircularDependencies(name, new Set());
      } catch (error) {
        errors.push(`Circular dependency detected for service '${name}': ${error.message}`);
      }
    }

    // Check for unused services
    for (const [name, definition] of this.services) {
      if (!this.instances.has(name) && definition.singleton) {
        warnings.push(`Singleton service '${name}' is registered but never used`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private checkCircularDependencies(serviceName: string, visited: Set<string>): void {
    if (visited.has(serviceName)) {
      throw new Error(`Circular dependency chain: ${Array.from(visited).join(' -> ')} -> ${serviceName}`);
    }

    const definition = this.services.get(serviceName);
    if (!definition) {
      return;
    }

    visited.add(serviceName);

    for (const dep of definition.dependencies || []) {
      this.checkCircularDependencies(dep, new Set(visited));
    }
  }

  /**
   * Create a service scope for request isolation
   */
  public createScope(): ServiceScope {
    return new ServiceScope(this);
  }
}

/**
 * Service scope for request-level service isolation
 */
export class ServiceScope {
  private readonly scopedInstances: Map<string, any> = new Map();
  private readonly parentContainer: Container;

  constructor(parent: Container) {
    this.parentContainer = parent;
  }

  public resolve<T>(name: string): T {
    // Check if already resolved in this scope
    if (this.scopedInstances.has(name)) {
      return this.scopedInstances.get(name);
    }

    // Resolve from parent container
    const instance = this.parentContainer.resolve<T>(name);

    // Store in scope for reuse within this scope
    this.scopedInstances.set(name, instance);

    return instance;
  }

  public dispose(): void {
    // Clean up scoped instances
    for (const [name, instance] of this.scopedInstances) {
      if (instance && typeof instance.dispose === 'function') {
        try {
          instance.dispose();
        } catch (error) {
          logger.error('Error disposing scoped service', error, { name });
        }
      }
    }
    this.scopedInstances.clear();
  }
}

// Decorator for dependency injection
export function Injectable(name: string, dependencies: string[] = []) {
  return function<T extends { new(...args: any[]): {} }>(constructor: T) {
    // Register the class with the container
    Container.getInstance().class(name, constructor, dependencies);
    return constructor;
  };
}

// Decorator for injecting dependencies
export function Inject(serviceName: string) {
  return function(target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    const existingTokens = Reflect.getMetadata('design:paramtypes', target) || [];
    const existingInjectTokens = Reflect.getMetadata('inject:tokens', target) || [];

    existingInjectTokens[parameterIndex] = serviceName;
    Reflect.defineMetadata('inject:tokens', existingInjectTokens, target);
  };
}

// Service lifecycle hooks
export interface ServiceLifecycle {
  onCreate?(): void | Promise<void>;
  onDestroy?(): void | Promise<void>;
}

// Export singleton instance
export const container = Container.getInstance();
export default container;
