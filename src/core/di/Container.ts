/**
 * Enterprise-grade Dependency Injection Container
 * Provides IoC container for managing service dependencies
 */

import { Logger } from '../logging/logger';

const logger = new Logger('DIContainer');

type Constructor<T = {}> = new (...args: any[]) => T;
type Factory<T> = (...args: any[]) => T | Promise<T>;
type Token<T> = string | symbol | Constructor<T>;

interface ServiceDescriptor<T> {
  token: Token<T>;
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
  dependencies?: Token<any>[];
}

export class Container {
  private static instance: Container;
  private readonly services = new Map<Token<any>, ServiceDescriptor<any>>();
  private readonly resolving = new Set<Token<any>>();

  private constructor() {}

  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  // Register a singleton service
  public registerSingleton<T>(
    token: Token<T>,
    factory: Factory<T>,
    dependencies?: Token<any>[]
  ): void {
    this.register(token, factory, true, dependencies);
  }

  // Register a transient service
  public registerTransient<T>(
    token: Token<T>,
    factory: Factory<T>,
    dependencies?: Token<any>[]
  ): void {
    this.register(token, factory, false, dependencies);
  }

  // Register a class
  public registerClass<T>(
    ClassConstructor: Constructor<T>,
    singleton = true,
    dependencies?: Token<any>[]
  ): void {
    const factory = (...args: any[]) => new ClassConstructor(...args);
    this.register(ClassConstructor, factory, singleton, dependencies);
  }

  // Register a value
  public registerValue<T>(token: Token<T>, value: T): void {
    this.services.set(token, {
      token,
      factory: () => value,
      singleton: true,
      instance: value
    });
  }

  // Register a factory function
  public registerFactory<T>(
    token: Token<T>,
    factory: () => T | Promise<T>,
    singleton = true
  ): void {
    this.register(token, factory, singleton);
  }

  // Resolve a service
  public async resolve<T>(token: Token<T>): Promise<T> {
    const descriptor = this.services.get(token);

    if (!descriptor) {
      throw new Error(`Service not registered: ${this.tokenToString(token)}`);
    }

    // Check for circular dependencies
    if (this.resolving.has(token)) {
      throw new Error(`Circular dependency detected: ${this.tokenToString(token)}`);
    }

    // Return existing instance for singletons
    if (descriptor.singleton && descriptor.instance) {
      return descriptor.instance;
    }

    this.resolving.add(token);

    try {
      // Resolve dependencies
      const dependencies = await this.resolveDependencies(descriptor.dependencies || []);

      // Create instance
      const instance = await descriptor.factory(...dependencies);

      // Store singleton instance
      if (descriptor.singleton) {
        descriptor.instance = instance;
      }

      logger.debug('Service resolved', {
        token: this.tokenToString(token),
        singleton: descriptor.singleton
      });

      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  // Resolve multiple services
  public async resolveAll<T>(...tokens: Token<T>[]): Promise<T[]> {
    return Promise.all(tokens.map(async token => this.resolve(token)));
  }

  // Check if service is registered
  public has(token: Token<any>): boolean {
    return this.services.has(token);
  }

  // Clear all registrations
  public clear(): void {
    this.services.clear();
    this.resolving.clear();
  }

  // Get all registered services
  public getRegisteredServices(): string[] {
    return Array.from(this.services.keys()).map(token => this.tokenToString(token));
  }

  // Private methods
  private register<T>(
    token: Token<T>,
    factory: Factory<T>,
    singleton: boolean,
    dependencies?: Token<any>[]
  ): void {
    this.services.set(token, {
      token,
      factory,
      singleton,
      dependencies
    });

    logger.debug('Service registered', {
      token: this.tokenToString(token),
      singleton,
      dependencies: dependencies?.map(d => this.tokenToString(d))
    });
  }

  private async resolveDependencies(dependencies: Token<any>[]): Promise<any[]> {
    return Promise.all(dependencies.map(async dep => this.resolve(dep)));
  }

  private tokenToString(token: Token<any>): string {
    if (typeof token === 'string') return token;
    if (typeof token === 'symbol') return token.toString();
    if (typeof token === 'function') return token.name;
    return String(token);
  }
}

// Service tokens
export const ServiceTokens = {
  // Core services
  Logger: Symbol('Logger'),
  Config: Symbol('Config'),

  // Infrastructure services
  Database: Symbol('Database'),
  Cache: Symbol('Cache'),
  Metrics: Symbol('Metrics'),

  // Azure services
  AzureAI: Symbol('AzureAI'),
  AzureStorage: Symbol('AzureStorage'),

  // Business services
  AuthService: Symbol('AuthService'),
  ProductService: Symbol('ProductService'),
  RFQService: Symbol('RFQService'),
  ComplianceService: Symbol('ComplianceService'),
  OrderService: Symbol('OrderService'),

  // Repositories
  UserRepository: Symbol('UserRepository'),
  ProductRepository: Symbol('ProductRepository'),
  RFQRepository: Symbol('RFQRepository'),
  OrderRepository: Symbol('OrderRepository')
} as const;

// Decorator for dependency injection
export function Injectable(token?: Token<any>) {
  return function (target: Constructor) {
    const container = Container.getInstance();
    const serviceToken = token || target;

    // Get constructor parameters
    const paramTypes = Reflect.getMetadata('design:paramtypes', target) || [];

    // Register the class with its dependencies
    container.registerClass(serviceToken, true, paramTypes);

    // Add metadata for easy retrieval
    Reflect.defineMetadata('di:token', serviceToken, target);
  };
}

// Decorator for injecting dependencies
export function Inject(token: Token<any>) {
  return function (target: any, propertyKey: string | symbol, parameterIndex: number) {
    const existingTokens = Reflect.getMetadata('di:inject', target) || [];
    existingTokens[parameterIndex] = token;
    Reflect.defineMetadata('di:inject', existingTokens, target);
  };
}

// Helper function to create a provider
export interface Provider<T> {
  provide: Token<T>;
  useClass?: Constructor<T>;
  useFactory?: Factory<T>;
  useValue?: T;
  deps?: Token<any>[];
  singleton?: boolean;
}

export function createProvider<T>(provider: Provider<T>): void {
  const container = Container.getInstance();

  if (provider.useClass) {
    container.registerClass(provider.provide as Constructor<T>, provider.singleton ?? true, provider.deps);
  } else if (provider.useFactory) {
    container.register(provider.provide, provider.useFactory, provider.singleton ?? true, provider.deps);
  } else if (provider.useValue !== undefined) {
    container.registerValue(provider.provide, provider.useValue);
  } else {
    throw new Error('Provider must specify useClass, useFactory, or useValue');
  }
}

// Bootstrap function for initializing services
export async function bootstrap(providers: Provider<any>[]): Promise<void> {
  const container = Container.getInstance();

  logger.info('Bootstrapping dependency injection container');

  // Register all providers
  for (const provider of providers) {
    createProvider(provider);
  }

  // Resolve and initialize singleton services
  const singletonTokens = providers
    .filter(p => p.singleton !== false)
    .map(p => p.provide);

  await container.resolveAll(...singletonTokens);

  logger.info('Dependency injection container bootstrapped', {
    registeredServices: container.getRegisteredServices().length
  });
}

// Export singleton instance
export default Container.getInstance();
