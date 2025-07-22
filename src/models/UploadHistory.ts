import mongoose, { Document, Schema } from 'mongoose';

export interface IUploadHistory extends Document {
  userId: mongoose.Types.ObjectId;
  fileName: string;
  fileType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  errors?: string[];
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const uploadHistorySchema = new Schema<IUploadHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    fileName: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      required: true,
      enum: ['products', 'users', 'companies', 'orders', 'proposals', 'samples']
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    totalRecords: {
      type: Number,
      default: 0
    },
    processedRecords: {
      type: Number,
      default: 0
    },
    failedRecords: {
      type: Number,
      default: 0
    },
    errors: {
      type: [String],
      default: []
    },
    completedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

uploadHistorySchema.index({ createdAt: -1 });
uploadHistorySchema.index({ status: 1 });

export const UploadHistory = mongoose.model<IUploadHistory>('UploadHistory', uploadHistorySchema);