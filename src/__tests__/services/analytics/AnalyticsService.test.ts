import { AnalyticsService } from '../../../services/analytics/AnalyticsService';
import mongoose from 'mongoose';

// Mock dependencies
jest.mock('../../../core/logging/logger');
jest.mock('../../../core/metrics/MetricsService');
jest.mock('../../../services/cache/MultiLevelCacheService');
jest.mock('mongoose');

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let mockAnalyticsEvent: any;

  beforeEach(() => {
    analyticsService = new AnalyticsService();
    
    // Mock the AnalyticsEvent model
    mockAnalyticsEvent = {
      insertMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([])
      }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
    };

    // Mock mongoose model
    (mongoose.model as jest.Mock).mockReturnValue(mockAnalyticsEvent);
    (mongoose.Types.ObjectId as any).mockImplementation((id) => ({ toString: () => id || 'mock-id' }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('track', () => {
    it('should track analytics event successfully', async () => {
      const eventData = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'buyer',
        ip: '127.0.0.1',
        properties: { page: 'dashboard' }
      };

      await analyticsService.track('login_success', eventData);

      // Event should be added to buffer
      expect(analyticsService['eventBuffer']).toHaveLength(1);
      expect(analyticsService['eventBuffer'][0]).toEqual(
        expect.objectContaining({
          eventType: 'login_success',
          email: 'test@example.com',
          role: 'buyer',
          ip: '127.0.0.1',
          properties: { page: 'dashboard' }
        })
      );
    });

    it('should handle events without userId', async () => {
      const eventData = {
        email: 'test@example.com',
        ip: '127.0.0.1'
      };

      await analyticsService.track('page_viewed', eventData);

      expect(analyticsService['eventBuffer']).toHaveLength(1);
      expect(analyticsService['eventBuffer'][0]).toEqual(
        expect.objectContaining({
          eventType: 'page_viewed',
          userId: undefined,
          email: 'test@example.com',
          ip: '127.0.0.1'
        })
      );
    });

    it('should auto-flush when buffer is full', async () => {
      const insertManySpy = jest.spyOn(mockAnalyticsEvent, 'insertMany');
      
      // Set small batch size for testing
      analyticsService['batchSize'] = 2;

      await analyticsService.track('event1', { userId: 'user1' });
      await analyticsService.track('event2', { userId: 'user2' });

      expect(insertManySpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'event1' }),
          expect.objectContaining({ eventType: 'event2' })
        ]),
        { ordered: false }
      );
    });

    it('should emit events for real-time processing', async () => {
      const eventListener = jest.fn();
      analyticsService.on('event', eventListener);

      await analyticsService.track('test_event', { userId: 'user123' });

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'test_event',
          userId: expect.any(Object)
        })
      );
    });
  });

  describe('trackApiRequest', () => {
    it('should track API request with all properties', async () => {
      const mockReq = {
        user: { id: 'user123' },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('Mozilla/5.0'),
        method: 'GET',
        path: '/api/users',
        query: { page: 1 },
        params: { id: 'user123' }
      };

      const mockRes = {
        statusCode: 200
      };

      await analyticsService.trackApiRequest(mockReq, mockRes, 150);

      expect(analyticsService['eventBuffer']).toHaveLength(1);
      expect(analyticsService['eventBuffer'][0]).toEqual(
        expect.objectContaining({
          eventType: 'api_request',
          properties: {
            method: 'GET',
            path: '/api/users',
            statusCode: 200,
            responseTime: 150,
            query: { page: 1 },
            params: { id: 'user123' }
          }
        })
      );
    });
  });

  describe('trackApiError', () => {
    it('should track API error with error details', async () => {
      const mockReq = {
        user: { id: 'user123' },
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('Mozilla/5.0'),
        method: 'POST',
        path: '/api/users'
      };

      const error = new Error('Validation failed');
      error.name = 'ValidationError';

      await analyticsService.trackApiError(mockReq, error);

      expect(analyticsService['eventBuffer']).toHaveLength(1);
      expect(analyticsService['eventBuffer'][0]).toEqual(
        expect.objectContaining({
          eventType: 'api_error',
          properties: {
            method: 'POST',
            path: '/api/users',
            errorName: 'ValidationError',
            errorMessage: 'Validation failed',
            stack: expect.any(String)
          }
        })
      );
    });
  });

  describe('trackUserJourney', () => {
    it('should track user journey step', async () => {
      await analyticsService.trackUserJourney('user123', 'onboarding_complete', {
        completionTime: 300,
        stepsCompleted: 5
      });

      expect(analyticsService['eventBuffer']).toHaveLength(1);
      expect(analyticsService['eventBuffer'][0]).toEqual(
        expect.objectContaining({
          eventType: 'feature_used',
          properties: {
            journeyStep: 'onboarding_complete',
            completionTime: 300,
            stepsCompleted: 5
          }
        })
      );
    });
  });

  describe('trackSearch', () => {
    it('should track search query with results and filters', async () => {
      await analyticsService.trackSearch('user123', 'organic vegetables', 25, {
        category: 'vegetables',
        organic: true,
        location: 'New York'
      });

      expect(analyticsService['eventBuffer']).toHaveLength(1);
      expect(analyticsService['eventBuffer'][0]).toEqual(
        expect.objectContaining({
          eventType: 'search_performed',
          properties: {
            query: 'organic vegetables',
            resultsCount: 25,
            filters: {
              category: 'vegetables',
              organic: true,
              location: 'New York'
            }
          }
        })
      );
    });
  });

  describe('trackBusinessMetric', () => {
    it('should track business metric with value and metadata', async () => {
      await analyticsService.trackBusinessMetric('user123', 'revenue_generated', 1500.50, {
        currency: 'USD',
        source: 'direct_sale',
        orderId: 'order123'
      });

      expect(analyticsService['eventBuffer']).toHaveLength(1);
      expect(analyticsService['eventBuffer'][0]).toEqual(
        expect.objectContaining({
          eventType: 'feature_used',
          properties: {
            metricType: 'business',
            metric: 'revenue_generated',
            value: 1500.50,
            metadata: {
              currency: 'USD',
              source: 'direct_sale',
              orderId: 'order123'
            }
          }
        })
      );
    });
  });

  describe('getUserAnalytics', () => {
    it('should return user analytics with caching', async () => {
      const mockAnalyticsResult = [{
        totalEvents: 50,
        eventTypes: [
          { eventType: 'login_success', count: 10, lastOccurrence: new Date() },
          { eventType: 'page_viewed', count: 30, lastOccurrence: new Date() },
          { eventType: 'search_performed', count: 10, lastOccurrence: new Date() }
        ]
      }];

      mockAnalyticsEvent.aggregate.mockResolvedValue(mockAnalyticsResult);

      const result = await analyticsService.getUserAnalytics('user123');

      expect(mockAnalyticsEvent.aggregate).toHaveBeenCalledWith([
        { $match: { userId: expect.any(Object) } },
        {
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
            lastOccurrence: { $max: '$timestamp' }
          }
        },
        {
          $group: {
            _id: null,
            totalEvents: { $sum: '$count' },
            eventTypes: {
              $push: {
                eventType: '$_id',
                count: '$count',
                lastOccurrence: '$lastOccurrence'
              }
            }
          }
        }
      ]);

      expect(result).toEqual(mockAnalyticsResult[0]);
    });

    it('should handle date range filtering', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');

      await analyticsService.getUserAnalytics('user123', startDate, endDate);

      expect(mockAnalyticsEvent.aggregate).toHaveBeenCalledWith([
        { 
          $match: { 
            userId: expect.any(Object),
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        expect.any(Object),
        expect.any(Object)
      ]);
    });

    it('should return default result when no analytics found', async () => {
      mockAnalyticsEvent.aggregate.mockResolvedValue([]);

      const result = await analyticsService.getUserAnalytics('user123');

      expect(result).toEqual({
        totalEvents: 0,
        eventTypes: []
      });
    });
  });

  describe('getSystemAnalytics', () => {
    it('should return system-wide analytics', async () => {
      const mockSystemAnalytics = [
        {
          _id: 'login_success',
          totalCount: 100,
          uniqueUsers: 50,
          dailyBreakdown: [
            { date: '2023-01-01', count: 30, uniqueUsers: 20 },
            { date: '2023-01-02', count: 70, uniqueUsers: 30 }
          ]
        }
      ];

      mockAnalyticsEvent.aggregate.mockResolvedValue(mockSystemAnalytics);

      const result = await analyticsService.getSystemAnalytics();

      expect(result).toEqual({
        eventTypes: mockSystemAnalytics,
        totalEvents: 100,
        totalUniqueUsers: 50
      });
    });
  });

  describe('getRealtimeAnalytics', () => {
    it('should return last 5 minutes analytics', async () => {
      const mockRealtimeData = [
        { eventType: 'login_success', count: 5, uniqueUsers: 3 },
        { eventType: 'page_viewed', count: 20, uniqueUsers: 8 }
      ];

      mockAnalyticsEvent.aggregate.mockResolvedValue(mockRealtimeData);

      const result = await analyticsService.getRealtimeAnalytics();

      expect(result).toEqual({
        timeRange: '5 minutes',
        events: mockRealtimeData
      });

      // Check that the query filters for last 5 minutes
      const matchQuery = mockAnalyticsEvent.aggregate.mock.calls[0][0][0].$match;
      expect(matchQuery.timestamp.$gte).toBeInstanceOf(Date);
      expect(Date.now() - matchQuery.timestamp.$gte.getTime()).toBeLessThan(6 * 60 * 1000);
    });
  });

  describe('cleanupOldEvents', () => {
    it('should delete events older than specified days', async () => {
      mockAnalyticsEvent.deleteMany.mockResolvedValue({ deletedCount: 1000 });

      await analyticsService.cleanupOldEvents(30);

      expect(mockAnalyticsEvent.deleteMany).toHaveBeenCalledWith({
        timestamp: { $lt: expect.any(Date) }
      });

      // Check that the cutoff date is approximately 30 days ago
      const cutoffDate = mockAnalyticsEvent.deleteMany.mock.calls[0][0].timestamp.$lt;
      const daysDiff = (Date.now() - cutoffDate.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDiff).toBeCloseTo(30, 0);
    });
  });

  describe('exportAnalytics', () => {
    it('should export analytics data as JSON', async () => {
      const mockEvents = [
        {
          eventType: 'login_success',
          userId: 'user123',
          timestamp: new Date(),
          ip: '127.0.0.1',
          properties: { device: 'mobile' }
        }
      ];

      mockAnalyticsEvent.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockEvents)
      });

      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');

      const result = await analyticsService.exportAnalytics(startDate, endDate, 'json');

      expect(mockAnalyticsEvent.find).toHaveBeenCalledWith({
        timestamp: { $gte: startDate, $lte: endDate }
      });
      expect(result).toEqual(mockEvents);
    });

    it('should export analytics data as CSV format', async () => {
      const mockEvents = [
        {
          eventType: 'login_success',
          userId: 'user123',
          timestamp: new Date(),
          ip: '127.0.0.1',
          properties: { device: 'mobile' }
        }
      ];

      mockAnalyticsEvent.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockEvents)
      });

      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');

      const result = await analyticsService.exportAnalytics(startDate, endDate, 'csv');

      expect(result).toEqual([{
        eventType: 'login_success',
        userId: 'user123',
        timestamp: expect.any(Date),
        ip: '127.0.0.1',
        properties: '{"device":"mobile"}'
      }]);
    });
  });

  describe('flushEvents', () => {
    it('should flush buffered events to database', async () => {
      // Add events to buffer
      analyticsService['eventBuffer'] = [
        { eventType: 'test1', userId: 'user1' },
        { eventType: 'test2', userId: 'user2' }
      ];

      await analyticsService['flushEvents']();

      expect(mockAnalyticsEvent.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'test1', batchId: expect.any(String) }),
          expect.objectContaining({ eventType: 'test2', batchId: expect.any(String) })
        ]),
        { ordered: false }
      );

      // Buffer should be empty after flush
      expect(analyticsService['eventBuffer']).toHaveLength(0);
    });

    it('should handle empty buffer', async () => {
      analyticsService['eventBuffer'] = [];

      await analyticsService['flushEvents']();

      expect(mockAnalyticsEvent.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should gracefully shutdown the service', async () => {
      analyticsService['eventBuffer'] = [
        { eventType: 'test', userId: 'user1' }
      ];

      await analyticsService.shutdown();

      expect(mockAnalyticsEvent.insertMany).toHaveBeenCalled();
      expect(analyticsService['flushTimer']).toBeNull();
    });
  });
});