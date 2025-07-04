const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Analytics = require('../models/analytics/Analytics');
const Meeting = require('../models/meeting/Meeting');
const Compliance = require('../models/compliance/Compliance');

class SupplierScoringService {
  constructor() {
    this.scoreComponents = {
      qualityScore: 0.25,
      deliveryScore: 0.20,
      priceScore: 0.15,
      communicationScore: 0.15,
      complianceScore: 0.15,
      flexibilityScore: 0.10
    };
  }

  /**
   * Calculate comprehensive supplier score
   */
  async calculateSupplierScore(supplierId) {
    try {
      const supplier = await User.findById(supplierId);
      if (!supplier || supplier.role !== 'supplier') {
        throw new Error('Invalid supplier');
      }

      const scores = {
        quality: await this.calculateQualityScore(supplierId),
        delivery: await this.calculateDeliveryScore(supplierId),
        price: await this.calculatePriceScore(supplierId),
        communication: await this.calculateCommunicationScore(supplierId),
        compliance: await this.calculateComplianceScore(supplierId),
        flexibility: await this.calculateFlexibilityScore(supplierId)
      };

      // Calculate weighted total
      const totalScore = Object.keys(scores).reduce((total, key) => {
        const componentKey = `${key}Score`;
        return total + (scores[key] * this.scoreComponents[componentKey]);
      }, 0);

      // Update supplier scorecard
      const scorecard = {
        overall: Math.round(totalScore),
        components: scores,
        lastUpdated: new Date(),
        trend: await this.calculateTrend(supplierId, totalScore),
        badges: await this.assignBadges(scores),
        improvementAreas: this.identifyImprovementAreas(scores)
      };

      // Save to supplier profile
      supplier.scorecard = scorecard;
      await supplier.save();

      return scorecard;

    } catch (error) {
      console.error('Scoring error:', error);
      throw error;
    }
  }

  async calculateQualityScore(supplierId) {
    const reviews = await Review.find({ 
      supplier: supplierId,
      'ratings.quality': { $exists: true }
    });

    if (reviews.length === 0) return 75; // Default score

    const avgQuality = reviews.reduce((sum, r) => sum + r.ratings.quality, 0) / reviews.length;
    return (avgQuality / 5) * 100;
  }

  async calculateDeliveryScore(supplierId) {
    const orders = await Order.find({ 
      supplier: supplierId,
      status: 'delivered'
    });

    if (orders.length === 0) return 75;

    let onTimeDeliveries = 0;
    orders.forEach(order => {
      if (order.deliveredAt <= order.expectedDelivery) {
        onTimeDeliveries++;
      }
    });

    return (onTimeDeliveries / orders.length) * 100;
  }

  async calculatePriceScore(supplierId) {
    // Compare prices with market average
    // This would need market data integration
    return 85; // Placeholder
  }

  async calculateCommunicationScore(supplierId) {
    const analytics = await Analytics.findOne({ 
      user: supplierId,
      'period.type': 'monthly'
    }).sort({ createdAt: -1 });

    if (!analytics) return 75;

    const responseRate = analytics.metrics.responseRate || 75;
    const avgResponseTime = analytics.metrics.avgResponseTime || 24;
    
    // Faster response = higher score
    const responseTimeScore = Math.max(0, 100 - (avgResponseTime * 2));
    
    return (responseRate + responseTimeScore) / 2;
  }

  async calculateComplianceScore(supplierId) {
    const compliances = await Compliance.find({ 
      user: supplierId,
      status: 'active'
    });

    if (compliances.length === 0) return 50;

    // Average of all compliance scores
    const avgCompliance = compliances.reduce((sum, c) => sum + c.complianceScore, 0) / compliances.length;
    return avgCompliance;
  }

  async calculateFlexibilityScore(supplierId) {
    // Based on order modifications, custom requests handled, etc.
    const meetings = await Meeting.find({
      'participants.user': supplierId,
      'outcome.rating': { $exists: true }
    });

    if (meetings.length === 0) return 75;

    const avgRating = meetings.reduce((sum, m) => sum + m.outcome.rating, 0) / meetings.length;
    return (avgRating / 5) * 100;
  }

  async calculateTrend(supplierId, currentScore) {
    // Get previous score from 30 days ago
    const previousScorecard = await User.findById(supplierId)
      .select('scorecard')
      .where('scorecard.lastUpdated')
      .gte(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    if (!previousScorecard?.scorecard) return 'stable';

    const diff = currentScore - previousScorecard.scorecard.overall;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  async assignBadges(scores) {
    const badges = [];

    if (scores.quality >= 90) badges.push('quality_excellence');
    if (scores.delivery >= 95) badges.push('reliable_shipper');
    if (scores.communication >= 90) badges.push('responsive_partner');
    if (scores.compliance >= 95) badges.push('fully_compliant');
    if (Object.values(scores).every(s => s >= 80)) badges.push('top_performer');

    return badges;
  }

  identifyImprovementAreas(scores) {
    const areas = [];
    const sortedScores = Object.entries(scores).sort((a, b) => a[1] - b[1]);
    
    // Identify bottom 2 areas
    sortedScores.slice(0, 2).forEach(([area, score]) => {
      if (score < 80) {
        areas.push({
          area,
          currentScore: score,
          targetScore: 85,
          priority: score < 70 ? 'high' : 'medium'
        });
      }
    });

    return areas;
  }
}

module.exports = new SupplierScoringService();
