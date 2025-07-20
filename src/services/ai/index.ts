// FoodXchange AI Services
const aiConfig = require('./config');
const documentProcessing = require('./document-processing');
const productAnalysis = require('./product-analysis');
const supplierMatching = require('./supplier-matching');

// Initialize all services
async function initializeAIServices() {
  try {
    console.log('🚀 Initializing FoodXchange AI Services...');

    await aiConfig.initialize();

    console.log('✅ All AI services ready');

    return {
      config: aiConfig,
      supplierMatching,
      productAnalysis,
      documentProcessing
    };

  } catch (error) {
    console.error('❌ Failed to initialize AI services:', error);
    throw error;
  }
}

// Export all services
module.exports = {
  initializeAIServices,
  aiConfig,
  supplierMatching,
  productAnalysis,
  documentProcessing
};
