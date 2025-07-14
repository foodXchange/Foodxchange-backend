const Product = require('../models/seller/Product');
const Seller = require('../models/seller/Seller');
const csv = require('csv-parser');
const fs = require('fs');

class ProductController {
  // Get all products for a seller
  async getSellerProducts(req, res) {
    try {
      const sellerId = req.seller.sellerId;
      const { status, category, search, page = 1, limit = 20 } = req.query;
      
      const query = { supplier: sellerId };
      
      // Add filters
      if (status) query.status = status;
      if (category) query.category = category;
      if (search) {
        query.$or = [
          { productName: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { productId: { $regex: search, $options: 'i' } }
        ];
      }
      
      const products = await Product.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
        
      const totalProducts = await Product.countDocuments(query);
      
      res.json({
        success: true,
        products,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalProducts / limit),
          totalProducts,
          hasMore: page * limit < totalProducts
        }
      });
      
    } catch (error) {
      console.error('Get products error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch products',
        error: error.message
      });
    }
  }
  
  // Create new product
  async createProduct(req, res) {
    try {
      const sellerId = req.seller.sellerId;
      const productData = req.body;
      
      // Get seller info
      const seller = await Seller.findById(sellerId);
      if (!seller) {
        return res.status(404).json({
          success: false,
          message: 'Seller not found'
        });
      }
      
      // Generate product ID
      const productCount = await Product.countDocuments();
      const productId = `PROD-${(productCount + 1).toString().padStart(6, '0')}`;
      
      // Create product
      const newProduct = new Product({
        ...productData,
        productId,
        supplier: sellerId,
        supplierName: seller.companyName,
        supplierCountry: seller.country,
        status: 'pending', // Requires admin approval
        createdBy: req.seller.email
      });
      
      // Handle image uploads
      if (req.files && req.files.length > 0) {
        newProduct.images = req.files.map((file, index) => ({
          url: file.path,
          type: 'product',
          isPrimary: index === 0
        }));
      }
      
      await newProduct.save();
      
      // Add to seller's products
      seller.products.push(newProduct._id);
      seller.metrics.totalProducts = seller.products.length;
      await seller.save();
      
      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        product: newProduct
      });
      
    } catch (error) {
      console.error('Create product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create product',
        error: error.message
      });
    }
  }
  
  // Get single product
  async getProduct(req, res) {
    try {
      const { id } = req.params;
      const sellerId = req.seller.sellerId;
      
      const product = await Product.findOne({
        _id: id,
        supplier: sellerId
      });
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
      
      res.json({
        success: true,
        product
      });
      
    } catch (error) {
      console.error('Get product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch product',
        error: error.message
      });
    }
  }
  
  // Update product
  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const sellerId = req.seller.sellerId;
      const updates = req.body;
      
      // Remove fields that shouldn't be updated
      delete updates._id;
      delete updates.supplier;
      delete updates.productId;
      
      const product = await Product.findOneAndUpdate(
        { _id: id, supplier: sellerId },
        { 
          ...updates,
          lastUpdatedBy: req.seller.email,
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      );
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Product updated successfully',
        product
      });
      
    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update product',
        error: error.message
      });
    }
  }
  
  // Delete product
  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      const sellerId = req.seller.sellerId;
      
      const product = await Product.findOneAndUpdate(
        { _id: id, supplier: sellerId },
        { status: 'discontinued' },
        { new: true }
      );
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
      
      // Update seller's product count
      const seller = await Seller.findById(sellerId);
      seller.metrics.totalProducts = await Product.countDocuments({
        supplier: sellerId,
        status: { $ne: 'discontinued' }
      });
      await seller.save();
      
      res.json({
        success: true,
        message: 'Product discontinued successfully'
      });
      
    } catch (error) {
      console.error('Delete product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete product',
        error: error.message
      });
    }
  }
  
  // Bulk import products
  async bulkImport(req, res) {
    try {
      const sellerId = req.seller.sellerId;
      const filePath = req.file.path;
      
      const seller = await Seller.findById(sellerId);
      if (!seller) {
        return res.status(404).json({
          success: false,
          message: 'Seller not found'
        });
      }
      
      const products = [];
      const errors = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          products.push(row);
        })
        .on('end', async () => {
          let imported = 0;
          
          for (const productData of products) {
            try {
              const product = new Product({
                productId: productData.productId || `PROD-${Date.now()}-${imported}`,
                productName: productData.productName || productData.name,
                supplier: sellerId,
                supplierName: seller.companyName,
                supplierCountry: seller.country,
                category: productData.category,
                description: productData.description,
                unitOfMeasure: productData.unitOfMeasure || 'unit',
                pricing: {
                  unitPrice: parseFloat(productData.unitPrice) || 0,
                  currency: productData.currency || 'USD'
                },
                status: 'pending',
                importedFrom: 'csv_bulk_import',
                createdBy: req.seller.email
              });
              
              await product.save();
              imported++;
              
            } catch (error) {
              errors.push({
                row: products.indexOf(productData) + 1,
                product: productData.productName,
                error: error.message
              });
            }
          }
          
          // Update seller metrics
          seller.metrics.totalProducts = await Product.countDocuments({
            supplier: sellerId
          });
          await seller.save();
          
          // Clean up uploaded file
          fs.unlinkSync(filePath);
          
          res.json({
            success: true,
            message: `Imported ${imported} products`,
            imported,
            failed: errors.length,
            errors: errors.slice(0, 10) // Show first 10 errors
          });
        });
        
    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to import products',
        error: error.message
      });
    }
  }
}

module.exports = new ProductController();
