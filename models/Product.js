const mongoose = require('mongoose');

// Check if model already exists to prevent overwrite error
let Product;

try {
  // Try to get existing model
  Product = mongoose.model('Product');
} catch (error) {
  // Model doesn't exist, create it
  const productSchema = new mongoose.Schema({
    // Core required fields
    name: { type: String, required: true },
    
    // Optional structured fields
    description: String,
    category: String,
    supplier: String,
    price: Number,
    unit: String,
    minOrderQuantity: Number,
    availability: { type: Boolean, default: true },
    
    // Additional dynamic fields (any CSV columns will be stored here)
    // Using strict: false allows any additional fields
    
    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }, { 
    strict: false,  // This allows any additional fields from CSV/Excel
    timestamps: true 
  });
  
  // Index for searching
  productSchema.index({ name: 'text', description: 'text' });
  
  Product = mongoose.model('Product', productSchema);
}

module.exports = Product;
