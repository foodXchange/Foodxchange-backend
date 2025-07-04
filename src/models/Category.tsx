const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    trim: true,
    maxlength: 100
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  parent: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category' 
  },
  image: {
    url: String,
    alt: String
  },
  attributes: [{
    name: {
      type: String,
      required: true
    },
    type: { 
      type: String, 
      enum: ['text', 'number', 'boolean', 'select', 'multiselect'],
      required: true
    },
    options: [String], // for select/multiselect types
    required: {
      type: Boolean,
      default: false
    },
    unit: String, // for number types (kg, lbs, etc.)
    validation: {
      min: Number,
      max: Number,
      pattern: String
    }
  }],
  isActive: { 
    type: Boolean, 
    default: true 
  },
  sortOrder: { 
    type: Number, 
    default: 0 
  },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String]
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full category path
categorySchema.virtual('fullPath').get(function() {
  // This would need to be populated to work properly
  return this.parent ? `${this.parent.name} > ${this.name}` : this.name;
});

// Pre-save middleware to generate slug
categorySchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

// Index for efficient queries
categorySchema.index({ slug: 1 });
categorySchema.index({ parent: 1, isActive: 1 });
categorySchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Category', categorySchema);
