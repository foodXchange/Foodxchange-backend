import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkflowStep {
  id: string;
  name: string;
  type: 'approval' | 'action' | 'condition' | 'notification' | 'parallel' | 'wait';
  description?: string;
  assignee?: {
    type: 'user' | 'role' | 'group' | 'dynamic';
    value: string | string[];
  };
  approvers?: Array<{
    id: string;
    type: 'user' | 'role' | 'group';
    required?: boolean;
    order?: number;
  }>;
  conditions?: {
    type: 'all' | 'any' | 'custom';
    rules: Array<{
      field: string;
      operator: 'equals' | 'notEquals' | 'greater' | 'less' | 'contains' | 'in' | 'notIn';
      value: any;
    }>;
  };
  actions?: Array<{
    type: 'webhook' | 'email' | 'function' | 'update' | 'create';
    config: Record<string, any>;
  }>;
  timeout?: {
    duration: number; // in milliseconds
    action: 'escalate' | 'auto-approve' | 'auto-reject' | 'notify';
    target?: string;
  };
  nextSteps?: {
    approved?: string;
    rejected?: string;
    default?: string;
    conditional?: Array<{
      condition: (context: any) => boolean;
      stepId: string;
    }>;
  };
  metadata?: Record<string, any>;
}

export interface IWorkflowDefinition extends Document {
  name: string;
  description?: string;
  version: string;
  category: string;
  trigger: {
    type: 'manual' | 'event' | 'schedule' | 'webhook';
    config: Record<string, any>;
  };
  steps: IWorkflowStep[];
  variables?: Record<string, any>;
  permissions?: {
    view: string[];
    edit: string[];
    execute: string[];
  };
  settings?: {
    allowParallelExecution?: boolean;
    maxExecutionTime?: number;
    retryPolicy?: {
      maxRetries: number;
      retryDelay: number;
      retryOn: string[];
    };
    notifications?: {
      onStart?: boolean;
      onComplete?: boolean;
      onError?: boolean;
      channels: string[];
    };
  };
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  isActive: boolean;
  tags?: string[];
  company?: mongoose.Types.ObjectId;
}

export interface IWorkflowInstance extends Document {
  definitionId: mongoose.Types.ObjectId;
  definitionVersion: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'suspended';
  currentStep?: string;
  context: {
    variables: Record<string, any>;
    input: Record<string, any>;
    output: Record<string, any>;
    entity: {
      type: string;
      id: string;
      data?: Record<string, any>;
    };
    approvals: Record<string, {
      stepId: string;
      approverId: string;
      decision: string;
      comment?: string;
      timestamp: Date;
      attachments?: string[];
    }>;
  };
  history: Array<{
    timestamp: Date;
    stepId: string;
    action: string;
    actor?: string;
    decision?: string;
    comment?: string;
    data?: Record<string, any>;
    duration?: number;
  }>;
  startedBy: mongoose.Types.ObjectId;
  startedAt: Date;
  completedAt?: Date;
  error?: {
    message: string;
    stack?: string;
    stepId?: string;
    timestamp: Date;
  };
  metadata?: Record<string, any>;
  company?: mongoose.Types.ObjectId;
}

export interface IWorkflowTemplate extends Document {
  name: string;
  description: string;
  category: string;
  definition: Partial<IWorkflowDefinition>;
  tags: string[];
  industry?: string;
  previewImage?: string;
  popularity: number;
  isPublic: boolean;
  createdBy: mongoose.Types.ObjectId;
  company?: mongoose.Types.ObjectId;
}

// Workflow Step Schema
const WorkflowStepSchema = new Schema<IWorkflowStep>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['approval', 'action', 'condition', 'notification', 'parallel', 'wait'],
    required: true
  },
  description: String,
  assignee: {
    type: {
      type: String,
      enum: ['user', 'role', 'group', 'dynamic']
    },
    value: Schema.Types.Mixed
  },
  approvers: [{
    id: String,
    type: {
      type: String,
      enum: ['user', 'role', 'group']
    },
    required: Boolean,
    order: Number
  }],
  conditions: {
    type: {
      type: String,
      enum: ['all', 'any', 'custom']
    },
    rules: [{
      field: String,
      operator: String,
      value: Schema.Types.Mixed
    }]
  },
  actions: [{
    type: String,
    config: Schema.Types.Mixed
  }],
  timeout: {
    duration: Number,
    action: String,
    target: String
  },
  nextSteps: {
    approved: String,
    rejected: String,
    default: String,
    conditional: [{
      condition: String,
      stepId: String
    }]
  },
  metadata: Schema.Types.Mixed
}, { _id: false });

