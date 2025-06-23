const mongoose = require('mongoose');

const buyerContactSchema = new mongoose.Schema({
  buyerContactName: {
    type: String,
    required: true
  },
  fullName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  buyerCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  jobPosition: String,
  phone: String,
  mobile: String,
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

buyerContactSchema.index({ buyerCompany: 1, email: 1 });

module.exports = mongoose.model('BuyerContact', buyerContactSchema);
