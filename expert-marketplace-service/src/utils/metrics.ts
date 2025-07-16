import { Request, Response, NextFunction } from 'express';
import { productionLogger } from './productionLogger';
import { config } from '../config';

export interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  contentLength: number;
  timestamp: Date;
  userId?: string;
  userAgent?: string;
  ip: string;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    heapUsed: number;
    heapTotal: number;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
    requestsPerMinute: number;
  };
  database: {
    connections: number;
    queries: number;
    errors: number;
    averageQueryTime: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    memory: number;
  };
}

export interface PerformanceAlert {
  type: 'high_cpu' | 'high_memory' | 'slow_response' | 'high_error_rate' | 'database_slow';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  severity: 'warning' | 'critical';
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private requestMetrics: RequestMetrics[] = [];
  private systemMetrics: SystemMetrics;
  private alerts: PerformanceAlert[] = [];
  private startTime: Date = new Date();
  
  // Thresholds for alerts
  private thresholds = {
    cpuUsage: 80,
    memoryUsage: 85,
    responseTime: 2000,
    errorRate: 5,
    databaseQueryTime: 1000
  };

  private constructor() {
    this.systemMetrics = this.getInitialSystemMetrics();
    this.startMetricsCollection();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  private getInitialSystemMetrics(): SystemMetrics {
    return {
      cpu: { usage: 0, loadAverage: [0, 0, 0] },
      memory: { used: 0, total: 0, percentage: 0, heapUsed: 0, heapTotal: 0 },
      requests: { total: 0, successful: 0, failed: 0, averageResponseTime: 0, requestsPerMinute: 0 },
      database: { connections: 0, queries: 0, errors: 0, averageQueryTime: 0 },
      cache: { hits: 0, misses: 0, hitRate: 0, memory: 0 }
    };
  }

  private startMetricsCollection(): void {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
      this.checkAlerts();
    }, 30000);

