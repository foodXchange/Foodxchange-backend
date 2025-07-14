// AI utility functions for data preprocessing and postprocessing

class AIUtils {
  // Clean and prepare text for AI analysis
  static cleanTextForAnalysis(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s.,!?-]/g, '') // Remove special characters except basic punctuation
      .substring(0, 5000); // Limit to 5000 characters for AI processing
  }

  // Extract numeric values from text
  static extractNumbers(text) {
    const numberRegex = /\d+(?:\.\d+)?/g;
    return text.match(numberRegex) || [];
  }

  // Extract quantities with units
  static extractQuantities(text) {
    const quantityRegex = /(\d+(?:\.\d+)?)\s*(kg|g|lb|oz|ml|l|gallon|ton|tonnes|cases|boxes|units|pieces)/gi;
    const matches = text.match(quantityRegex) || [];
    
    return matches.map(match => {
      const parts = match.split(/\s+/);
      return {
        value: parseFloat(parts[0]),
        unit: parts[1].toLowerCase(),
        original: match
      };
    });
  }

  // Calculate confidence score from multiple factors
  static calculateConfidenceScore(factors) {
    if (!factors || typeof factors !== 'object') {
      return 0;
    }

    const weights = {
      textAnalysis: 0.3,
      imageAnalysis: 0.3,
      entityRecognition: 0.2,
      sentimentAnalysis: 0.2
    };

    let totalWeight = 0;
    let weightedSum = 0;

    Object.entries(factors).forEach(([key, value]) => {
      if (weights[key] && typeof value === 'number') {
        weightedSum += value * weights[key];
        totalWeight += weights[key];
      }
    });

    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
  }

  // Normalize supplier data for AI processing
  static normalizeSupplierData(supplier) {
    return {
      id: supplier._id || supplier.id,
      name: supplier.name || supplier.companyName || '',
      description: supplier.description || '',
      products: Array.isArray(supplier.products) ? supplier.products : [],
      certifications: Array.isArray(supplier.certifications) ? supplier.certifications : [],
      location: {
        country: supplier.location?.country || supplier.country || '',
        region: supplier.location?.region || supplier.region || '',
        city: supplier.location?.city || supplier.city || ''
      },
      rating: parseFloat(supplier.rating) || 0,
      capacity: supplier.capacity || {}
    };
  }

  // Normalize product data for AI processing
  static normalizeProductData(product) {
    return {
      id: product._id || product.id,
      name: product.name || '',
      description: product.description || '',
      category: product.category || '',
      subcategory: product.subcategory || '',
      imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls : 
                 Array.isArray(product.images) ? product.images : [],
      certifications: Array.isArray(product.certifications) ? product.certifications : [],
      origin: product.origin || '',
      specifications: product.specifications || {}
    };
  }

  // Format AI response for client
  static formatAIResponse(rawResponse, requestType) {
    const formatted = {
      success: true,
      type: requestType,
      processedAt: new Date().toISOString(),
      data: rawResponse
    };

    // Add confidence score if available
    if (rawResponse.confidence) {
      formatted.confidence = rawResponse.confidence;
    }

    // Add processing metadata
    formatted.metadata = {
      processingTime: Date.now(), // You can track actual processing time
      version: '1.0.0',
      aiServices: this.getUsedServices(rawResponse)
    };

    return formatted;
  }

  // Identify which AI services were used in the response
  static getUsedServices(response) {
    const services = [];
    
    if (response.keyPhrases || response.sentiment || response.entities) {
      services.push('textAnalytics');
    }
    
    if (response.imageAnalysis || response.tags || response.objects) {
      services.push('computerVision');
    }
    
    if (response.documents || response.forms) {
      services.push('formRecognizer');
    }
    
    if (response.searchResults) {
      services.push('cognitiveSearch');
    }
    
    return services;
  }

  // Validate AI input data
  static validateInput(data, type) {
    const errors = [];

    switch (type) {
      case 'rfq':
        if (!data.rfqText || typeof data.rfqText !== 'string') {
          errors.push('RFQ text is required and must be a string');
        }
        if (data.rfqText && data.rfqText.length < 10) {
          errors.push('RFQ text must be at least 10 characters long');
        }
        break;

      case 'product':
        if (!data.productId) {
          errors.push('Product ID is required');
        }
        break;

      case 'image':
        if (!data.imageUrl || typeof data.imageUrl !== 'string') {
          errors.push('Image URL is required and must be a string');
        }
        if (data.imageUrl && !this.isValidImageUrl(data.imageUrl)) {
          errors.push('Invalid image URL format');
        }
        break;

      default:
        errors.push('Unknown validation type');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Check if URL is a valid image URL
  static isValidImageUrl(url) {
    try {
      const parsedUrl = new URL(url);
      const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      const pathname = parsedUrl.pathname.toLowerCase();
      
      return validExtensions.some(ext => pathname.endsWith(ext)) ||
             pathname.includes('image') ||
             parsedUrl.hostname.includes('images');
    } catch {
      return false;
    }
  }

  // Sanitize data for logging (remove sensitive information)
  static sanitizeForLogging(data) {
    const sensitiveFields = ['key', 'password', 'secret', 'token', 'credentials'];
    
    const sanitized = JSON.parse(JSON.stringify(data));
    
    const removeSensitiveFields = (obj) => {
      if (typeof obj !== 'object' || obj === null) return;
      
      Object.keys(obj).forEach(key => {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          removeSensitiveFields(obj[key]);
        }
      });
    };
    
    removeSensitiveFields(sanitized);
    return sanitized;
  }
}

module.exports = AIUtils;
