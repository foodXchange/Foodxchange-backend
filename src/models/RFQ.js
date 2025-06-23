const mongoose = require("mongoose");

const rfqSchema = new mongoose.Schema({
  requestId: {
    type: String,
    unique: true
  },
  requestName: {
    type: String,
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  },
  status: {
    type: String,
    enum: ["draft", "active", "sourcing", "closed"],
    default: "draft"
  },
  brief: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  products: [{
    name: String,
    quantity: Number,
    unit: String,
    packaging: String,
    specifications: String,
    benchmarkImage: String
  }],
  requirements: {
    kosher: { type: Boolean, default: false },
    kosherType: String,
    passoverKosher: { type: Boolean, default: false },
    organic: { type: Boolean, default: false },
    glutenFree: { type: Boolean, default: false },
    halal: { type: Boolean, default: false },
    packaging: String,
    branding: String,
    privateLabel: { type: Boolean, default: false }
  },
  targetPrice: {
    min: Number,
    max: Number,
    currency: String
  },
  deliveryRequirements: {
    date: Date,
    location: String,
    incoterms: String
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  proposals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Proposal"
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-generate request ID
rfqSchema.pre("save", async function(next) {
  if (!this.requestId) {
    const count = await this.constructor.countDocuments();
    this.requestId = `RFQ${new Date().getFullYear()}${String(count + 1).padStart(5, "0")}`;
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("RFQ", rfqSchema);
