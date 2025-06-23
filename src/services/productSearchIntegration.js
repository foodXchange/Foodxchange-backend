// src/services/productSearchIntegration.js
const searchService = require('./enhancedSearchService');

class ProductSearchIntegration {
  
  // Transform MongoDB Product to Elasticsearch document
  transformProductForSearch(product, supplier = null) {
    const searchDoc = {
      projectId: product._id.toString(),
      title: product.name,
      description: product.description,
      shortDescription: product.shortDescription,
      category: product.category,
      subcategory: product.subcategory,
      tags: product.tags || [],
      
      // Supplier information
      supplier: {
        id: product.supplier ? product.supplier.toString() : null,
        name: supplier?.companyName || 'Unknown Supplier',
        country: supplier?.address?.country,
        verified: supplier?.isVerified || false
      },
      
      // Search-optimized fields
      searchTerms: this.generateSearchTerms(product),
      
      // Status and visibility
      status: product.status,
      visibility: product.visibility,
      
      // Timestamps
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };
    
    return searchDoc;
  }
  
  // Generate comprehensive search terms including synonyms
  generateSearchTerms(product) {
    const terms = [];
    
    // Basic terms
    if (product.name) terms.push(product.name);
    if (product.category) terms.push(product.category);
    if (product.subcategory) terms.push(product.subcategory);
    if (product.tags) terms.push(...product.tags);
    
    // Food-specific synonyms
    this.addFoodSynonyms(terms, product.category, product.subcategory);
    
    return [...new Set(terms)]; // Remove duplicates
  }
  
  // Add food industry synonyms
  addFoodSynonyms(terms, category, subcategory) {
    const synonymMap = {
      grains: {
        corn: ['maize', 'sweetcorn'],
        wheat: ['grain', 'flour'],
        rice: ['grain', 'paddy'],
        flour: ['wheat', 'grain']
      }
    };
    
    if (synonymMap[category] && synonymMap[category][subcategory]) {
      terms.push(...synonymMap[category][subcategory]);
    }
  }
  
  // Index a single product
  async indexProduct(productId) {
    try {
      console.log(`Indexing product: ${productId}`);
      // For now, just log - we'll implement full indexing later
      return { success: true, id: productId };
      
    } catch (error) {
      console.error(`Failed to index product ${productId}:`, error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Remove product from search index
  async removeProduct(productId) {
    try {
      console.log(`Removing product from search: ${productId}`);
      return { success: true, id: productId };
    } catch (error) {
      console.error(`Failed to remove product ${productId}:`, error.message);
    }
  }
}

module.exports = new ProductSearchIntegration();