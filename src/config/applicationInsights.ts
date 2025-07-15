import * as appInsights from "applicationinsights";
import { Logger } from '../core/logging/logger';

const logger = new Logger('ApplicationInsights');

export interface TelemetryClient {
  trackEvent(event: { name: string; properties?: Record<string, string>; measurements?: Record<string, number> }): void;
  trackDependency(dependency: { name: string; data: string; duration: number; success: boolean; dependencyTypeName?: string }): void;
  trackException(exception: { exception: Error; properties?: Record<string, string> }): void;
  trackMetric(metric: { name: string; value: number; properties?: Record<string, string> }): void;
  trackTrace(trace: { message: string; severity?: any; properties?: Record<string, string> }): void;
  flush(): void;
}

class ApplicationInsightsService {
  private client: appInsights.TelemetryClient | null = null;
  private isInitialized = false;

  public initialize(): TelemetryClient | null {
    try {
      const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
      const instrumentationKey = process.env.APPINSIGHTS_INSTRUMENTATIONKEY;

      if (!connectionString && !instrumentationKey) {
        logger.warn('Application Insights not configured - missing connection string or instrumentation key');
        return null;
      }

      // Setup Application Insights
      if (connectionString) {
        appInsights.setup(connectionString);
      } else if (instrumentationKey) {
        appInsights.setup(instrumentationKey);
      }

      // Configure auto-collection
      appInsights
        .setAutoCollectRequests(true)
        .setAutoCollectPerformance(true, true)
        .setAutoCollectExceptions(true)
        .setAutoCollectDependencies(true)
        .setAutoCollectConsole(true, true)
        .setUseDiskRetryCaching(true)
        .setSendLiveMetrics(true)
        .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C);

      // Add custom properties
      appInsights.defaultClient.commonProperties = {
        application: 'foodxchange-backend',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      };

      // Start collecting telemetry
      appInsights.start();

      this.client = appInsights.defaultClient;
      this.isInitialized = true;

      logger.info('✅ Application Insights initialized successfully', {
        instrumentationKey: instrumentationKey ? `${instrumentationKey.substring(0, 8)}...` : 'not-set',
        connectionString: connectionString ? 'configured' : 'not-set'
      });

      return this.createTelemetryWrapper();
    } catch (error) {
      logger.error('❌ Failed to initialize Application Insights', error);
      return null;
    }
  }

  private createTelemetryWrapper(): TelemetryClient {
    if (!this.client) {
      throw new Error('Application Insights client not initialized');
    }

    const client = this.client;

    return {
      trackEvent: (event) => {
        try {
          client.trackEvent(event);
        } catch (error) {
          logger.error('Failed to track event', error);
        }
      },
      
      trackDependency: (dependency) => {
        try {
          client.trackDependency(dependency);
        } catch (error) {
          logger.error('Failed to track dependency', error);
        }
      },
      
      trackException: (exception) => {
        try {
          client.trackException(exception);
        } catch (error) {
          logger.error('Failed to track exception', error);
        }
      },
      
      trackMetric: (metric) => {
        try {
          client.trackMetric(metric);
        } catch (error) {
          logger.error('Failed to track metric', error);
        }
      },
      
      trackTrace: (trace) => {
        try {
          client.trackTrace(trace);
        } catch (error) {
          logger.error('Failed to track trace', error);
        }
      },
      
      flush: () => {
        try {
          client.flush();
        } catch (error) {
          logger.error('Failed to flush telemetry', error);
        }
      }
    };
  }

  public getClient(): TelemetryClient | null {
    if (!this.isInitialized) {
      return this.initialize();
    }
    return this.createTelemetryWrapper();
  }

  public isConfigured(): boolean {
    return !!(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || process.env.APPINSIGHTS_INSTRUMENTATIONKEY);
  }
}

// Export singleton instance
export const applicationInsights = new ApplicationInsightsService();

// Initialize on import if configured
export const telemetryClient = applicationInsights.isConfigured() 
  ? applicationInsights.initialize() 
  : null;

// Helper functions for common tracking scenarios
export const trackSampleEvent = (sampleId: string, event: string, properties?: Record<string, string>) => {
  telemetryClient?.trackEvent({
    name: `Sample.${event}`,
    properties: {
      sampleId,
      ...properties
    }
  });
};

export const trackOrderEvent = (orderId: string, event: string, properties?: Record<string, string>) => {
  telemetryClient?.trackEvent({
    name: `Order.${event}`,
    properties: {
      orderId,
      ...properties
    }
  });
};

export const trackAzureServiceCall = (serviceName: string, operationName: string, duration: number, success: boolean, error?: Error) => {
  telemetryClient?.trackDependency({
    name: `Azure.${serviceName}`,
    data: operationName,
    duration,
    success,
    dependencyTypeName: 'Azure Cognitive Services'
  });

  if (error) {
    telemetryClient?.trackException({
      exception: error,
      properties: {
        service: serviceName,
        operation: operationName
      }
    });
  }
};

export const trackPerformanceMetric = (name: string, value: number, properties?: Record<string, string>) => {
  telemetryClient?.trackMetric({
    name: `Performance.${name}`,
    value,
    properties
  });
};

export default applicationInsights;