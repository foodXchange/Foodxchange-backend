// ===================================
// 📁 DATA INDEXING SERVICE
// ===================================

// 📄 services/indexingService.js
const { esClient } = require('../config/elasticsearch');
const Product = require('../models/Product');
const Supplier = require('../models/User');

class IndexingService {
  constructor() {
    this.batchSize = 100;
    this.productIndex = 'foodxchange_products';
    this.supplierIndex = 'foodxchange_suppliers';
  }

  // Transform MongoDB product to Elasticsearch document
  transformProduct(product) {
    return {
      id: product._id.toString(),
      name: product.name,
      description: product.description,
      category: product.category,
      subcategory: product.subcategory,
      brand: product.brand,
      
      specifications: {
        grade: product.specifications?.grade,
        origin: product.specifications?.origin,
        packaging: product.specifications?.packaging,
        weight: product.specifications?.weight,
        shelfLife: product.specifications?.shelfLife,
        minimumOrder: product.specifications?.minimumOrder,
        storageConditions: product.specifications?.storageConditions
      },
      
      certifications: product.certifications || [],
      allergens: product.allergens || [],
      ingredients: product.ingredients,
      
      nutritionalInfo: product.nutritionalInfo,
      
      supplier: {
        id: product.supplier._id?.toString(),
        name: product.supplier.firstName + ' ' + product.supplier.lastName,
        companyName: product.supplier.companyName,
        country: product.supplier.address?.country,
        region: product.supplier.address?.region,
        verified: product.supplier.isVerified || false,
        rating: product.supplier.rating || 0,
        responseTime: product.supplier.averageResponseTime || null,
        certifications: product.supplier.certifications || []
      },
      
      pricing: {
        currency: product.pricing?.currency || 'USD',
        basePrice: product.pricing?.basePrice,
        minPrice: product.pricing?.minPrice,
        maxPrice: product.pricing?.maxPrice,
        pricePerUnit: product.pricing?.pricePerUnit,
        priceUnit: product.pricing?.priceUnit,
        bulkDiscounts: product.pricing?.bulkDiscounts || false,
        paymentTerms: product.pricing?.paymentTerms,
        incoterms: product.pricing?.incoterms
      },
      
      availability: {
        inStock: product.availability?.inStock !== false,
        stockLevel: product.availability?.stockLevel,
        leadTime: product.availability?.leadTime,
        leadTimeUnit: product.availability?.leadTimeUnit || 'days',
        seasonality: product.availability?.seasonality,
        harvestSeason: product.availability?.harvestSeason,
        availableFrom: product.availability?.availableFrom,
        availableUntil: product.availability?.availableUntil
      },
      
      location: product.location ? {
        lat: product.location.coordinates[1],
        lon: product.location.coordinates[0]
      } : null,
      
      shippingOrigins: product.shippingOrigins?.map(origin => ({
        country: origin.country,
        port: origin.port,
        location: origin.location ? {
          lat: origin.location.coordinates[1],
          lon: origin.location.coordinates[0]
        } : null
      })) || [],
      
      images: product.images || [],
      documents: product.documents || [],
      tags: product.tags || [],
      
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      viewCount: product.viewCount || 0,
      inquiryCount: product.inquiryCount || 0,
      popularity: this.calculatePopularity(product),
      trending: this.isTrending(product)
    };
  }

  // Calculate popularity score
  calculatePopularity(product) {
    const viewWeight = 0.3;
    const inquiryWeight = 0.4;
    const recencyWeight = 0.2;
    const ratingWeight = 0.1;
    
    const views = product.viewCount || 0;
    const inquiries = product.inquiryCount || 0;
    const daysSinceCreated = Math.max(1, 
      (Date.now() - new Date(product.createdAt)) / (1000 * 60 * 60 * 24)
    );
    const recencyScore = Math.max(0, 100 - daysSinceCreated);
    const rating = product.rating || 0;
    
    return (
      (views * viewWeight) +
      (inquiries * inquiryWeight * 10) +
      (recencyScore * recencyWeight) +
      (rating * ratingWeight * 20)
    );
  }