    // Clean old metrics every hour
    setInterval(() => {
      this.cleanOldMetrics();
    }, 3600000);
  }

  private updateSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.systemMetrics.memory = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal
    };

    // CPU usage calculation (simplified)
    this.systemMetrics.cpu = {
      usage: ((cpuUsage.user + cpuUsage.system) / 1000000) * 100,
      loadAverage: require('os').loadavg()
    };

    // Calculate request metrics
    const recentRequests = this.requestMetrics.filter(
      req => req.timestamp > new Date(Date.now() - 60000)
    );
    
    this.systemMetrics.requests = {
      total: this.requestMetrics.length,
      successful: this.requestMetrics.filter(req => req.statusCode < 400).length,
      failed: this.requestMetrics.filter(req => req.statusCode >= 400).length,
      averageResponseTime: recentRequests.length > 0 
        ? recentRequests.reduce((sum, req) => sum + req.responseTime, 0) / recentRequests.length
        : 0,
      requestsPerMinute: recentRequests.length
    };
  }

  private checkAlerts(): void {
    const now = new Date();
    const newAlerts: PerformanceAlert[] = [];

    // CPU usage alert
    if (this.systemMetrics.cpu.usage > this.thresholds.cpuUsage) {
      newAlerts.push({
        type: 'high_cpu',
        message: `High CPU usage: ${this.systemMetrics.cpu.usage.toFixed(2)}%`,
        value: this.systemMetrics.cpu.usage,
        threshold: this.thresholds.cpuUsage,
        timestamp: now,
        severity: this.systemMetrics.cpu.usage > 95 ? 'critical' : 'warning'
      });
    }

    // Memory usage alert
    if (this.systemMetrics.memory.percentage > this.thresholds.memoryUsage) {
      newAlerts.push({
        type: 'high_memory',
        message: `High memory usage: ${this.systemMetrics.memory.percentage.toFixed(2)}%`,
        value: this.systemMetrics.memory.percentage,
        threshold: this.thresholds.memoryUsage,
        timestamp: now,
        severity: this.systemMetrics.memory.percentage > 95 ? 'critical' : 'warning'
      });
    }

    // Response time alert
    if (this.systemMetrics.requests.averageResponseTime > this.thresholds.responseTime) {
      newAlerts.push({
        type: 'slow_response',
        message: `Slow response time: ${this.systemMetrics.requests.averageResponseTime.toFixed(2)}ms`,
        value: this.systemMetrics.requests.averageResponseTime,
        threshold: this.thresholds.responseTime,
        timestamp: now,
        severity: this.systemMetrics.requests.averageResponseTime > 5000 ? 'critical' : 'warning'
      });
    }

    // Error rate alert
    const errorRate = this.systemMetrics.requests.total > 0 
      ? (this.systemMetrics.requests.failed / this.systemMetrics.requests.total) * 100
      : 0;

    if (errorRate > this.thresholds.errorRate) {
      newAlerts.push({
        type: 'high_error_rate',
        message: `High error rate: ${errorRate.toFixed(2)}%`,
        value: errorRate,
        threshold: this.thresholds.errorRate,
        timestamp: now,
        severity: errorRate > 15 ? 'critical' : 'warning'
      });
    }

    // Log new alerts
    newAlerts.forEach(alert => {
      if (alert.severity === 'critical') {
        productionLogger.error('Performance alert', alert);
      } else {
        productionLogger.warn('Performance alert', alert);
      }
    });

    // Store alerts (keep last 100)
    this.alerts = [...this.alerts, ...newAlerts].slice(-100);
  }

  private cleanOldMetrics(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const initialCount = this.requestMetrics.length;
    
    this.requestMetrics = this.requestMetrics.filter(
      metric => metric.timestamp > cutoff
    );
    
    const cleaned = initialCount - this.requestMetrics.length;
    if (cleaned > 0) {
      productionLogger.debug(`Cleaned ${cleaned} old metrics`, {
        remaining: this.requestMetrics.length,
        cutoff: cutoff.toISOString()
      });
    }
  }

  // Record a request metric
  recordRequest(req: Request, res: Response, responseTime: number): void {
    const metric: RequestMetrics = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime,
      contentLength: parseInt(res.get('content-length') || '0'),
      timestamp: new Date(),
      userId: req.user?.id,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    };

    this.requestMetrics.push(metric);
    
    // Log performance issues
    if (responseTime > 2000) {
      productionLogger.performance('Slow request', responseTime, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        userId: req.user?.id
      });
    }
  }

  // Get current metrics
  getMetrics(): SystemMetrics {
    return { ...this.systemMetrics };
  }

  // Get metrics for a specific time range
  getRequestMetrics(startTime: Date, endTime: Date): RequestMetrics[] {
    return this.requestMetrics.filter(
      metric => metric.timestamp >= startTime && metric.timestamp <= endTime
    );
  }

  // Get recent alerts
  getAlerts(limit: number = 10): PerformanceAlert[] {
    return this.alerts.slice(-limit);
  }

  // Get aggregated metrics for dashboard
  getDashboardMetrics(): {
    uptime: number;
    system: SystemMetrics;
    recentRequests: RequestMetrics[];
    alerts: PerformanceAlert[];
    summary: {
      totalRequests: number;
      successRate: number;
      averageResponseTime: number;
      currentLoad: number;
    };
  } {
    const uptime = (Date.now() - this.startTime.getTime()) / 1000;
    const recentRequests = this.requestMetrics.slice(-100);
    const recentAlerts = this.alerts.slice(-10);
    
    const successRate = this.systemMetrics.requests.total > 0
      ? (this.systemMetrics.requests.successful / this.systemMetrics.requests.total) * 100
      : 100;

    return {
      uptime,
      system: this.systemMetrics,
      recentRequests,
      alerts: recentAlerts,
      summary: {
        totalRequests: this.systemMetrics.requests.total,
        successRate,
        averageResponseTime: this.systemMetrics.requests.averageResponseTime,
        currentLoad: this.systemMetrics.cpu.usage
      }
    };
  }

  // Export metrics for external monitoring
  exportMetrics(): string {
    const metrics = this.getMetrics();
    const timestamp = new Date().toISOString();
    
    return `# HELP expert_marketplace_requests_total Total number of requests
# TYPE expert_marketplace_requests_total counter
expert_marketplace_requests_total ${metrics.requests.total} ${Date.now()}

# HELP expert_marketplace_requests_successful Successful requests
# TYPE expert_marketplace_requests_successful counter
expert_marketplace_requests_successful ${metrics.requests.successful} ${Date.now()}

# HELP expert_marketplace_requests_failed Failed requests
# TYPE expert_marketplace_requests_failed counter
expert_marketplace_requests_failed ${metrics.requests.failed} ${Date.now()}

# HELP expert_marketplace_response_time_avg Average response time
# TYPE expert_marketplace_response_time_avg gauge
expert_marketplace_response_time_avg ${metrics.requests.averageResponseTime} ${Date.now()}

# HELP expert_marketplace_cpu_usage CPU usage percentage
# TYPE expert_marketplace_cpu_usage gauge
expert_marketplace_cpu_usage ${metrics.cpu.usage} ${Date.now()}

# HELP expert_marketplace_memory_usage Memory usage percentage
# TYPE expert_marketplace_memory_usage gauge
expert_marketplace_memory_usage ${metrics.memory.percentage} ${Date.now()}

# HELP expert_marketplace_requests_per_minute Requests per minute
# TYPE expert_marketplace_requests_per_minute gauge
expert_marketplace_requests_per_minute ${metrics.requests.requestsPerMinute} ${Date.now()}
`;
  }
}

// Express middleware for collecting metrics
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const metricsCollector = MetricsCollector.getInstance();
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    metricsCollector.recordRequest(req, res, responseTime);
  });
  
  next();
};

// Metrics endpoint
export const metricsEndpoint = (req: Request, res: Response): void => {
  const metricsCollector = MetricsCollector.getInstance();
  
  if (req.path === '/metrics') {
    // Prometheus format
    res.set('Content-Type', 'text/plain');
    res.send(metricsCollector.exportMetrics());
  } else {
    // JSON format for dashboard
    res.json({
      success: true,
      data: metricsCollector.getDashboardMetrics()
    });
  }
};

export const metricsCollector = MetricsCollector.getInstance();