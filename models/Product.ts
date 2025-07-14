import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  description?: string;
  category: string;
  price: number;
  unit: string;
  supplierId: mongoose.Types.ObjectId;
  specifications?: Map<string, any>;
  certifications?: string[];
  images?: string[];
  status: 'active' | 'inactive' | 'pending';
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true
  },
  supplierId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  specifications: {
    type: Map,
    of: Schema.Types.Mixed
  },
  certifications: [{
    type: String
  }],
  images: [{
    type: String
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'active'
  }
}, {
  timestamps: true
});

const Product: Model<IProduct> = mongoose.model<IProduct>('Product', productSchema);

export default Product;