  // Check if product is trending
  isTrending(product) {
    const recentViews = product.recentViews || 0;
    const recentInquiries = product.recentInquiries || 0;
    
    return recentViews > 50 || recentInquiries > 5;
  }

  // Index single product
  async indexProduct(productId) {
    try {
      const product = await Product.findById(productId)
        .populate('supplier', 'firstName lastName companyName address isVerified rating averageResponseTime certifications')
        .lean();
      
      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }

      const esDoc = this.transformProduct(product);
      
      await esClient.index({
        index: this.productIndex,
        id: productId,
        body: esDoc
      });
      
      console.log(`✅ Indexed product: ${product.name}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to index product ${productId}:`, error.message);
      return false;
    }
  }

  // Bulk index products
  async bulkIndexProducts(limit = null) {
    console.log('🚀 Starting bulk product indexing...');
    
    let skip = 0;
    let totalIndexed = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const query = Product.find()
          .populate('supplier', 'firstName lastName companyName address isVerified rating averageResponseTime certifications')
          .skip(skip)
          .limit(this.batchSize)
          .lean();

        if (limit && skip >= limit) {
          break;
        }

        const products = await query;
        
        if (products.length === 0) {
          hasMore = false;
          break;
        }

        // Prepare bulk operations
        const body = products.flatMap(product => [
          { 
            index: { 
              _index: this.productIndex, 
              _id: product._id.toString() 
            } 
          },
          this.transformProduct(product)
        ]);

        // Execute bulk index
        const response = await esClient.bulk({ body });
        
        if (response.errors) {
          console.error('❌ Bulk indexing errors:', response.items.filter(item => item.index.error));
        }

        totalIndexed += products.length;
        skip += this.batchSize;
        
        console.log(`📊 Indexed ${totalIndexed} products...`);
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error('❌ Bulk indexing batch failed:', error.message);
        break;
      }
    }

    console.log(`✅ Bulk indexing complete! Total products indexed: ${totalIndexed}`);
    return totalIndexed;
  }

  // Reindex all data
  async reindexAll() {
    console.log('🔄 Starting full reindex...');
    
    try {
      // Delete existing index
      const exists = await esClient.indices.exists({ index: this.productIndex });
      if (exists) {
        await esClient.indices.delete({ index: this.productIndex });
        console.log('🗑️ Deleted existing index');
      }
      
      // Recreate index
      const { createIndices } = require('../config/elasticsearch');
      await createIndices();
      
      // Bulk index all products
      const totalIndexed = await this.bulkIndexProducts();
      
      console.log(`🎉 Reindex complete! ${totalIndexed} products indexed`);
      return totalIndexed;
      
    } catch (error) {
      console.error('❌ Full reindex failed:', error.message);
      throw error;
    }
  }

  // Update single product
  async updateProduct(productId, updates) {
    try {
      await esClient.update({
        index: this.productIndex,
        id: productId,
        body: {
          doc: updates,
          doc_as_upsert: true
        }
      });
      
      console.log(`✅ Updated product: ${productId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to update product ${productId}:`, error.message);
      return false;
    }
  }

  // Delete product from index
  async deleteProduct(productId) {
    try {
      await esClient.delete({
        index: this.productIndex,
        id: productId
      });
      
      console.log(`🗑️ Deleted product: ${productId}`);
      return true;
    } catch (error) {
      if (error.meta?.statusCode === 404) {
        console.log(`ℹ️ Product ${productId} not found in index`);
        return true;
      }
      console.error(`❌ Failed to delete product ${productId}:`, error.message);
      return false;
    }
  }

  // Get indexing statistics
  async getIndexStats() {
    try {
      const stats = await esClient.indices.stats({ index: this.productIndex });
      const count = await esClient.count({ index: this.productIndex });
      
      return {
        totalProducts: count.count,
        indexSize: stats.indices[this.productIndex]?.total?.store?.size_in_bytes || 0,
        documentsCount: stats.indices[this.productIndex]?.total?.docs?.count || 0,
        deletedDocs: stats.indices[this.productIndex]?.total?.docs?.deleted || 0
      };
    } catch (error) {
      console.error('❌ Failed to get index stats:', error.message);
      return null;
    }
  }
}

module.exports = new IndexingService();