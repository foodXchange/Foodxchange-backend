import { Schema, model } from 'mongoose';
import { IWorkspaceDocument } from '../interfaces/expert.interface';

const permissionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  canView: { type: Boolean, default: true },
  canEdit: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false }
}, { _id: false });

const accessLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  accessedAt: { type: Date, default: Date.now }
}, { _id: false });

const workspaceDocumentSchema = new Schema<IWorkspaceDocument>({
  collaborationId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertCollaboration',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  version: {
    type: Number,
    default: 1,
    min: 1
  },
  parentId: {
    type: Schema.Types.ObjectId,
    ref: 'WorkspaceDocument'
  },
  tags: {
    type: [String],
    index: true
  },
  permissions: [permissionSchema],
  lastAccessedBy: [accessLogSchema],
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
workspaceDocumentSchema.index({ name: 'text', description: 'text', tags: 'text' });
workspaceDocumentSchema.index({ uploadedBy: 1, createdAt: -1 });
workspaceDocumentSchema.index({ fileType: 1 });
workspaceDocumentSchema.index({ version: -1 });
workspaceDocumentSchema.index({ parentId: 1 });

// Virtual for file extension
workspaceDocumentSchema.virtual('fileExtension').get(function() {
  const parts = this.name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
});

// Virtual for is latest version
workspaceDocumentSchema.virtual('isLatestVersion').get(function() {
  // This would need to be calculated based on other documents with same parentId
  return true; // Placeholder
});

// Virtual for human-readable file size
workspaceDocumentSchema.virtual('humanFileSize').get(function() {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (this.fileSize === 0) return '0 Bytes';
  const i = Math.floor(Math.log(this.fileSize) / Math.log(1024));
  return Math.round(this.fileSize / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Pre-save middleware
workspaceDocumentSchema.pre('save', function(next) {
  // If document is being deleted, set deletion info
  if (this.isModified('isDeleted') && this.isDeleted && !this.deletedAt) {
    this.deletedAt = new Date();
  }

  // Limit last accessed by array to last 10 entries
  if (this.lastAccessedBy.length > 10) {
    this.lastAccessedBy = this.lastAccessedBy.slice(-10);
  }

  next();
});

// Method to check user permission
workspaceDocumentSchema.methods.checkPermission = function(userId: string, action: 'view' | 'edit' | 'delete'): boolean {
  const permission = this.permissions.find(p => p.userId.toString() === userId);
  if (!permission) return false;

  switch (action) {
    case 'view':
      return permission.canView;
    case 'edit':
      return permission.canEdit;
    case 'delete':
      return permission.canDelete;
    default:
      return false;
  }
};

// Method to update permissions
workspaceDocumentSchema.methods.updatePermissions = async function(
  userId: string, 
  permissions: { canView?: boolean; canEdit?: boolean; canDelete?: boolean }
) {
  const existingPermission = this.permissions.find(p => p.userId.toString() === userId);
  
  if (existingPermission) {
    Object.assign(existingPermission, permissions);
  } else {
    this.permissions.push({
      userId,
      canView: permissions.canView ?? true,
      canEdit: permissions.canEdit ?? false,
      canDelete: permissions.canDelete ?? false
    });
  }
  
  await this.save();
};

// Method to log access
workspaceDocumentSchema.methods.logAccess = async function(userId: string) {
  // Check if user already accessed recently (within last hour)
  const lastAccess = this.lastAccessedBy.find(a => 
    a.userId.toString() === userId && 
    a.accessedAt > new Date(Date.now() - 3600000)
  );

  if (!lastAccess) {
    this.lastAccessedBy.push({
      userId,
      accessedAt: new Date()
    });
    await this.save();
  }
};

// Method to soft delete
workspaceDocumentSchema.methods.softDelete = async function(deletedBy: string) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  await this.save();
};

// Method to create new version
workspaceDocumentSchema.methods.createNewVersion = async function(
  newFileUrl: string,
  uploadedBy: string
) {
  const newVersion = new this.constructor({
    collaborationId: this.collaborationId,
    name: this.name,
    description: this.description,
    fileUrl: newFileUrl,
    fileType: this.fileType,
    fileSize: this.fileSize,
    uploadedBy,
    version: this.version + 1,
    parentId: this.parentId || this._id,
    tags: this.tags,
    permissions: this.permissions
  });

  return newVersion.save();
};

// Static method to get document history
workspaceDocumentSchema.statics.getDocumentHistory = async function(documentId: string) {
  const document = await this.findById(documentId);
  if (!document) return [];

  const parentId = document.parentId || document._id;
  
  return this.find({
    $or: [
      { _id: parentId },
      { parentId: parentId }
    ],
    isDeleted: false
  }).sort({ version: -1 });
};

export const WorkspaceDocument = model<IWorkspaceDocument>('WorkspaceDocument', workspaceDocumentSchema);