const mongoose = require('mongoose');

const certificationSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['FDA', 'HACCP', 'ISO22000', 'Organic', 'Kosher', 'Halal', 'Fair_Trade', 'Non_GMO', 'GMP', 'Other'],
    required: true
  },
  certificationNumber: String,
  issuingBody: { type: String, required: true },
  issueDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  documents: [{
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'expired'],
    default: 'pending'
  },
  verificationDetails: {
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    notes: String
  },
  scope: {
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    categories: [String],
    facilities: [String]
  },
  alerts: [{
    type: {
      type: String,
      enum: ['expiry_warning', 'document_missing', 'verification_required']
    },
    message: String,
    createdAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false }
  }],
  auditTrail: [{
    action: String,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    details: String
  }]
});

const complianceScoreSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  overallScore: { type: Number, min: 0, max: 100, default: 0 },
  components: {
    certifications: { score: Number, weight: Number },
    documentCompleteness: { score: Number, weight: Number },
    auditResults: { score: Number, weight: Number },
    incidentHistory: { score: Number, weight: Number },
    responseTime: { score: Number, weight: Number }
  },
  certificationsSummary: {
    total: Number,
    active: Number,
    expired: Number,
    pending: Number
  },
  lastAudit: {
    date: Date,
    score: Number,
    findings: [String]
  },
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  lastUpdated: { type: Date, default: Date.now }
});

const Certification = mongoose.model('Certification', certificationSchema);
const ComplianceScore = mongoose.model('ComplianceScore', complianceScoreSchema);

module.exports = { Certification, ComplianceScore };
