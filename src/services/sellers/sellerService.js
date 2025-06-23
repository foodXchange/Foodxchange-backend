const Seller = require('../../models/sellers/Seller');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const RFQ = require('../../models/RFQ');

class SellerService {
  // Match RFQs to seller based on their capabilities
  async matchRFQsToSeller(sellerId) {
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      throw new Error('Seller not found');
    }

    // Find RFQs that match seller's product categories and country
    const matchingRFQs = await RFQ.find({
      productCategories: { $in: seller.productCategories },
      status: 'active',
      $or: [
        { targetCountries: { $in: [seller.country] } },
        { targetCountries: { $size: 0 } } // No specific country requirement
      ]
    })
    .populate('buyer', 'companyName country')
    .sort('-createdAt')
    .limit(20);

    return matchingRFQs;
  }

  // Calculate seller performance metrics
  async calculateMetrics(sellerId) {
    const orders = await Order.find({ seller: sellerId });
    
    const metrics = {
      totalOrders: orders.length,
      completedOrders: orders.filter(o => o.status === 'completed').length,
      totalRevenue: orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
      responseTime: await this.calculateAverageResponseTime(sellerId),
      acceptanceRate: await this.calculateAcceptanceRate(sellerId)
    };

    // Update seller metrics
    await Seller.findByIdAndUpdate(sellerId, { metrics });

    return metrics;
  }

  // Calculate average response time in hours
  async calculateAverageResponseTime(sellerId) {
    // TODO: Implement actual calculation based on RFQ responses
    return 24; // Default 24 hours
  }

  // Calculate offer acceptance rate
  async calculateAcceptanceRate(sellerId) {
    // TODO: Implement actual calculation
    return 75; // Default 75%
  }

  // Validate seller documents
  async validateDocuments(sellerId) {
    const seller = await Seller.findById(sellerId);
    const requiredDocs = ['license', 'insurance'];
    
    const missingDocs = requiredDocs.filter(docType => 
      !seller.documents.some(doc => doc.type === docType && doc.expiryDate > new Date())
    );

    return {
      isValid: missingDocs.length === 0,
      missingDocuments: missingDocs
    };
  }

  // Update seller rating
  async updateRating(sellerId, newRating) {
    const seller = await Seller.findById(sellerId);
    
    const currentAvg = seller.rating.average || 0;
    const currentCount = seller.rating.count || 0;
    
    const newAvg = ((currentAvg * currentCount) + newRating) / (currentCount + 1);
    
    seller.rating = {
      average: Math.round(newAvg * 10) / 10, // Round to 1 decimal
      count: currentCount + 1
    };
    
    await seller.save();
    return seller.rating;
  }
}

module.exports = new SellerService();