// Workflow Definition Schema
const WorkflowDefinitionSchema = new Schema<IWorkflowDefinition>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  version: {
    type: String,
    required: true,
    default: '1.0.0'
  },
  category: {
    type: String,
    required: true,
    enum: ['procurement', 'sales', 'finance', 'hr', 'compliance', 'vendor-management', 'quality', 'custom']
  },
  trigger: {
    type: {
      type: String,
      enum: ['manual', 'event', 'schedule', 'webhook'],
      required: true
    },
    config: Schema.Types.Mixed
  },
  steps: {
    type: [WorkflowStepSchema],
    required: true,
    validate: {
      validator(steps: IWorkflowStep[]) {
        return steps.length > 0;
      },
      message: 'Workflow must have at least one step'
    }
  },
  variables: Schema.Types.Mixed,
  permissions: {
    view: [String],
    edit: [String],
    execute: [String]
  },
  settings: {
    allowParallelExecution: {
      type: Boolean,
      default: false
    },
    maxExecutionTime: Number,
    retryPolicy: {
      maxRetries: Number,
      retryDelay: Number,
      retryOn: [String]
    },
    notifications: {
      onStart: Boolean,
      onComplete: Boolean,
      onError: Boolean,
      channels: [String]
    }
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tags: [String],
  company: {
    type: Schema.Types.ObjectId,
    ref: 'Company'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
WorkflowDefinitionSchema.index({ name: 1, version: 1, company: 1 }, { unique: true });
WorkflowDefinitionSchema.index({ category: 1 });
WorkflowDefinitionSchema.index({ isActive: 1 });
WorkflowDefinitionSchema.index({ tags: 1 });
WorkflowDefinitionSchema.index({ createdBy: 1 });
WorkflowDefinitionSchema.index({ company: 1 });

// Workflow Instance Schema
const WorkflowInstanceSchema = new Schema<IWorkflowInstance>({
  definitionId: {
    type: Schema.Types.ObjectId,
    ref: 'WorkflowDefinition',
    required: true
  },
  definitionVersion: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'suspended'],
    default: 'pending',
    required: true
  },
  currentStep: String,
  context: {
    variables: Schema.Types.Mixed,
    input: Schema.Types.Mixed,
    output: Schema.Types.Mixed,
    entity: {
      type: String,
      id: String,
      data: Schema.Types.Mixed
    },
    approvals: Schema.Types.Mixed
  },
  history: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    stepId: String,
    action: String,
    actor: String,
    decision: String,
    comment: String,
    data: Schema.Types.Mixed,
    duration: Number
  }],
  startedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  completedAt: Date,
  error: {
    message: String,
    stack: String,
    stepId: String,
    timestamp: Date
  },
  metadata: Schema.Types.Mixed,
  company: {
    type: Schema.Types.ObjectId,
    ref: 'Company'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
WorkflowInstanceSchema.index({ definitionId: 1 });
WorkflowInstanceSchema.index({ status: 1 });
WorkflowInstanceSchema.index({ startedBy: 1 });
WorkflowInstanceSchema.index({ startedAt: -1 });
WorkflowInstanceSchema.index({ 'context.entity.type': 1, 'context.entity.id': 1 });
WorkflowInstanceSchema.index({ company: 1 });

// Compound indexes for common queries
WorkflowInstanceSchema.index({ definitionId: 1, status: 1 });
WorkflowInstanceSchema.index({ startedBy: 1, status: 1 });

// Workflow Template Schema
const WorkflowTemplateSchema = new Schema<IWorkflowTemplate>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  category: {
    type: String,
    required: true,
    enum: ['procurement', 'sales', 'finance', 'hr', 'compliance', 'vendor-management', 'quality', 'custom']
  },
  definition: Schema.Types.Mixed,
  tags: {
    type: [String],
    required: true
  },
  industry: String,
  previewImage: String,
  popularity: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: Schema.Types.ObjectId,
    ref: 'Company'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
WorkflowTemplateSchema.index({ category: 1 });
WorkflowTemplateSchema.index({ tags: 1 });
WorkflowTemplateSchema.index({ isPublic: 1 });
WorkflowTemplateSchema.index({ popularity: -1 });
WorkflowTemplateSchema.index({ industry: 1 });

// Virtual properties
WorkflowDefinitionSchema.virtual('instanceCount', {
  ref: 'WorkflowInstance',
  localField: '_id',
  foreignField: 'definitionId',
  count: true
});

WorkflowInstanceSchema.virtual('duration').get(function() {
  if (this.completedAt && this.startedAt) {
    return this.completedAt.getTime() - this.startedAt.getTime();
  }
  return null;
});

// Pre-save middleware
WorkflowDefinitionSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.updatedBy || this.createdBy;
  }
  next();
});

// Methods
WorkflowInstanceSchema.methods.addHistoryEntry = function(entry: any) {
  this.history.push({
    timestamp: new Date(),
    ...entry
  });
  return this.save();
};

WorkflowInstanceSchema.methods.updateStatus = function(status: string) {
  this.status = status;
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    this.completedAt = new Date();
  }
  return this.save();
};

WorkflowInstanceSchema.methods.setError = function(error: any, stepId?: string) {
  this.error = {
    message: error.message || error,
    stack: error.stack,
    stepId,
    timestamp: new Date()
  };
  this.status = 'failed';
  this.completedAt = new Date();
  return this.save();
};

// Models
export const WorkflowDefinition = mongoose.model<IWorkflowDefinition>('WorkflowDefinition', WorkflowDefinitionSchema);
export const WorkflowInstance = mongoose.model<IWorkflowInstance>('WorkflowInstance', WorkflowInstanceSchema);
export const WorkflowTemplate = mongoose.model<IWorkflowTemplate>('WorkflowTemplate', WorkflowTemplateSchema);
