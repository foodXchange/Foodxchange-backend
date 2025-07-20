import * as path from 'path';

import { BlobServiceClient, ContainerClient, BlockBlobClient, BlobGenerateSasUrlOptions, BlobSASPermissions } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';

import { trackAzureServiceCall } from '../../config/applicationInsights';
import { Logger } from '../../core/logging/logger';

const logger = new Logger('StorageService');

export interface UploadResult {
  blobName: string;
  url: string;
  contentType: string;
  size: number;
  etag: string;
  lastModified: Date;
}

export interface FileMetadata {
  originalName: string;
  uploadedBy: string;
  entityType: 'sample' | 'order' | 'compliance' | 'product';
  entityId: string;
  category?: string;
  tags?: string[];
}

export interface DownloadResult {
  content: Buffer;
  contentType: string;
  contentLength: number;
  lastModified: Date;
  etag: string;
}

class StorageService {
  private blobServiceClient: BlobServiceClient | null = null;
  private containerClient: ContainerClient | null = null;
  private isInitialized = false;
  private readonly containerName: string;

  constructor() {
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'foodxchange-files';
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        logger.warn('Azure Storage not configured - missing connection string');
        return;
      }

      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);

      // Ensure container exists
      await this.ensureContainerExists();

      this.isInitialized = true;
      logger.info('✅ Azure Storage service initialized', { container: this.containerName });
    } catch (error) {
      logger.error('❌ Failed to initialize Azure Storage', error);
    }
  }

  private async ensureContainerExists(): Promise<void> {
    if (!this.containerClient) return;

    try {
      const exists = await this.containerClient.exists();
      if (!exists) {
        await this.containerClient.create({
          access: 'blob' // Allow public read access to blobs
        });
        logger.info(`Container created: ${this.containerName}`);
      }
    } catch (error) {
      logger.error('Error ensuring container exists', error);
    }
  }

  public async uploadFile(
    fileName: string,
    fileBuffer: Buffer,
    contentType: string,
    metadata?: FileMetadata,
    folder?: string
  ): Promise<UploadResult> {
    if (!this.isInitialized || !this.containerClient) {
      throw new Error('Storage service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      // Generate unique blob name
      const fileExtension = path.extname(fileName);
      const baseName = path.basename(fileName, fileExtension);
      const sanitizedBaseName = this.sanitizeFileName(baseName);
      const uniqueId = uuidv4();

      let blobName: string;
      if (folder) {
        blobName = `${folder}/${uniqueId}-${sanitizedBaseName}${fileExtension}`;
      } else {
        blobName = `${uniqueId}-${sanitizedBaseName}${fileExtension}`;
      }

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      // Prepare blob metadata
      const blobMetadata: Record<string, string> = {
        originalName: fileName,
        uploadedAt: new Date().toISOString(),
        size: fileBuffer.length.toString()
      };

      if (metadata) {
        if (metadata.uploadedBy) blobMetadata.uploadedBy = metadata.uploadedBy;
        if (metadata.entityType) blobMetadata.entityType = metadata.entityType;
        if (metadata.entityId) blobMetadata.entityId = metadata.entityId;
        if (metadata.category) blobMetadata.category = metadata.category;
        if (metadata.tags) blobMetadata.tags = metadata.tags.join(',');
      }

      // Upload blob
      const uploadResponse = await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: contentType,
          blobContentDisposition: `inline; filename="${fileName}"`
        },
        metadata: blobMetadata,
        tags: metadata?.tags ? Object.fromEntries(metadata.tags.map(tag => [tag, 'true'])) : undefined
      });

      success = true;

      const result: UploadResult = {
        blobName,
        url: blockBlobClient.url,
        contentType,
        size: fileBuffer.length,
        etag: uploadResponse.etag,
        lastModified: uploadResponse.lastModified
      };

      logger.info('File uploaded successfully', {
        blobName,
        originalName: fileName,
        size: fileBuffer.length,
        contentType
      });

      return result;
    } catch (error) {
      logger.error('Error uploading file to Azure Storage', error, {
        fileName,
        contentType,
        size: fileBuffer.length
      });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('Storage', 'UploadFile', duration, success);
    }
  }

  public async uploadMultipleFiles(
    files: Array<{ fileName: string; buffer: Buffer; contentType: string }>,
    metadata?: FileMetadata,
    folder?: string
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const file of files) {
      try {
        const result = await this.uploadFile(
          file.fileName,
          file.buffer,
          file.contentType,
          metadata,
          folder
        );
        results.push(result);
      } catch (error) {
        logger.error(`Failed to upload file: ${file.fileName}`, error);
        // Continue with other files even if one fails
      }
    }

    return results;
  }

  public async downloadFile(blobName: string): Promise<DownloadResult> {
    if (!this.isInitialized || !this.containerClient) {
      throw new Error('Storage service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      const downloadResponse = await blockBlobClient.download();

      if (!downloadResponse.readableStreamBody) {
        throw new Error('No content stream available');
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks);

      success = true;

      const result: DownloadResult = {
        content,
        contentType: downloadResponse.contentType || 'application/octet-stream',
        contentLength: downloadResponse.contentLength || content.length,
        lastModified: downloadResponse.lastModified,
        etag: downloadResponse.etag
      };

      logger.debug('File downloaded successfully', {
        blobName,
        size: result.contentLength
      });

      return result;
    } catch (error) {
      logger.error('Error downloading file from Azure Storage', error, { blobName });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('Storage', 'DownloadFile', duration, success);
    }
  }

  public async deleteFile(blobName: string): Promise<boolean> {
    if (!this.isInitialized || !this.containerClient) {
      throw new Error('Storage service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      const deleteResponse = await blockBlobClient.deleteIfExists();

      success = deleteResponse.succeeded;

      if (success) {
        logger.info('File deleted successfully', { blobName });
      } else {
        logger.warn('File not found for deletion', { blobName });
      }

      return success;
    } catch (error) {
      logger.error('Error deleting file from Azure Storage', error, { blobName });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('Storage', 'DeleteFile', duration, success);
    }
  }

  public async getFileUrl(blobName: string, expiresInHours: number = 24): Promise<string> {
    if (!this.isInitialized || !this.containerClient) {
      throw new Error('Storage service not initialized');
    }

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      // Generate SAS URL for secure access
      const sasOptions: BlobGenerateSasUrlOptions = {
        permissions: BlobSASPermissions.parse('r'), // Read permission
        expiresOn: new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      };

      const sasUrl = await blockBlobClient.generateSasUrl(sasOptions);
      return sasUrl;
    } catch (error) {
      logger.error('Error generating file URL', error, { blobName });
      throw error;
    }
  }

  public async listFiles(
    prefix?: string,
    entityType?: string,
    entityId?: string
  ): Promise<Array<{ blobName: string; url: string; metadata: Record<string, string>; lastModified: Date; size: number }>> {
    if (!this.isInitialized || !this.containerClient) {
      throw new Error('Storage service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      const files: Array<{ blobName: string; url: string; metadata: Record<string, string>; lastModified: Date; size: number }> = [];

      const listOptions = prefix ? { prefix } : undefined;

      for await (const blob of this.containerClient.listBlobsFlat({ includeMetadata: true, ...listOptions })) {
        // Filter by entity type and ID if provided
        if (entityType && blob.metadata?.entityType !== entityType) continue;
        if (entityId && blob.metadata?.entityId !== entityId) continue;

        const blockBlobClient = this.containerClient.getBlockBlobClient(blob.name);

        files.push({
          blobName: blob.name,
          url: blockBlobClient.url,
          metadata: blob.metadata || {},
          lastModified: blob.properties.lastModified,
          size: blob.properties.contentLength || 0
        });
      }

      success = true;

      logger.debug('Files listed successfully', {
        count: files.length,
        prefix,
        entityType,
        entityId
      });

      return files;
    } catch (error) {
      logger.error('Error listing files from Azure Storage', error);
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('Storage', 'ListFiles', duration, success);
    }
  }

  public async getFileMetadata(blobName: string): Promise<Record<string, string> | null> {
    if (!this.isInitialized || !this.containerClient) {
      throw new Error('Storage service not initialized');
    }

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      const properties = await blockBlobClient.getProperties();
      return properties.metadata || null;
    } catch (error) {
      logger.error('Error getting file metadata', error, { blobName });
      return null;
    }
  }

  public async updateFileMetadata(blobName: string, metadata: Record<string, string>): Promise<boolean> {
    if (!this.isInitialized || !this.containerClient) {
      throw new Error('Storage service not initialized');
    }

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.setMetadata(metadata);

      logger.debug('File metadata updated', { blobName, metadata });
      return true;
    } catch (error) {
      logger.error('Error updating file metadata', error, { blobName });
      return false;
    }
  }

  private sanitizeFileName(fileName: string): string {
    // Remove or replace invalid characters
    return fileName
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  public getHealthStatus(): { healthy: boolean; details: Record<string, any> } {
    return {
      healthy: this.isInitialized,
      details: {
        initialized: this.isInitialized,
        containerName: this.containerName,
        connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ? 'configured' : 'missing'
      }
    };
  }

  // Helper methods for FoodXchange-specific file operations
  public async uploadSampleDocument(
    sampleId: string,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string,
    uploadedBy: string,
    category: string = 'general'
  ): Promise<UploadResult> {
    return this.uploadFile(fileName, fileBuffer, contentType, {
      originalName: fileName,
      uploadedBy,
      entityType: 'sample',
      entityId: sampleId,
      category,
      tags: ['sample', category]
    }, 'samples');
  }

  public async uploadOrderDocument(
    orderId: string,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string,
    uploadedBy: string,
    category: string = 'general'
  ): Promise<UploadResult> {
    return this.uploadFile(fileName, fileBuffer, contentType, {
      originalName: fileName,
      uploadedBy,
      entityType: 'order',
      entityId: orderId,
      category,
      tags: ['order', category]
    }, 'orders');
  }

  public async uploadComplianceDocument(
    entityId: string,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string,
    uploadedBy: string,
    category: string = 'certification'
  ): Promise<UploadResult> {
    return this.uploadFile(fileName, fileBuffer, contentType, {
      originalName: fileName,
      uploadedBy,
      entityType: 'compliance',
      entityId,
      category,
      tags: ['compliance', category]
    }, 'compliance');
  }

  public async uploadProductImage(
    productId: string,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string,
    uploadedBy: string,
    category: string = 'product-image'
  ): Promise<UploadResult> {
    return this.uploadFile(fileName, fileBuffer, contentType, {
      originalName: fileName,
      uploadedBy,
      entityType: 'product',
      entityId: productId,
      category,
      tags: ['product', 'image', category]
    }, 'products');
  }
}

// Export singleton instance
export const storageService = new StorageService();
export default storageService;
