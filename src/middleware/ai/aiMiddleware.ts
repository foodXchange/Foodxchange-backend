const aiService = require('../services/ai/azureAIService');

// Middleware to ensure AI services are initialized
const requireAIServices = async (req, res, next) => {
  try {
    if (!aiService.isInitialized()) {
      await aiService.initialize();
    }
    next();
  } catch (error) {
    console.error('AI services initialization failed:', error);
    res.status(503).json({
      success: false,
      message: 'AI services temporarily unavailable',
      code: 'AI_SERVICES_UNAVAILABLE'
    });
  }
};

// Middleware to check if specific AI feature is enabled
const requireAIFeature = (featureName) => {
  return (req, res, next) => {
    const featureFlag = process.env[`AI_${featureName.toUpperCase()}`];
    
    if (featureFlag !== 'true') {
      return res.status(403).json({
        success: false,
        message: `AI feature '${featureName}' is not enabled`,
        code: 'AI_FEATURE_DISABLED'
      });
    }
    
    next();
  };
};

// Rate limiting middleware for AI endpoints
const aiRateLimit = (req, res, next) => {
  // Implement rate limiting logic here
  // For now, just pass through
  next();
};

module.exports = {
  requireAIServices,
  requireAIFeature,
  aiRateLimit
};
