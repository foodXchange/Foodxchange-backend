import { BlobServiceClient, ContainerClient, BlockBlobClient } from '@azure/storage-blob';
import { Logger } from '../../core/logging/logger';
import { ValidationError } from '../../core/errors';
import crypto from 'crypto';
import path from 'path';

const logger = new Logger('BlobStorageService');

export class BlobStorageService {
  private blobServiceClient: BlobServiceClient;
  private containerName: string;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

    if (connectionString) {
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    } else if (accountName && accountKey) {
      const url = `https://${accountName}.blob.core.windows.net`;
      this.blobServiceClient = new BlobServiceClient(
        url,
        new StorageSharedKeyCredential(accountName, accountKey)
      );
    } else {
      logger.warn('Azure Blob Storage not configured');
    }

    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'foodxchange';
  }

  /**
   * Initialize container if it doesn't exist
   */
  async initializeContainer(): Promise<void> {
    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const exists = await containerClient.exists();
      
      if (!exists) {
        await containerClient.create({
          access: 'blob' // Public read access for blobs
        });
        logger.info(`Container ${this.containerName} created`);
      }
    } catch (error) {
      logger.error('Failed to initialize container:', error);
      throw error;
    }
  }

  /**
   * Upload file to blob storage
   */
  async uploadFile(
    file: Express.Multer.File,
    containerPath: string,
    fileName?: string
  ): Promise<string> {
    try {
      if (!this.blobServiceClient) {
        throw new ValidationError('Blob storage not configured');
      }

      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      
      // Generate unique filename if not provided
      if (!fileName) {
        const ext = path.extname(file.originalname);
        const hash = crypto.randomBytes(16).toString('hex');
        fileName = `${Date.now()}-${hash}${ext}`;
      }

      const blobName = `${containerPath}/${fileName}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Set content type
      const options = {
        blobHTTPHeaders: {
          blobContentType: file.mimetype
        },
        metadata: {
          originalName: file.originalname,
          uploadedBy: 'foodxchange',
          uploadedAt: new Date().toISOString()
        }
      };

      // Upload file
      await blockBlobClient.upload(file.buffer, file.buffer.length, options);

      const url = blockBlobClient.url;
      
      logger.info('File uploaded to blob storage', {
        blobName,
        size: file.size,
        contentType: file.mimetype
      });

      return url;
    } catch (error) {
      logger.error('Failed to upload file:', error);
      throw error;
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    files: Express.Multer.File[],
    containerPath: string
  ): Promise<string[]> {
    const uploadPromises = files.map(file => 
      this.uploadFile(file, containerPath)
    );
    
    return Promise.all(uploadPromises);
  }

  /**
   * Delete file from blob storage
   */
  async deleteFile(blobUrl: string): Promise<void> {
    try {
      if (!this.blobServiceClient) {
        throw new ValidationError('Blob storage not configured');
      }

      // Extract blob name from URL
      const urlParts = new URL(blobUrl);
      const pathParts = urlParts.pathname.split('/');
      const containerName = pathParts[1];
      const blobName = pathParts.slice(2).join('/');

      const containerClient = this.blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.delete();
      
      logger.info('File deleted from blob storage', { blobName });
    } catch (error) {
      logger.error('Failed to delete file:', error);
      throw error;
    }
  }

  /**
   * Generate SAS URL for temporary access
   */
  async generateSasUrl(
    blobUrl: string,
    expiryMinutes: number = 60
  ): Promise<string> {
    try {
      if (!this.blobServiceClient) {
        throw new ValidationError('Blob storage not configured');
      }

      // Extract blob name from URL
      const urlParts = new URL(blobUrl);
      const pathParts = urlParts.pathname.split('/');
      const containerName = pathParts[1];
      const blobName = pathParts.slice(2).join('/');

      const containerClient = this.blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Generate SAS token
      const startsOn = new Date();
      const expiresOn = new Date(startsOn.getTime() + expiryMinutes * 60 * 1000);

      const sasUrl = await blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse('r'), // Read only
        startsOn,
        expiresOn
      });

      return sasUrl;
    } catch (error) {
      logger.error('Failed to generate SAS URL:', error);
      throw error;
    }
  }

  /**
   * List files in a container path
   */
  async listFiles(containerPath: string): Promise<Array<{
    name: string;
    url: string;
    size: number;
    lastModified: Date;
  }>> {
    try {
      if (!this.blobServiceClient) {
        throw new ValidationError('Blob storage not configured');
      }

      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const files = [];

      for await (const blob of containerClient.listBlobsFlat({ prefix: containerPath })) {
        files.push({
          name: blob.name,
          url: `${containerClient.url}/${blob.name}`,
          size: blob.properties.contentLength || 0,
          lastModified: blob.properties.lastModified || new Date()
        });
      }

      return files;
    } catch (error) {
      logger.error('Failed to list files:', error);
      throw error;
    }
  }

  /**
   * Copy file within storage
   */
  async copyFile(
    sourceBlobUrl: string,
    destinationPath: string
  ): Promise<string> {
    try {
      if (!this.blobServiceClient) {
        throw new ValidationError('Blob storage not configured');
      }

      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const destinationBlobClient = containerClient.getBlockBlobClient(destinationPath);

      // Start copy operation
      const copyPoller = await destinationBlobClient.beginCopyFromURL(sourceBlobUrl);
      await copyPoller.pollUntilDone();

      logger.info('File copied successfully', {
        source: sourceBlobUrl,
        destination: destinationPath
      });

      return destinationBlobClient.url;
    } catch (error) {
      logger.error('Failed to copy file:', error);
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(blobUrl: string): Promise<any> {
    try {
      if (!this.blobServiceClient) {
        throw new ValidationError('Blob storage not configured');
      }

      // Extract blob name from URL
      const urlParts = new URL(blobUrl);
      const pathParts = urlParts.pathname.split('/');
      const containerName = pathParts[1];
      const blobName = pathParts.slice(2).join('/');

      const containerClient = this.blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      const properties = await blockBlobClient.getProperties();

      return {
        contentType: properties.contentType,
        contentLength: properties.contentLength,
        lastModified: properties.lastModified,
        etag: properties.etag,
        metadata: properties.metadata
      };
    } catch (error) {
      logger.error('Failed to get file metadata:', error);
      throw error;
    }
  }
}

// Import required for credentials
import { StorageSharedKeyCredential, BlobSASPermissions } from '@azure/storage-blob';

// Singleton instance
let blobStorageService: BlobStorageService;

/**
 * Get blob storage service instance
 */
export const getBlobStorageService = (): BlobStorageService => {
  if (!blobStorageService) {
    blobStorageService = new BlobStorageService();
  }
  return blobStorageService;
};

/**
 * Helper function to upload file
 */
export const uploadToAzureBlob = async (
  file: Express.Multer.File,
  containerPath: string,
  fileName?: string
): Promise<string> => {
  const service = getBlobStorageService();
  return service.uploadFile(file, containerPath, fileName);
};

/**
 * Helper function to delete file
 */
export const deleteFromAzureBlob = async (blobUrl: string): Promise<void> => {
  const service = getBlobStorageService();
  return service.deleteFile(blobUrl);
};

export default BlobStorageService;