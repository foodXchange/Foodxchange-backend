import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { redisClient } from '../utils/redis';
import { azureStorageService } from './AzureStorageService';
import { productionLogger } from '../utils/productionLogger';

export interface CollaborativeDocument {
  id: string;
  title: string;
  description?: string;
  type: 'document' | 'spreadsheet' | 'presentation' | 'diagram' | 'code';
  format: string; // file extension
  size: number;
  storageUrl: string;
  thumbnailUrl?: string;
  projectId?: string;
  rfqId?: string;
  owner: {
    userId: string;
    role: 'expert' | 'client' | 'agent';
  };
  collaborators: Collaborator[];
  permissions: DocumentPermissions;
  version: number;
  versions: DocumentVersion[];
  comments: DocumentComment[];
  status: 'draft' | 'active' | 'review' | 'approved' | 'archived';
  locks: DocumentLock[];
  tags: string[];
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastAccessedAt: Date;
    lastModifiedBy: string;
    checksum: string;
  };
}

export interface Collaborator {
  userId: string;
  role: 'owner' | 'editor' | 'reviewer' | 'viewer';
  permissions: {
    canEdit: boolean;
    canComment: boolean;
    canShare: boolean;
    canDelete: boolean;
    canApprove: boolean;
  };
  addedAt: Date;
  lastAccess?: Date;
  isActive: boolean;
}

export interface DocumentPermissions {
  isPublic: boolean;
  requiresApproval: boolean;
  allowDownload: boolean;
  allowPrint: boolean;
  allowCopy: boolean;
  expiresAt?: Date;
  watermark?: boolean;
  passwordProtected?: boolean;
}

export interface DocumentVersion {
  versionNumber: number;
  createdAt: Date;
  createdBy: string;
  size: number;
  storageUrl: string;
  changes: string;
  checksum: string;
}

export interface DocumentComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: Date;
  parentId?: string; // for threaded comments
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  mentions: string[];
  attachments?: Array<{
    filename: string;
    url: string;
  }>;
  position?: {
    page?: number;
    x?: number;
    y?: number;
    selection?: string;
  };
}

export interface DocumentLock {
  userId: string;
  section?: string; // specific section/page being edited
  lockedAt: Date;
  expiresAt: Date;
}

export interface DocumentChange {
  documentId: string;
  userId: string;
  timestamp: Date;
  operation: 'create' | 'update' | 'delete' | 'move' | 'format';
  path: string; // JSON path to the change
  previousValue?: any;
  newValue?: any;
  metadata?: any;
}

export interface ShareableLink {
  id: string;
  documentId: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  accessCount: number;
  maxAccessCount?: number;
  permissions: {
    canView: boolean;
    canComment: boolean;
    canEdit: boolean;
  };
  password?: string;
  isActive: boolean;
}

export class DocumentCollaborationService extends EventEmitter {
  private static instance: DocumentCollaborationService;
  private documents: Map<string, CollaborativeDocument> = new Map();
  private activeSessions: Map<string, Set<string>> = new Map(); // documentId -> userIds
  private documentChanges: Map<string, DocumentChange[]> = new Map(); // for real-time sync
  private shareableLinks: Map<string, ShareableLink> = new Map();

  private constructor() {
    super();
    this.initializeService();
  }

  static getInstance(): DocumentCollaborationService {
    if (!DocumentCollaborationService.instance) {
      DocumentCollaborationService.instance = new DocumentCollaborationService();
    }
    return DocumentCollaborationService.instance;
  }

  private async initializeService(): Promise<void> {
    await this.loadDocumentsFromCache();
    productionLogger.info('Document collaboration service initialized');
  }

  private async loadDocumentsFromCache(): Promise<void> {
    try {
      const docKeys = await redisClient.keys('collab:doc:*');
      for (const key of docKeys) {
        const docData = await redisClient.get(key);
        if (docData) {
          const doc = JSON.parse(docData);
          this.documents.set(doc.id, doc);
        }
      }
      productionLogger.info('Loaded collaborative documents from cache', {
        documentCount: this.documents.size
      });
    } catch (error) {
      productionLogger.error('Failed to load documents from cache', { error });
    }
  }

