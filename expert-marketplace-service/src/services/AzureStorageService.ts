import { BlobServiceClient, ContainerClient, BlockBlobClient } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { productionLogger } from '../utils/productionLogger';

export interface UploadResult {
  url: string;
  blobName: string;
  containerName: string;
  size: number;
  contentType: string;
  etag?: string;
}

export interface StorageFile {
  name: string;
  url: string;
  size: number;
  contentType: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}

export class AzureStorageService {
  private static instance: AzureStorageService;
  private blobServiceClient: BlobServiceClient;
  private containers: Map<string, ContainerClient> = new Map();

  private readonly containerNames = {
    documents: 'documents',
    invoices: 'invoices',
    profiles: 'profiles',
    attachments: 'attachments',
    temp: 'temp'
  };

  private constructor() {
    this.blobServiceClient = BlobServiceClient.fromConnectionString(
      config.azure?.storageConnectionString || 'DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;'
    );
    this.initializeContainers();
  }

  static getInstance(): AzureStorageService {
    if (!AzureStorageService.instance) {
      AzureStorageService.instance = new AzureStorageService();
    }
    return AzureStorageService.instance;
  }

  private async initializeContainers(): Promise<void> {
    try {
      for (const [key, containerName] of Object.entries(this.containerNames)) {
        const containerClient = this.blobServiceClient.getContainerClient(containerName);
        
        // Create container if it doesn't exist
        const exists = await containerClient.exists();
        if (!exists) {
          await containerClient.create({ access: 'blob' });
          productionLogger.info(`Created storage container: ${containerName}`);
        }
        
        this.containers.set(containerName, containerClient);
      }
    } catch (error) {
      productionLogger.error('Failed to initialize storage containers', { error });
    }
  }

  async uploadDocument(
    filename: string,
    content: Buffer | Blob | ArrayBuffer | ArrayBufferView,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    try {
      const containerClient = this.containers.get(this.containerNames.documents);
      if (!containerClient) {
        throw new Error('Documents container not initialized');
      }

      const blobName = this.generateBlobName(filename);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: contentType
        },
        metadata
      };

      await blockBlobClient.upload(content, content.byteLength || content.length, uploadOptions);

      productionLogger.info('Document uploaded to storage', {
        blobName,
        size: content.byteLength || content.length,
        contentType
      });

