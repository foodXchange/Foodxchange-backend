const mongoose = require('mongoose');

// Create a schema with strict: false to allow any fields
const productSchema = new mongoose.Schema({
  // Core required fields
  name: { type: String, required: true },
  
  // Optional structured fields
  description: String,
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  price: Number,
  unit: String,
  minOrderQuantity: Number,
  availability: { type: Boolean, default: true },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { 
  strict: false,  // This allows any additional fields from CSV/Excel
  timestamps: true 
});

// Index for searching
productSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Product', productSchema);