  async createDocument(
    title: string,
    type: CollaborativeDocument['type'],
    format: string,
    ownerId: string,
    ownerRole: 'expert' | 'client' | 'agent',
    content: Buffer,
    metadata?: {
      description?: string;
      projectId?: string;
      rfqId?: string;
      tags?: string[];
    }
  ): Promise<CollaborativeDocument> {
    const documentId = `doc_${uuidv4()}`;
    const timestamp = new Date();
    
    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    
    // Upload to Azure Storage
    const storageUrl = await azureStorageService.uploadDocument(
      documentId,
      content,
      format
    );

    // Generate thumbnail if applicable
    let thumbnailUrl: string | undefined;
    if (['pdf', 'doc', 'docx', 'ppt', 'pptx'].includes(format)) {
      thumbnailUrl = await this.generateThumbnail(documentId, content, format);
    }

    const document: CollaborativeDocument = {
      id: documentId,
      title,
      description: metadata?.description,
      type,
      format,
      size: content.length,
      storageUrl,
      thumbnailUrl,
      projectId: metadata?.projectId,
      rfqId: metadata?.rfqId,
      owner: {
        userId: ownerId,
        role: ownerRole
      },
      collaborators: [{
        userId: ownerId,
        role: 'owner',
        permissions: {
          canEdit: true,
          canComment: true,
          canShare: true,
          canDelete: true,
          canApprove: true
        },
        addedAt: timestamp,
        isActive: true
      }],
      permissions: {
        isPublic: false,
        requiresApproval: false,
        allowDownload: true,
        allowPrint: true,
        allowCopy: true,
        watermark: false,
        passwordProtected: false
      },
      version: 1,
      versions: [{
        versionNumber: 1,
        createdAt: timestamp,
        createdBy: ownerId,
        size: content.length,
        storageUrl,
        changes: 'Initial version',
        checksum
      }],
      comments: [],
      status: 'draft',
      locks: [],
      tags: metadata?.tags || [],
      metadata: {
        createdAt: timestamp,
        updatedAt: timestamp,
        lastAccessedAt: timestamp,
        lastModifiedBy: ownerId,
        checksum
      }
    };

    this.documents.set(documentId, document);
    await this.saveDocumentToCache(document);

    productionLogger.info('Collaborative document created', {
      documentId,
      title,
      type,
      format,
      ownerId
    });

    this.emit('document:created', document);
    return document;
  }

  async updateDocument(
    documentId: string,
    userId: string,
    content: Buffer,
    changes: string
  ): Promise<CollaborativeDocument> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check permissions
    const collaborator = document.collaborators.find(c => c.userId === userId);
    if (!collaborator || !collaborator.permissions.canEdit) {
      throw new Error('No edit permission');
    }

    // Check for locks
    const activeLock = document.locks.find(
      lock => lock.userId !== userId && lock.expiresAt > new Date()
    );
    if (activeLock) {
      throw new Error('Document is locked by another user');
    }

    // Create new version
    const timestamp = new Date();
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    const versionNumber = document.version + 1;
    
    // Upload new version
    const storageUrl = await azureStorageService.uploadDocument(
      `${documentId}_v${versionNumber}`,
      content,
      document.format
    );

    const newVersion: DocumentVersion = {
      versionNumber,
      createdAt: timestamp,
      createdBy: userId,
      size: content.length,
      storageUrl,
      changes,
      checksum
    };

    // Update document
    document.version = versionNumber;
    document.size = content.length;
    document.storageUrl = storageUrl;
    document.versions.push(newVersion);
    document.metadata.updatedAt = timestamp;
    document.metadata.lastModifiedBy = userId;
    document.metadata.checksum = checksum;

    if (document.status === 'approved') {
      document.status = 'review'; // Reset to review after changes
    }

    await this.saveDocumentToCache(document);

    // Notify collaborators
    this.notifyCollaborators(documentId, 'document:updated', {
      userId,
      version: versionNumber,
      changes
    }, userId);

    productionLogger.info('Document updated', {
      documentId,
      userId,
      version: versionNumber
    });

