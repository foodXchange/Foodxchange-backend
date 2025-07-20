import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { advancedAnalyticsService } from '../services/analytics/AdvancedAnalyticsService';
import { dataVisualizationService } from '../services/analytics/DataVisualizationService';
import { predictiveAnalyticsService } from '../services/analytics/PredictiveAnalyticsService';
import { realTimeAnalyticsService } from '../services/analytics/RealTimeAnalyticsService';
import { supplyChainAnalyticsService } from '../services/blockchain/SupplyChainAnalyticsService';

const logger = new Logger('AnalyticsDashboardController');

export class AnalyticsDashboardController {

  async getComprehensiveDashboard(req: Request, res: Response) {
    try {
      const { user } = req as any;
      const { period = '30d', includeForecasts = 'true', includeRealtime = 'true' } = req.query;

      // Calculate date range
      const endDate = new Date();
      const days = parseInt(period.toString().replace('d', '').replace('y', '')) * (period.toString().includes('y') ? 365 : 1);
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      // Gather all analytics data in parallel
      const [
        dashboardMetrics,
        realtimeMetrics,
        supplyChainMetrics,
        customerSegments,
        riskAssessment,
        marketTrends
      ] = await Promise.all([
        advancedAnalyticsService.generateDashboardMetrics(
          user.company,
          { start: startDate, end: endDate },
          user.role
        ),
        includeRealtime === 'true' ? advancedAnalyticsService.getRealtimeMetrics(user.company, user.role) : null,
        user.role === 'SELLER' ? supplyChainAnalyticsService.generateSupplyChainMetrics() : null,
        predictiveAnalyticsService.segmentCustomers(user.company),
        predictiveAnalyticsService.assessRisks(user.company),
        predictiveAnalyticsService.generateMarketTrends()
      ]);

      // Generate forecasts if requested
      let demandForecasts = null;
      if (includeForecasts === 'true') {
        // Get top products for forecasting
        const topProducts = dashboardMetrics.sales.topProducts.slice(0, 5);
        demandForecasts = await Promise.all(
          topProducts.map(async product =>
            predictiveAnalyticsService.generateDemandForecast(product.productId, 'MONTH', 3)
          )
        );
      }

      const response = {
        success: true,
        data: {
          overview: dashboardMetrics.overview,
          sales: dashboardMetrics.sales,
          customers: {
            ...dashboardMetrics.customers,
            segments: customerSegments
          },
          performance: dashboardMetrics.performance,
          rfqAnalytics: dashboardMetrics.rfqAnalytics,
          realtime: realtimeMetrics,
          supplyChain: supplyChainMetrics,
          forecasts: demandForecasts,
          risks: riskAssessment,
          marketTrends,
          metadata: {
            generatedAt: new Date(),
            period: { start: startDate, end: endDate, period },
            userRole: user.role,
            companyId: user.company
          }
        }
      };

      logger.info('Comprehensive dashboard generated', {
        userId: user.id,
        companyId: user.company,
        period,
        includeForecasts,
        includeRealtime
      });

      res.json(response);

    } catch (error) {
      logger.error('Failed to generate comprehensive dashboard', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate dashboard data'
      });
    }
  }

  async getExecutiveSummary(req: Request, res: Response) {
    try {
      const { user } = req as any;
      const { timeframe = 'MONTH' } = req.query;

      // Generate executive-level insights
      const endDate = new Date();
      const startDate = new Date();

      switch (timeframe) {
        case 'WEEK':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'QUARTER':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case 'YEAR':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default: // MONTH
          startDate.setMonth(endDate.getMonth() - 1);
      }

      const [metrics, insights, risks] = await Promise.all([
        advancedAnalyticsService.generateDashboardMetrics(
          user.company,
          { start: startDate, end: endDate },
          user.role
        ),
        user.role === 'SELLER' ? supplyChainAnalyticsService.generateSupplyChainInsights(user.company, timeframe as any) : null,
        predictiveAnalyticsService.assessRisks(user.company)
      ]);

      const executiveSummary = {
        keyMetrics: {
          revenue: {
            current: metrics.overview.totalRevenue,
            growth: metrics.overview.growthRate,
            trend: metrics.overview.growthRate > 0 ? 'positive' : 'negative'
          },
          orders: {
            current: metrics.overview.totalOrders,
            conversionRate: metrics.overview.conversionRate
          },
          performance: {
            onTimeDelivery: metrics.performance.orderFulfillment.onTimeDeliveryRate,
            qualityScore: metrics.performance.orderFulfillment.qualityScore
          }
        },
        topInsights: [
          `Revenue ${metrics.overview.growthRate > 0 ? 'increased' : 'decreased'} by ${Math.abs(metrics.overview.growthRate).toFixed(1)}% compared to previous period`,
          `Top performing category: ${metrics.sales.topCategories[0]?.name || 'N/A'}`,
          `Conversion rate: ${metrics.overview.conversionRate.toFixed(1)}%`,
          insights ? `Supply chain performance: ${insights.trends.qualityTrend.toLowerCase()}` : null
        ].filter(Boolean),
        riskAlerts: risks.filter(risk => risk.level === 'HIGH' || risk.level === 'CRITICAL'),
        recommendations: [
          metrics.overview.growthRate < 0 ? 'Focus on customer retention strategies' : 'Capitalize on growth momentum',
          metrics.overview.conversionRate < 5 ? 'Optimize conversion funnel' : 'Maintain current conversion strategies',
          risks.length > 0 ? 'Address identified risks proactively' : 'Continue monitoring risk factors'
        ],
        nextActions: [
          'Review top-performing products for expansion opportunities',
          'Analyze customer segments for targeted marketing',
          'Monitor supply chain performance metrics'
        ]
      };

      logger.info('Executive summary generated', {
        userId: user.id,
        companyId: user.company,
        timeframe
      });

      res.json({
        success: true,
        data: executiveSummary,
        metadata: {
          generatedAt: new Date(),
          timeframe,
          period: { start: startDate, end: endDate }
        }
      });

    } catch (error) {
      logger.error('Failed to generate executive summary', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate executive summary'
      });
    }
  }

  async generateAnalyticsReport(req: Request, res: Response) {
    try {
      const { user } = req as any;
      const { reportType, format, startDate, endDate, includeCharts = 'true' } = req.body;

      // Validate inputs
      if (!['SALES', 'CUSTOMERS', 'PRODUCTS', 'COMPREHENSIVE'].includes(reportType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report type'
        });
      }

      if (!['PDF', 'EXCEL', 'CSV'].includes(format)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid format'
        });
      }

      // Generate metrics for the specified period
      const metrics = await advancedAnalyticsService.generateDashboardMetrics(
        user.company,
        { start: new Date(startDate), end: new Date(endDate) },
        user.role
      );

      let reportBuffer: Buffer;

      // Generate report based on format
      switch (format) {
        case 'PDF':
          if (includeCharts === 'true') {
            reportBuffer = await dataVisualizationService.generateDashboardReport(
              metrics,
              'PDF',
              user.companyName || 'Company'
            );
          } else {
            // Generate PDF without charts
            const template = {
              title: `${reportType} Report`,
              subtitle: `${user.companyName || 'Company'} - ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
              sections: this.buildReportSections(metrics, reportType),
              footer: `Generated on ${new Date().toLocaleString()}`
            };
            reportBuffer = await dataVisualizationService.generatePDFReport(template);
          }
          break;

        case 'EXCEL':
          reportBuffer = await dataVisualizationService.generateDashboardReport(
            metrics,
            'EXCEL',
            user.companyName || 'Company'
          );
          break;

        case 'CSV':
          reportBuffer = await dataVisualizationService.generateDashboardReport(
            metrics,
            'CSV',
            user.companyName || 'Company'
          );
          break;

        default:
          throw new Error('Unsupported format');
      }

      // Set appropriate headers
      const filename = `${reportType.toLowerCase()}_report_${Date.now()}.${format.toLowerCase()}`;
      const contentType = this.getContentType(format);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', reportBuffer.length);

      logger.info('Analytics report generated', {
        userId: user.id,
        companyId: user.company,
        reportType,
        format,
        fileSize: reportBuffer.length
      });

      res.send(reportBuffer);

    } catch (error) {
      logger.error('Failed to generate analytics report', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate report'
      });
    }
  }

  private buildReportSections(metrics: any, reportType: string): any[] {
    const sections = [];

    // Overview section
    sections.push({
      title: 'Overview',
      type: 'metrics',
      content: [
        { label: 'Total Revenue', value: `$${metrics.overview.totalRevenue.toLocaleString()}`, change: metrics.overview.growthRate },
        { label: 'Total Orders', value: metrics.overview.totalOrders.toLocaleString() },
        { label: 'Conversion Rate', value: `${metrics.overview.conversionRate.toFixed(1)}%` }
      ]
    });

    if (['SALES', 'COMPREHENSIVE'].includes(reportType)) {
      sections.push({
        title: 'Sales Performance',
        type: 'table',
        content: {
          headers: ['Product', 'Revenue', 'Units Sold'],
          rows: metrics.sales.topProducts.map((p: any) => [p.name, `$${p.revenue}`, p.units])
        }
      });
    }

    if (['CUSTOMERS', 'COMPREHENSIVE'].includes(reportType)) {
      sections.push({
        title: 'Customer Analytics',
        type: 'text',
        content: 'Customer acquisition and retention metrics for the selected period.'
      });
    }

    return sections;
  }

  private getContentType(format: string): string {
    switch (format) {
      case 'PDF':
        return 'application/pdf';
      case 'EXCEL':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'CSV':
        return 'text/csv';
      default:
        return 'application/octet-stream';
    }
  }

  async getPredictiveInsights(req: Request, res: Response) {
    try {
      const { user } = req as any;
      const { productIds, timeframe = 'MONTH' } = req.query;

      const products = productIds ? productIds.toString().split(',') : [];

      // Generate predictive insights
      const [forecasts, priceOptimizations, marketTrends] = await Promise.all([
        Promise.all(
          products.slice(0, 10).map(async (productId: string) =>
            predictiveAnalyticsService.generateDemandForecast(productId, timeframe as any, 4)
          )
        ),
        Promise.all(
          products.slice(0, 5).map(async (productId: string) =>
            predictiveAnalyticsService.optimizePrice(productId)
          )
        ),
        predictiveAnalyticsService.generateMarketTrends()
      ]);

      const insights = {
        demandForecasts: forecasts,
        priceOptimizations,
        marketTrends,
        summary: {
          totalProductsAnalyzed: products.length,
          forecastConfidence: forecasts.reduce((avg, f) => avg + f.confidence, 0) / forecasts.length,
          priceOptimizationOpportunities: priceOptimizations.filter(p => p.recommendation.action !== 'MAINTAIN').length
        }
      };

      logger.info('Predictive insights generated', {
        userId: user.id,
        companyId: user.company,
        productsAnalyzed: products.length
      });

      res.json({
        success: true,
        data: insights,
        metadata: {
          generatedAt: new Date(),
          timeframe,
          productsAnalyzed: products.length
        }
      });

    } catch (error) {
      logger.error('Failed to generate predictive insights', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate predictive insights'
      });
    }
  }

  async getPerformanceBenchmarks(req: Request, res: Response) {
    try {
      const { user } = req as any;
      const { category, timeframe = 'MONTH' } = req.query;

      // Generate performance benchmarks
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(endDate.getMonth() - 1);

      const metrics = await advancedAnalyticsService.generateDashboardMetrics(
        user.company,
        { start: startDate, end: endDate },
        user.role
      );

      // Mock industry benchmarks - in production, would use real industry data
      const benchmarks = {
        company: {
          conversionRate: metrics.overview.conversionRate,
          avgOrderValue: metrics.overview.totalRevenue / Math.max(1, metrics.overview.totalOrders),
          customerRetentionRate: 75.5,
          onTimeDeliveryRate: metrics.performance.orderFulfillment.onTimeDeliveryRate
        },
        industry: {
          conversionRate: 3.8,
          avgOrderValue: 245.50,
          customerRetentionRate: 68.2,
          onTimeDeliveryRate: 89.5
        },
        topPerformers: {
          conversionRate: 5.2,
          avgOrderValue: 320.75,
          customerRetentionRate: 82.1,
          onTimeDeliveryRate: 95.8
        },
        analysis: {
          strengths: [],
          improvements: [],
          ranking: {
            percentile: 0,
            position: 'Above Average'
          }
        }
      };

      // Calculate performance analysis
      const performanceScore = (
        (benchmarks.company.conversionRate / benchmarks.industry.conversionRate) +
        (benchmarks.company.avgOrderValue / benchmarks.industry.avgOrderValue) +
        (benchmarks.company.customerRetentionRate / benchmarks.industry.customerRetentionRate) +
        (benchmarks.company.onTimeDeliveryRate / benchmarks.industry.onTimeDeliveryRate)
      ) / 4;

      benchmarks.analysis.ranking.percentile = Math.min(95, Math.max(5, performanceScore * 75));

      if (benchmarks.company.conversionRate > benchmarks.industry.conversionRate) {
        benchmarks.analysis.strengths.push('Above-average conversion rate');
      } else {
        benchmarks.analysis.improvements.push('Improve conversion rate optimization');
      }

      if (benchmarks.company.onTimeDeliveryRate > benchmarks.industry.onTimeDeliveryRate) {
        benchmarks.analysis.strengths.push('Excellent delivery performance');
      } else {
        benchmarks.analysis.improvements.push('Enhance delivery reliability');
      }

      logger.info('Performance benchmarks generated', {
        userId: user.id,
        companyId: user.company,
        category,
        timeframe
      });

      res.json({
        success: true,
        data: benchmarks,
        metadata: {
          generatedAt: new Date(),
          timeframe,
          category: category || 'all'
        }
      });

    } catch (error) {
      logger.error('Failed to generate performance benchmarks', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate performance benchmarks'
      });
    }
  }
}

export const analyticsDashboardController = new AnalyticsDashboardController();
