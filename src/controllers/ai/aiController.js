const supplierMatchingService = require('../services/ai/supplierMatchingService');
const productAnalysisService = require('../services/ai/productAnalysisService');

class AIController {
  // Analyze RFQ and find matching suppliers
  async analyzeRFQ(req, res) {
    try {
      const { rfqText, rfqId } = req.body;

      if (!rfqText) {
        return res.status(400).json({
          success: false,
          message: 'RFQ text is required'
        });
      }

      // Analyze RFQ with AI
      const rfqAnalysis = await supplierMatchingService.analyzeRFQ(rfqText);

      // Get suppliers from database (you'll need to implement this based on your model)
      // For now, we'll assume you have a Supplier model
      const suppliers = await this.getSuppliers(); // Implement this method based on your database

      // Find matching suppliers
      const matchedSuppliers = await supplierMatchingService.findMatchingSuppliers(
        rfqAnalysis,
        suppliers
      );

      res.json({
        success: true,
        data: {
          rfqId,
          analysis: rfqAnalysis,
          matchedSuppliers: matchedSuppliers.slice(0, 10), // Top 10 matches
          totalMatches: matchedSuppliers.length
        }
      });

    } catch (error) {
      console.error('Error in analyzeRFQ:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze RFQ',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Analyze product with AI
  async analyzeProduct(req, res) {
    try {
      const { productId } = req.params;

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: 'Product ID is required'
        });
      }

      // Get product from database (implement based on your model)
      const product = await this.getProduct(productId); // Implement this method

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Analyze product with AI
      const analysis = await productAnalysisService.analyzeProduct(product);

      res.json({
        success: true,
        data: {
          productId,
          analysis,
          processedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error in analyzeProduct:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze product',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Batch analyze multiple products
  async batchAnalyzeProducts(req, res) {
    try {
      const { productIds } = req.body;

      if (!productIds || !Array.isArray(productIds)) {
        return res.status(400).json({
          success: false,
          message: 'Product IDs array is required'
        });
      }

      const results = [];
      const errors = [];

      for (const productId of productIds.slice(0, 10)) { // Limit to 10 products
        try {
          const product = await this.getProduct(productId);
          if (product) {
            const analysis = await productAnalysisService.analyzeProduct(product);
            results.push({
              productId,
              analysis,
              status: 'success'
            });
          } else {
            errors.push({
              productId,
              error: 'Product not found'
            });
          }
        } catch (error) {
          errors.push({
            productId,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        data: {
          results,
          errors,
          processedCount: results.length,
          errorCount: errors.length
        }
      });

    } catch (error) {
      console.error('Error in batchAnalyzeProducts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to batch analyze products',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get AI service health status
  async getAIStatus(req, res) {
    try {
      const aiService = require('../services/ai/azureAIService');
      
      res.json({
        success: true,
        data: {
          aiServicesInitialized: aiService.isInitialized(),
          services: {
            textAnalytics: !!process.env.AZURE_TEXT_ANALYTICS_ENDPOINT,
            computerVision: !!process.env.AZURE_VISION_ENDPOINT,
            formRecognizer: !!process.env.AZURE_FORM_RECOGNIZER_ENDPOINT,
            cognitiveSearch: !!process.env.AZURE_SEARCH_ENDPOINT
          },
          featureFlags: {
            supplierMatching: process.env.AI_SUPPLIER_MATCHING === 'true',
            productAnalysis: process.env.AI_PRODUCT_ANALYSIS === 'true',
            documentProcessing: process.env.AI_DOCUMENT_PROCESSING === 'true',
            smartSearch: process.env.AI_SMART_SEARCH === 'true',
            complianceCheck: process.env.AI_COMPLIANCE_CHECK === 'true'
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error in getAIStatus:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get AI status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Helper methods (implement these based on your database models)
  async getSuppliers() {
    // TODO: Implement based on your Supplier model
    // Example: return await Supplier.find().lean();
    throw new Error('getSuppliers method not implemented - please implement based on your database model');
  }

  async getProduct(productId) {
    // TODO: Implement based on your Product model
    // Example: return await Product.findById(productId).lean();
    throw new Error('getProduct method not implemented - please implement based on your database model');
  }
}

module.exports = new AIController();