      return blockBlobClient.url;
    } catch (error) {
      productionLogger.error('Failed to upload document', { error, filename });
      throw error;
    }
  }

  async uploadInvoice(
    invoiceId: string,
    content: Buffer,
    metadata?: Record<string, string>
  ): Promise<string> {
    try {
      const containerClient = this.containers.get(this.containerNames.invoices);
      if (!containerClient) {
        throw new Error('Invoices container not initialized');
      }

      const blobName = `${invoiceId}/invoice.pdf`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: 'application/pdf'
        },
        metadata: {
          ...metadata,
          invoiceId,
          uploadedAt: new Date().toISOString()
        }
      };

      await blockBlobClient.upload(content, content.length, uploadOptions);

      productionLogger.info('Invoice uploaded to storage', {
        invoiceId,
        blobName,
        size: content.length
      });

      return blockBlobClient.url;
    } catch (error) {
      productionLogger.error('Failed to upload invoice', { error, invoiceId });
      throw error;
    }
  }

  async uploadProfileImage(
    userId: string,
    content: Buffer,
    contentType: string
  ): Promise<string> {
    try {
      const containerClient = this.containers.get(this.containerNames.profiles);
      if (!containerClient) {
        throw new Error('Profiles container not initialized');
      }

      const extension = this.getFileExtension(contentType);
      const blobName = `${userId}/profile.${extension}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: contentType
        },
        metadata: {
          userId,
          uploadedAt: new Date().toISOString()
        }
      };

      await blockBlobClient.upload(content, content.length, uploadOptions);

      productionLogger.info('Profile image uploaded', {
        userId,
        blobName,
        size: content.length
      });

      return blockBlobClient.url;
    } catch (error) {
      productionLogger.error('Failed to upload profile image', { error, userId });
      throw error;
    }
  }

  async uploadAttachment(
    filename: string,
    content: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    try {
      const containerClient = this.containers.get(this.containerNames.attachments);
      if (!containerClient) {
        throw new Error('Attachments container not initialized');
      }

      const blobName = this.generateBlobName(filename);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: contentType
        },
        metadata
      };

      const uploadResponse = await blockBlobClient.upload(content, content.length, uploadOptions);

      const result: UploadResult = {
        url: blockBlobClient.url,
        blobName,
        containerName: this.containerNames.attachments,
        size: content.length,
        contentType,
        etag: uploadResponse.etag
      };

      productionLogger.info('Attachment uploaded', result);

      return result;
    } catch (error) {
      productionLogger.error('Failed to upload attachment', { error, filename });
      throw error;
    }
  }

  async downloadFile(containerName: string, blobName: string): Promise<Buffer> {
    try {
      const containerClient = this.containers.get(containerName);
      if (!containerClient) {
        throw new Error(`Container ${containerName} not found`);
      }

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      const downloadResponse = await blockBlobClient.download(0);
      
      if (!downloadResponse.readableStreamBody) {
        throw new Error('No readable stream returned');
      }

      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error) {
      productionLogger.error('Failed to download file', { error, containerName, blobName });
      throw error;
    }
  }

  async deleteFile(containerName: string, blobName: string): Promise<void> {
    try {
      const containerClient = this.containers.get(containerName);
      if (!containerClient) {
        throw new Error(`Container ${containerName} not found`);
      }

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.delete();

      productionLogger.info('File deleted from storage', { containerName, blobName });
    } catch (error) {
      productionLogger.error('Failed to delete file', { error, containerName, blobName });
      throw error;
    }
  }

  async listFiles(
    containerName: string,
    prefix?: string,
    maxResults: number = 100
  ): Promise<StorageFile[]> {
    try {
      const containerClient = this.containers.get(containerName);
      if (!containerClient) {
        throw new Error(`Container ${containerName} not found`);
      }

      const files: StorageFile[] = [];
      const iterator = containerClient.listBlobsFlat({
        prefix,
        includeMetadata: true
      });

      let count = 0;
      for await (const blob of iterator) {
        if (count >= maxResults) break;

        files.push({
          name: blob.name,
          url: `${containerClient.url}/${blob.name}`,
          size: blob.properties.contentLength || 0,
          contentType: blob.properties.contentType || 'application/octet-stream',
          lastModified: blob.properties.lastModified || new Date(),
          metadata: blob.metadata
        });

        count++;
      }

      return files;
    } catch (error) {
      productionLogger.error('Failed to list files', { error, containerName });
      throw error;
    }
  }

  async generateSasUrl(
    containerName: string,
    blobName: string,
    expiresInMinutes: number = 60,
    permissions: string = 'r'
  ): Promise<string> {
    try {
      const containerClient = this.containers.get(containerName);
      if (!containerClient) {
        throw new Error(`Container ${containerName} not found`);
      }

      // In production, implement proper SAS token generation
      // For now, return the blob URL
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      return blockBlobClient.url;
    } catch (error) {
      productionLogger.error('Failed to generate SAS URL', { error, containerName, blobName });
      throw error;
    }
  }

  async copyFile(
    sourceContainer: string,
    sourceBlobName: string,
    destinationContainer: string,
    destinationBlobName: string
  ): Promise<string> {
    try {
      const sourceContainerClient = this.containers.get(sourceContainer);
      const destContainerClient = this.containers.get(destinationContainer);
      
      if (!sourceContainerClient || !destContainerClient) {
        throw new Error('Container not found');
      }

      const sourceBlob = sourceContainerClient.getBlockBlobClient(sourceBlobName);
      const destBlob = destContainerClient.getBlockBlobClient(destinationBlobName);

      await destBlob.beginCopyFromURL(sourceBlob.url);

      productionLogger.info('File copied', {
        source: `${sourceContainer}/${sourceBlobName}`,
        destination: `${destinationContainer}/${destinationBlobName}`
      });

      return destBlob.url;
    } catch (error) {
      productionLogger.error('Failed to copy file', { error });
      throw error;
    }
  }

  async createTempUploadUrl(
    filename: string,
    contentType: string,
    expiresInMinutes: number = 60
  ): Promise<{ uploadUrl: string; blobName: string }> {
    try {
      const containerClient = this.containers.get(this.containerNames.temp);
      if (!containerClient) {
        throw new Error('Temp container not initialized');
      }

      const blobName = this.generateBlobName(filename);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // In production, generate SAS token for direct upload
      const uploadUrl = blockBlobClient.url;

      return { uploadUrl, blobName };
    } catch (error) {
      productionLogger.error('Failed to create temp upload URL', { error });
      throw error;
    }
  }

  // Helper methods
  private generateBlobName(filename: string): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${timestamp}_${uuid}_${sanitizedFilename}`;
  }

  private getFileExtension(contentType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
    };

    return mimeToExt[contentType] || 'bin';
  }
}

export const azureStorageService = AzureStorageService.getInstance();