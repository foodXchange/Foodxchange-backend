import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { abTestingService } from '../services/testing/ABTestingService';

interface ABTestingRequest extends Request {
  user?: {
    id: string;
    email: string;
    companyId: string;
    role: string;
    company?: string;
  };
}

class ABTestingController {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('ABTestingController');
  }

  /**
   * Create a new A/B test
   */
  async createTest(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const {
        name,
        description,
        variants,
        targetCriteria,
        metrics,
        endDate,
        sampleSize,
        confidenceLevel,
        trafficAllocation,
        metadata
      } = req.body;

      const userId = req.user?.id;
      const companyId = req.user?.companyId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const test = await abTestingService.createTest({
        name,
        description,
        variants,
        targetCriteria,
        metrics,
        startDate: new Date(), // Will be set when test starts
        endDate: endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
        sampleSize: sampleSize || 1000,
        confidenceLevel: confidenceLevel || 0.95,
        trafficAllocation: trafficAllocation || 100,
        createdBy: userId,
        companyId,
        metadata: metadata || {},
        status: 'draft'
      });

      res.status(201).json({
        success: true,
        data: test
      });
    } catch (error) {
      this.logger.error('Failed to create A/B test:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'TEST_CREATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create A/B test'
        }
      });
    }
  }

  /**
   * Get test details
   */
  async getTest(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      const test = await abTestingService.getTest(testId);
      if (!test) {
        res.status(404).json({
          success: false,
          error: {
            code: 'TEST_NOT_FOUND',
            message: 'A/B test not found'
          }
        });
        return;
      }

      // Check if user has access to this test
      const companyId = req.user?.companyId;
      if (test.companyId && test.companyId !== companyId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access denied to this test'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: test
      });
    } catch (error) {
      this.logger.error('Failed to get A/B test:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_TEST_FAILED',
          message: 'Failed to retrieve A/B test'
        }
      });
    }
  }

  /**
   * Get all tests for the company
   */
  async getCompanyTests(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'COMPANY_ID_REQUIRED',
            message: 'Company ID is required'
          }
        });
        return;
      }

      const tests = await abTestingService.getCompanyTests(companyId);

      res.json({
        success: true,
        data: {
          tests,
          total: tests.length
        }
      });
    } catch (error) {
      this.logger.error('Failed to get company tests:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_COMPANY_TESTS_FAILED',
          message: 'Failed to retrieve company tests'
        }
      });
    }
  }

  /**
   * Start a test
   */
  async startTest(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      await abTestingService.startTest(testId);

      res.json({
        success: true,
        data: {
          message: 'Test started successfully',
          testId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to start test:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'START_TEST_FAILED',
          message: error instanceof Error ? error.message : 'Failed to start test'
        }
      });
    }
  }

  /**
   * Pause a test
   */
  async pauseTest(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      await abTestingService.pauseTest(testId);

      res.json({
        success: true,
        data: {
          message: 'Test paused successfully',
          testId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to pause test:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'PAUSE_TEST_FAILED',
          message: error instanceof Error ? error.message : 'Failed to pause test'
        }
      });
    }
  }

  /**
   * Complete a test
   */
  async completeTest(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      await abTestingService.completeTest(testId);

      res.json({
        success: true,
        data: {
          message: 'Test completed successfully',
          testId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to complete test:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'COMPLETE_TEST_FAILED',
          message: error instanceof Error ? error.message : 'Failed to complete test'
        }
      });
    }
  }

  /**
   * Delete a test
   */
  async deleteTest(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      await abTestingService.deleteTest(testId);

      res.json({
        success: true,
        data: {
          message: 'Test deleted successfully',
          testId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to delete test:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'DELETE_TEST_FAILED',
          message: error instanceof Error ? error.message : 'Failed to delete test'
        }
      });
    }
  }

  /**
   * Assign user to test (for client-side assignment)
   */
  async assignUserToTest(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      const userId = req.user?.id;
      const context = req.body.context || {};

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const assignment = await abTestingService.assignUser(testId, userId, context);

      if (!assignment) {
        res.json({
          success: true,
          data: {
            assigned: false,
            message: 'User not eligible for this test'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          assigned: true,
          assignment,
          variantId: assignment.variantId
        }
      });
    } catch (error) {
      this.logger.error('Failed to assign user to test:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ASSIGNMENT_FAILED',
          message: 'Failed to assign user to test'
        }
      });
    }
  }

  /**
   * Get user's variant for a test
   */
  async getUserVariant(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const variant = await abTestingService.getVariantForUser(testId, userId);
      const assignment = await abTestingService.getUserAssignment(testId, userId);

      res.json({
        success: true,
        data: {
          testId,
          userId,
          assigned: !!assignment,
          variantId: assignment?.variantId || null,
          configuration: variant || null,
          assignedAt: assignment?.assignedAt || null
        }
      });
    } catch (error) {
      this.logger.error('Failed to get user variant:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_VARIANT_FAILED',
          message: 'Failed to get user variant'
        }
      });
    }
  }

  /**
   * Record a conversion or event
   */
  async recordEvent(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      const { eventType, value, metadata } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      if (!eventType) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_EVENT_TYPE',
            message: 'Event type is required'
          }
        });
        return;
      }

      await abTestingService.recordResult(testId, userId, eventType, value || 1, metadata);

      res.json({
        success: true,
        data: {
          message: 'Event recorded successfully',
          testId,
          eventType,
          value: value || 1,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to record event:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECORD_EVENT_FAILED',
          message: 'Failed to record event'
        }
      });
    }
  }

  /**
   * Record a conversion
   */
  async recordConversion(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      const { conversionType, value } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      await abTestingService.recordConversion(testId, userId, conversionType || 'default', value || 1);

      res.json({
        success: true,
        data: {
          message: 'Conversion recorded successfully',
          testId,
          conversionType: conversionType || 'default',
          value: value || 1,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to record conversion:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECORD_CONVERSION_FAILED',
          message: 'Failed to record conversion'
        }
      });
    }
  }

  /**
   * Record revenue
   */
  async recordRevenue(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;
      const { amount, currency } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      if (!amount || amount <= 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AMOUNT',
            message: 'Valid revenue amount is required'
          }
        });
        return;
      }

      await abTestingService.recordRevenue(testId, userId, amount, currency || 'USD');

      res.json({
        success: true,
        data: {
          message: 'Revenue recorded successfully',
          testId,
          amount,
          currency: currency || 'USD',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to record revenue:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECORD_REVENUE_FAILED',
          message: 'Failed to record revenue'
        }
      });
    }
  }

  /**
   * Get test analysis and results
   */
  async getTestAnalysis(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      const analysis = await abTestingService.getTestAnalysis(testId);
      if (!analysis) {
        res.status(404).json({
          success: false,
          error: {
            code: 'ANALYSIS_NOT_FOUND',
            message: 'Test analysis not found'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      this.logger.error('Failed to get test analysis:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_ANALYSIS_FAILED',
          message: 'Failed to retrieve test analysis'
        }
      });
    }
  }

  /**
   * Get test statistics summary
   */
  async getTestStatistics(req: ABTestingRequest, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      const test = await abTestingService.getTest(testId);
      if (!test) {
        res.status(404).json({
          success: false,
          error: {
            code: 'TEST_NOT_FOUND',
            message: 'A/B test not found'
          }
        });
        return;
      }

      const analysis = await abTestingService.getTestAnalysis(testId);

      const statistics = {
        testId,
        name: test.name,
        status: test.status,
        startDate: test.startDate,
        endDate: test.endDate,
        totalParticipants: analysis?.totalParticipants || 0,
        variants: test.variants.map(variant => ({
          id: variant.id,
          name: variant.name,
          trafficSplit: variant.trafficSplit,
          isControl: variant.isControl
        })),
        metrics: test.metrics,
        lastUpdated: new Date().toISOString()
      };

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      this.logger.error('Failed to get test statistics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_STATISTICS_FAILED',
          message: 'Failed to retrieve test statistics'
        }
      });
    }
  }
}

export const abTestingController = new ABTestingController();
