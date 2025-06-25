const { ComplianceScore } = require('../models/compliance/ComplianceModel');
const Order = require('../models/Order');
const Review = require('../models/Review');

class ScoringService {
  async calculateSupplierScore(supplierId) {
    const scores = {
      quality: await this.calculateQualityScore(supplierId),
      delivery: await this.calculateDeliveryScore(supplierId),
      pricing: await this.calculatePricingScore(supplierId),
      communication: await this.calculateCommunicationScore(supplierId),
      compliance: await this.calculateComplianceScore(supplierId)
    };
    
    // Weighted average
    const weights = {
      quality: 0.3,
      delivery: 0.25,
      pricing: 0.2,
      communication: 0.15,
      compliance: 0.1
    };
    
    let totalScore = 0;
    for (const [metric, score] of Object.entries(scores)) {
      totalScore += score * weights[metric];
    }
    
    return {
      overall: Math.round(totalScore),
      breakdown: scores,
      lastUpdated: new Date()
    };
  }
  
  async calculateQualityScore(supplierId) {
    const reviews = await Review.find({ supplier: supplierId });
    if (reviews.length === 0) return 75; // Default score
    
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    return Math.round(avgRating * 20); // Convert 5-star to 100-point
  }
  
  async calculateDeliveryScore(supplierId) {
    const orders = await Order.find({ 
      supplier: supplierId,
      status: 'delivered'
    });
    
    if (orders.length === 0) return 75;
    
    const onTimeDeliveries = orders.filter(order => {
      return order.actualDeliveryDate <= order.promisedDeliveryDate;
    }).length;
    
    return Math.round((onTimeDeliveries / orders.length) * 100);
  }
  
  async calculatePricingScore(supplierId) {
    // Compare prices with market average
    // Placeholder implementation
    return 85;
  }
  
  async calculateCommunicationScore(supplierId) {
    // Calculate based on response time, message quality
    // Placeholder implementation
    return 90;
  }
  
  async calculateComplianceScore(supplierId) {
    const compliance = await ComplianceScore.findOne({ supplier: supplierId });
    return compliance?.overallScore || 80;
  }
}

module.exports = new ScoringService();
