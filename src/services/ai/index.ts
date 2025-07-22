// FoodXchange AI Services
import aiConfig from './config';
import documentProcessing from './document-processing';
import productAnalysis from './product-analysis';
import supplierMatching from './supplier-matching';

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
export {
  initializeAIServices,
  aiConfig,
  supplierMatching,
  productAnalysis,
  documentProcessing
};
