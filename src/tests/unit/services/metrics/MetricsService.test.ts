import { MetricsService } from '../../../../services/metrics/MetricsService';

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  afterEach(() => {
    metricsService.reset();
  });

  describe('Counter Metrics', () => {
    it('should increment counter', () => {
      metricsService.incrementCounter('test.counter');
      expect(metricsService.getCounter('test.counter')).toBe(1);
    });

    it('should increment counter multiple times', () => {
      metricsService.incrementCounter('test.counter');
      metricsService.incrementCounter('test.counter');
      metricsService.incrementCounter('test.counter');
      expect(metricsService.getCounter('test.counter')).toBe(3);
    });

    it('should handle counter with tags', () => {
      const tags = { endpoint: '/api/users', method: 'GET' };
      metricsService.incrementCounter('http.requests', tags);
      expect(metricsService.getCounter('http.requests', tags)).toBe(1);
    });

    it('should differentiate counters with different tags', () => {
      metricsService.incrementCounter('http.requests', { method: 'GET' });
      metricsService.incrementCounter('http.requests', { method: 'POST' });
      
      expect(metricsService.getCounter('http.requests', { method: 'GET' })).toBe(1);
      expect(metricsService.getCounter('http.requests', { method: 'POST' })).toBe(1);
    });
  });

  describe('Timer Metrics', () => {
    it('should record timer duration', () => {
      const duration = 123.45;
      metricsService.recordTimer('test.timer', duration);
      
      // Timer recording should not throw
      expect(() => metricsService.recordTimer('test.timer', duration)).not.toThrow();
    });

    it('should handle timer with tags', () => {
      const tags = { operation: 'database.query' };
      metricsService.recordTimer('operation.duration', 250, tags);
      
      expect(() => metricsService.recordTimer('operation.duration', 250, tags)).not.toThrow();
    });

    it('should start and end timer', () => {
      metricsService.startTimer('test.operation');
      
      // Simulate some work
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        // Wait a bit
      }
      
      metricsService.endTimer('test.operation');
      
      // Should not throw
      expect(() => metricsService.endTimer('test.operation')).not.toThrow();
    });
  });

  describe('Gauge Metrics', () => {
    it('should record gauge value', () => {
      metricsService.recordGauge('memory.usage', 1024);
      
      expect(() => metricsService.recordGauge('memory.usage', 1024)).not.toThrow();
    });

    it('should record gauge with tags', () => {
      const tags = { type: 'heap' };
      metricsService.recordGauge('memory.usage', 2048, tags);
      
      expect(() => metricsService.recordGauge('memory.usage', 2048, tags)).not.toThrow();
    });
  });

  describe('Metrics Summary', () => {
    it('should provide metrics summary', () => {
      metricsService.incrementCounter('test.counter');
      metricsService.startTimer('test.timer');
      
      const summary = metricsService.getSummary();
      
      expect(summary).toHaveProperty('counters');
      expect(summary).toHaveProperty('activeTimers');
      expect(summary).toHaveProperty('timestamp');
      expect(summary.counters).toHaveLength(1);
      expect(summary.activeTimers).toContain('test.timer');
    });

    it('should get all counters', () => {
      metricsService.incrementCounter('counter1');
      metricsService.incrementCounter('counter2');
      
      const counters = metricsService.getAllCounters();
      
      expect(counters).toHaveLength(2);
      expect(counters[0]).toHaveProperty('name');
      expect(counters[0]).toHaveProperty('value');
    });
  });

  describe('Metrics Reset', () => {
    it('should reset all metrics', () => {
      metricsService.incrementCounter('test.counter');
      metricsService.startTimer('test.timer');
      
      metricsService.reset();
      
      expect(metricsService.getCounter('test.counter')).toBe(0);
      expect(metricsService.getAllCounters()).toHaveLength(0);
      
      const summary = metricsService.getSummary();
      expect(summary.counters).toHaveLength(0);
      expect(summary.activeTimers).toHaveLength(0);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = MetricsService.getInstance();
      const instance2 = MetricsService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });
});