    this.emit('document:updated', document);
    return document;
  }

  async addCollaborator(
    documentId: string,
    requesterId: string,
    newUserId: string,
    role: 'editor' | 'reviewer' | 'viewer'
  ): Promise<void> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check permissions
    const requester = document.collaborators.find(c => c.userId === requesterId);
    if (!requester || !requester.permissions.canShare) {
      throw new Error('No sharing permission');
    }

    // Check if already a collaborator
    if (document.collaborators.some(c => c.userId === newUserId)) {
      throw new Error('User is already a collaborator');
    }

    // Add collaborator
    const permissions = this.getRolePermissions(role);
    document.collaborators.push({
      userId: newUserId,
      role,
      permissions,
      addedAt: new Date(),
      isActive: true
    });

    await this.saveDocumentToCache(document);

    // Notify new collaborator and others
    this.emit('collaborator:added', {
      documentId,
      userId: newUserId,
      role,
      addedBy: requesterId
    });

    this.notifyCollaborators(documentId, 'collaborator:added', {
      userId: newUserId,
      role,
      addedBy: requesterId
    });

    productionLogger.info('Collaborator added', {
      documentId,
      userId: newUserId,
      role,
      addedBy: requesterId
    });
  }

  async removeCollaborator(
    documentId: string,
    requesterId: string,
    removeUserId: string
  ): Promise<void> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check permissions
    const requester = document.collaborators.find(c => c.userId === requesterId);
    if (!requester || (!requester.permissions.canShare && requester.role !== 'owner')) {
      throw new Error('No permission to remove collaborators');
    }

    // Cannot remove owner
    const removeUser = document.collaborators.find(c => c.userId === removeUserId);
    if (!removeUser) {
      throw new Error('User is not a collaborator');
    }
    if (removeUser.role === 'owner') {
      throw new Error('Cannot remove document owner');
    }

    // Remove collaborator
    document.collaborators = document.collaborators.filter(c => c.userId !== removeUserId);
    await this.saveDocumentToCache(document);

    // Remove from active sessions
    const activeSessions = this.activeSessions.get(documentId);
    if (activeSessions) {
      activeSessions.delete(removeUserId);
    }

    this.emit('collaborator:removed', {
      documentId,
      userId: removeUserId,
      removedBy: requesterId
    });

    productionLogger.info('Collaborator removed', {
      documentId,
      userId: removeUserId,
      removedBy: requesterId
    });
  }

  async addComment(
    documentId: string,
    userId: string,
    content: string,
    options?: {
      parentId?: string;
      mentions?: string[];
      position?: DocumentComment['position'];
    }
  ): Promise<DocumentComment> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check permissions
    const collaborator = document.collaborators.find(c => c.userId === userId);
    if (!collaborator || !collaborator.permissions.canComment) {
      throw new Error('No comment permission');
    }

    const comment: DocumentComment = {
      id: `comment_${uuidv4()}`,
      userId,
      userName: userId, // In production, fetch from user service
      content,
      timestamp: new Date(),
      parentId: options?.parentId,
      resolved: false,
      mentions: options?.mentions || [],
      position: options?.position
    };

    document.comments.push(comment);
    await this.saveDocumentToCache(document);

    // Notify mentioned users and collaborators
    const notifyUsers = new Set([
      ...document.collaborators.map(c => c.userId),
      ...(options?.mentions || [])
    ]);
    notifyUsers.delete(userId); // Don't notify self

    this.notifyUsers(Array.from(notifyUsers), 'comment:added', {
      documentId,
      comment,
      addedBy: userId
    });

    productionLogger.info('Comment added', {
      documentId,
      commentId: comment.id,
      userId
    });

    return comment;
  }

  async resolveComment(
    documentId: string,
    commentId: string,
    userId: string
  ): Promise<void> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    const comment = document.comments.find(c => c.id === commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    comment.resolved = true;
    comment.resolvedBy = userId;
    comment.resolvedAt = new Date();

    await this.saveDocumentToCache(document);

    this.notifyCollaborators(documentId, 'comment:resolved', {
      commentId,
      resolvedBy: userId
    });

    productionLogger.info('Comment resolved', {
      documentId,
      commentId,
      resolvedBy: userId
    });
  }

  async lockSection(
    documentId: string,
    userId: string,
    section?: string,
    duration: number = 300000 // 5 minutes default
  ): Promise<DocumentLock> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check if section is already locked
    const existingLock = document.locks.find(
      lock => lock.section === section && lock.expiresAt > new Date()
    );
    if (existingLock && existingLock.userId !== userId) {
      throw new Error('Section is already locked');
    }

    // Create or update lock
    const lock: DocumentLock = {
      userId,
      section,
      lockedAt: new Date(),
      expiresAt: new Date(Date.now() + duration)
    };

    // Remove expired locks and add new one
    document.locks = document.locks.filter(l => l.expiresAt > new Date());
    document.locks.push(lock);

    await this.saveDocumentToCache(document);

    // Notify collaborators
    this.notifyCollaborators(documentId, 'section:locked', {
      userId,
      section,
      expiresAt: lock.expiresAt
    }, userId);

    productionLogger.info('Section locked', {
      documentId,
      userId,
      section
    });

    return lock;
  }

  async unlockSection(
    documentId: string,
    userId: string,
    section?: string
  ): Promise<void> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    document.locks = document.locks.filter(
      lock => !(lock.userId === userId && lock.section === section)
    );

    await this.saveDocumentToCache(document);

    this.notifyCollaborators(documentId, 'section:unlocked', {
      userId,
      section
    }, userId);

    productionLogger.info('Section unlocked', {
      documentId,
      userId,
      section
    });
  }

  async createShareableLink(
    documentId: string,
    userId: string,
    permissions: ShareableLink['permissions'],
    options?: {
      expiresIn?: number; // milliseconds
      maxAccessCount?: number;
      password?: string;
    }
  ): Promise<ShareableLink> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check permissions
    const collaborator = document.collaborators.find(c => c.userId === userId);
    if (!collaborator || !collaborator.permissions.canShare) {
      throw new Error('No sharing permission');
    }

    const link: ShareableLink = {
      id: `share_${uuidv4()}`,
      documentId,
      createdBy: userId,
      createdAt: new Date(),
      expiresAt: options?.expiresIn 
        ? new Date(Date.now() + options.expiresIn) 
        : undefined,
      accessCount: 0,
      maxAccessCount: options?.maxAccessCount,
      permissions,
      password: options?.password 
        ? crypto.createHash('sha256').update(options.password).digest('hex')
        : undefined,
      isActive: true
    };

    this.shareableLinks.set(link.id, link);
    await redisClient.setex(
      `collab:link:${link.id}`,
      options?.expiresIn || 86400000, // 24 hours default
      JSON.stringify(link)
    );

    productionLogger.info('Shareable link created', {
      documentId,
      linkId: link.id,
      createdBy: userId
    });

    return link;
  }

  async accessSharedDocument(
    linkId: string,
    password?: string
  ): Promise<CollaborativeDocument> {
    const link = this.shareableLinks.get(linkId);
    if (!link || !link.isActive) {
      throw new Error('Invalid or expired link');
    }

    // Check expiry
    if (link.expiresAt && link.expiresAt < new Date()) {
      link.isActive = false;
      throw new Error('Link has expired');
    }

    // Check access count
    if (link.maxAccessCount && link.accessCount >= link.maxAccessCount) {
      link.isActive = false;
      throw new Error('Maximum access count reached');
    }

    // Check password
    if (link.password) {
      if (!password) {
        throw new Error('Password required');
      }
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
      if (hashedPassword !== link.password) {
        throw new Error('Invalid password');
      }
    }

    // Get document
    const document = this.documents.get(link.documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Update access count
    link.accessCount++;
    await redisClient.setex(
      `collab:link:${link.id}`,
      86400000,
      JSON.stringify(link)
    );

    productionLogger.info('Shared document accessed', {
      linkId,
      documentId: link.documentId,
      accessCount: link.accessCount
    });

    // Return document with limited info based on permissions
    return this.sanitizeDocumentForSharing(document, link.permissions);
  }

  async getDocumentHistory(
    documentId: string,
    userId: string
  ): Promise<{
    versions: DocumentVersion[];
    changes: DocumentChange[];
  }> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check permissions
    const collaborator = document.collaborators.find(c => c.userId === userId);
    if (!collaborator) {
      throw new Error('No access permission');
    }

    const changes = this.documentChanges.get(documentId) || [];

    return {
      versions: document.versions,
      changes: changes.slice(-100) // Last 100 changes
    };
  }

  async approveDocument(
    documentId: string,
    userId: string,
    comments?: string
  ): Promise<void> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check permissions
    const collaborator = document.collaborators.find(c => c.userId === userId);
    if (!collaborator || !collaborator.permissions.canApprove) {
      throw new Error('No approval permission');
    }

    document.status = 'approved';
    document.metadata.updatedAt = new Date();

    // Add approval comment
    if (comments) {
      await this.addComment(documentId, userId, `Approved: ${comments}`);
    }

    await this.saveDocumentToCache(document);

    this.notifyCollaborators(documentId, 'document:approved', {
      approvedBy: userId,
      comments
    });

    productionLogger.info('Document approved', {
      documentId,
      approvedBy: userId
    });
  }

  // Real-time collaboration
  async joinCollaborationSession(
    documentId: string,
    userId: string
  ): Promise<void> {
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Verify access
    const collaborator = document.collaborators.find(c => c.userId === userId);
    if (!collaborator) {
      throw new Error('No access permission');
    }

    // Add to active sessions
    if (!this.activeSessions.has(documentId)) {
      this.activeSessions.set(documentId, new Set());
    }
    this.activeSessions.get(documentId)!.add(userId);

    // Update last access
    collaborator.lastAccess = new Date();
    document.metadata.lastAccessedAt = new Date();
    await this.saveDocumentToCache(document);

    // Notify other collaborators
    this.notifyCollaborators(documentId, 'collaborator:joined', {
      userId,
      activeUsers: Array.from(this.activeSessions.get(documentId)!)
    }, userId);

    productionLogger.info('User joined collaboration session', {
      documentId,
      userId
    });
  }

  async leaveCollaborationSession(
    documentId: string,
    userId: string
  ): Promise<void> {
    const activeSessions = this.activeSessions.get(documentId);
    if (activeSessions) {
      activeSessions.delete(userId);
      if (activeSessions.size === 0) {
        this.activeSessions.delete(documentId);
      }
    }

    // Unlock any sections held by user
    const document = this.documents.get(documentId);
    if (document) {
      document.locks = document.locks.filter(lock => lock.userId !== userId);
      await this.saveDocumentToCache(document);
    }

    this.notifyCollaborators(documentId, 'collaborator:left', {
      userId,
      activeUsers: activeSessions ? Array.from(activeSessions) : []
    }, userId);

    productionLogger.info('User left collaboration session', {
      documentId,
      userId
    });
  }

  async recordChange(change: DocumentChange): Promise<void> {
    if (!this.documentChanges.has(change.documentId)) {
      this.documentChanges.set(change.documentId, []);
    }

    const changes = this.documentChanges.get(change.documentId)!;
    changes.push(change);

    // Keep only last 1000 changes per document
    if (changes.length > 1000) {
      changes.shift();
    }

    // Broadcast change to active collaborators
    this.notifyCollaborators(change.documentId, 'document:change', change, change.userId);
  }

  // Helper methods
  private getRolePermissions(role: 'editor' | 'reviewer' | 'viewer'): Collaborator['permissions'] {
    switch (role) {
      case 'editor':
        return {
          canEdit: true,
          canComment: true,
          canShare: false,
          canDelete: false,
          canApprove: false
        };
      case 'reviewer':
        return {
          canEdit: false,
          canComment: true,
          canShare: false,
          canDelete: false,
          canApprove: true
        };
      case 'viewer':
        return {
          canEdit: false,
          canComment: false,
          canShare: false,
          canDelete: false,
          canApprove: false
        };
    }
  }

  private async saveDocumentToCache(document: CollaborativeDocument): Promise<void> {
    await redisClient.setex(
      `collab:doc:${document.id}`,
      86400, // 24 hours
      JSON.stringify(document)
    );
  }

  private notifyCollaborators(
    documentId: string,
    event: string,
    data: any,
    excludeUserId?: string
  ): void {
    const document = this.documents.get(documentId);
    if (!document) return;

    const notifyUsers = document.collaborators
      .filter(c => c.userId !== excludeUserId)
      .map(c => c.userId);

    this.notifyUsers(notifyUsers, event, { documentId, ...data });
  }

  private notifyUsers(userIds: string[], event: string, data: any): void {
    userIds.forEach(userId => {
      this.emit('notify:user', {
        userId,
        event,
        data
      });
    });
  }

  private sanitizeDocumentForSharing(
    document: CollaborativeDocument,
    permissions: ShareableLink['permissions']
  ): CollaborativeDocument {
    const sanitized = { ...document };

    // Remove sensitive information based on permissions
    if (!permissions.canEdit) {
      sanitized.collaborators = [];
      sanitized.versions = [sanitized.versions[sanitized.versions.length - 1]]; // Only current version
    }

    if (!permissions.canComment) {
      sanitized.comments = [];
    }

    // Always remove locks for shared access
    sanitized.locks = [];

    return sanitized;
  }

  private async generateThumbnail(
    documentId: string,
    content: Buffer,
    format: string
  ): Promise<string | undefined> {
    // In production, integrate with thumbnail generation service
    // For now, return placeholder
    return `https://thumbnails.foodxchange.com/${documentId}.png`;
  }
}

export const documentCollaborationService = DocumentCollaborationService.getInstance();