import { DocumentAnalysisClient, AzureKeyCredential, AnalyzeResult } from "@azure/ai-form-recognizer";
import { Logger } from '../../core/logging/logger';
import { trackAzureServiceCall } from '../../config/applicationInsights';

const logger = new Logger('DocumentIntelligenceService');

export interface InvoiceData {
  invoiceId?: string;
  vendorName?: string;
  vendorAddress?: string;
  customerName?: string;
  customerAddress?: string;
  invoiceDate?: Date;
  dueDate?: Date;
  subtotal?: number;
  tax?: number;
  totalAmount?: number;
  currency?: string;
  items: InvoiceItem[];
  confidence: number;
}

export interface InvoiceItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  productCode?: string;
  confidence: number;
}

export interface CertificateData {
  certificateType?: string;
  certificateNumber?: string;
  issuer?: string;
  issuedDate?: Date;
  expiryDate?: Date;
  subject?: string;
  scope?: string;
  status?: string;
  confidence: number;
}

export interface FoodSafetyData {
  facilityName?: string;
  facilityAddress?: string;
  inspectionDate?: Date;
  inspectorName?: string;
  grade?: string;
  violations?: string[];
  correctionRequired?: boolean;
  nextInspectionDate?: Date;
  confidence: number;
}

export interface DocumentAnalysisResult {
  documentType: string;
  confidence: number;
  data: InvoiceData | CertificateData | FoodSafetyData | Record<string, any>;
  rawResult: AnalyzeResult;
  processingTime: number;
}

class DocumentIntelligenceService {
  private client: DocumentAnalysisClient | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
      const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

      if (!endpoint || !apiKey) {
        logger.warn('Azure Document Intelligence not configured - missing endpoint or key');
        return;
      }

      this.client = new DocumentAnalysisClient(
        endpoint,
        new AzureKeyCredential(apiKey)
      );

      this.isInitialized = true;
      logger.info('✅ Azure Document Intelligence service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Azure Document Intelligence', error);
    }
  }

  public async analyzeInvoice(documentUrl: string): Promise<DocumentAnalysisResult> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Document Intelligence service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      logger.info('Starting invoice analysis', { documentUrl });

      const poller = await this.client.beginAnalyzeDocumentFromUrl(
        "prebuilt-invoice",
        documentUrl
      );

      const result = await poller.pollUntilDone();

      if (!result.documents || result.documents.length === 0) {
        throw new Error('No invoice data extracted from document');
      }

      const document = result.documents[0];
      const invoiceData: InvoiceData = {
        invoiceId: this.extractFieldValue(document.fields?.InvoiceId),
        vendorName: this.extractFieldValue(document.fields?.VendorName),
        vendorAddress: this.extractFieldValue(document.fields?.VendorAddress),
        customerName: this.extractFieldValue(document.fields?.CustomerName),
        customerAddress: this.extractFieldValue(document.fields?.CustomerAddress),
        invoiceDate: this.extractDateValue(document.fields?.InvoiceDate),
        dueDate: this.extractDateValue(document.fields?.DueDate),
        subtotal: this.extractNumberValue(document.fields?.SubTotal),
        tax: this.extractNumberValue(document.fields?.TotalTax),
        totalAmount: this.extractNumberValue(document.fields?.InvoiceTotal),
        currency: this.extractFieldValue(document.fields?.CurrencyCode),
        items: this.extractInvoiceItems(document.fields?.Items),
        confidence: document.confidence || 0
      };

      success = true;
      const processingTime = Date.now() - startTime;

      logger.info('Invoice analysis completed', {
        invoiceId: invoiceData.invoiceId,
        confidence: invoiceData.confidence,
        itemCount: invoiceData.items.length,
        processingTime
      });

      return {
        documentType: 'invoice',
        confidence: invoiceData.confidence,
        data: invoiceData,
        rawResult: result,
        processingTime
      };
    } catch (error) {
      logger.error('Error analyzing invoice document', error, { documentUrl });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('DocumentIntelligence', 'AnalyzeInvoice', duration, success);
    }
  }

  public async analyzeCertificate(documentUrl: string, modelId?: string): Promise<DocumentAnalysisResult> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Document Intelligence service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      const model = modelId || 'prebuilt-document'; // Use custom model if available
      
      logger.info('Starting certificate analysis', { documentUrl, model });

      const poller = await this.client.beginAnalyzeDocumentFromUrl(model, documentUrl);
      const result = await poller.pollUntilDone();

      const certificateData: CertificateData = {
        confidence: 0
      };

      // Extract certificate data based on detected key-value pairs
      if (result.keyValuePairs) {
        for (const kvp of result.keyValuePairs) {
          const key = kvp.key?.content?.toLowerCase() || '';
          const value = kvp.value?.content || '';

          if (key.includes('certificate') && key.includes('number')) {
            certificateData.certificateNumber = value;
          } else if (key.includes('issuer') || key.includes('issued by')) {
            certificateData.issuer = value;
          } else if (key.includes('issue') && key.includes('date')) {
            certificateData.issuedDate = this.parseDate(value);
          } else if (key.includes('expir') && key.includes('date')) {
            certificateData.expiryDate = this.parseDate(value);
          } else if (key.includes('certificate') && key.includes('type')) {
            certificateData.certificateType = value;
          }

          certificateData.confidence = Math.max(certificateData.confidence, kvp.confidence || 0);
        }
      }

      success = true;
      const processingTime = Date.now() - startTime;

      logger.info('Certificate analysis completed', {
        certificateNumber: certificateData.certificateNumber,
        confidence: certificateData.confidence,
        processingTime
      });

      return {
        documentType: 'certificate',
        confidence: certificateData.confidence,
        data: certificateData,
        rawResult: result,
        processingTime
      };
    } catch (error) {
      logger.error('Error analyzing certificate document', error, { documentUrl });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('DocumentIntelligence', 'AnalyzeCertificate', duration, success);
    }
  }

  public async analyzeFoodSafetyDocument(documentUrl: string): Promise<DocumentAnalysisResult> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Document Intelligence service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      logger.info('Starting food safety document analysis', { documentUrl });

      const poller = await this.client.beginAnalyzeDocumentFromUrl('prebuilt-document', documentUrl);
      const result = await poller.pollUntilDone();

      const foodSafetyData: FoodSafetyData = {
        violations: [],
        confidence: 0
      };

      // Extract food safety data from key-value pairs and tables
      if (result.keyValuePairs) {
        for (const kvp of result.keyValuePairs) {
          const key = kvp.key?.content?.toLowerCase() || '';
          const value = kvp.value?.content || '';

          if (key.includes('facility') && key.includes('name')) {
            foodSafetyData.facilityName = value;
          } else if (key.includes('inspection') && key.includes('date')) {
            foodSafetyData.inspectionDate = this.parseDate(value);
          } else if (key.includes('inspector')) {
            foodSafetyData.inspectorName = value;
          } else if (key.includes('grade') || key.includes('score')) {
            foodSafetyData.grade = value;
          } else if (key.includes('violation')) {
            foodSafetyData.violations?.push(value);
          }

          foodSafetyData.confidence = Math.max(foodSafetyData.confidence, kvp.confidence || 0);
        }
      }

      // Extract violations from tables if present
      if (result.tables) {
        for (const table of result.tables) {
          const violationColumns = table.cells.filter(cell => 
            cell.content.toLowerCase().includes('violation') ||
            cell.content.toLowerCase().includes('deficiency')
          );

          if (violationColumns.length > 0) {
            for (const cell of table.cells) {
              if (cell.rowIndex > 0 && cell.content.trim()) { // Skip header row
                foodSafetyData.violations?.push(cell.content);
              }
            }
          }
        }
      }

      success = true;
      const processingTime = Date.now() - startTime;

      logger.info('Food safety document analysis completed', {
        facilityName: foodSafetyData.facilityName,
        violationCount: foodSafetyData.violations?.length || 0,
        confidence: foodSafetyData.confidence,
        processingTime
      });

      return {
        documentType: 'food-safety',
        confidence: foodSafetyData.confidence,
        data: foodSafetyData,
        rawResult: result,
        processingTime
      };
    } catch (error) {
      logger.error('Error analyzing food safety document', error, { documentUrl });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('DocumentIntelligence', 'AnalyzeFoodSafety', duration, success);
    }
  }

  public async analyzeCustomDocument(documentUrl: string, modelId: string): Promise<DocumentAnalysisResult> {
    if (!this.isInitialized || !this.client) {
      throw new Error('Document Intelligence service not initialized');
    }

    const startTime = Date.now();
    let success = false;

    try {
      logger.info('Starting custom document analysis', { documentUrl, modelId });

      const poller = await this.client.beginAnalyzeDocumentFromUrl(modelId, documentUrl);
      const result = await poller.pollUntilDone();

      const extractedData: Record<string, any> = {};
      let confidence = 0;

      // Extract data from documents
      if (result.documents && result.documents.length > 0) {
        const document = result.documents[0];
        confidence = document.confidence || 0;

        // Extract all field values
        if (document.fields) {
          for (const [fieldName, field] of Object.entries(document.fields)) {
            extractedData[fieldName] = this.extractFieldValue(field);
          }
        }
      }

      success = true;
      const processingTime = Date.now() - startTime;

      logger.info('Custom document analysis completed', {
        modelId,
        confidence,
        fieldCount: Object.keys(extractedData).length,
        processingTime
      });

      return {
        documentType: 'custom',
        confidence,
        data: extractedData,
        rawResult: result,
        processingTime
      };
    } catch (error) {
      logger.error('Error analyzing custom document', error, { documentUrl, modelId });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('DocumentIntelligence', 'AnalyzeCustom', duration, success);
    }
  }

  // Helper methods for extracting field values
  private extractFieldValue(field: any): any {
    if (!field) return undefined;
    
    if (field.kind === 'currency') {
      return field.value?.amount;
    } else if (field.kind === 'date') {
      return field.value ? new Date(field.value) : undefined;
    } else if (field.kind === 'number') {
      return field.value;
    } else if (field.kind === 'array') {
      return field.values?.map((item: any) => this.extractFieldValue(item)) || [];
    } else if (field.kind === 'object') {
      const obj: Record<string, any> = {};
      if (field.properties) {
        for (const [key, value] of Object.entries(field.properties)) {
          obj[key] = this.extractFieldValue(value);
        }
      }
      return obj;
    }
    
    return field.value || field.content;
  }

  private extractDateValue(field: any): Date | undefined {
    const value = this.extractFieldValue(field);
    return value ? new Date(value) : undefined;
  }

  private extractNumberValue(field: any): number | undefined {
    const value = this.extractFieldValue(field);
    return typeof value === 'number' ? value : undefined;
  }

  private extractInvoiceItems(itemsField: any): InvoiceItem[] {
    if (!itemsField?.values) return [];

    return itemsField.values.map((item: any) => ({
      description: this.extractFieldValue(item.properties?.Description),
      quantity: this.extractNumberValue(item.properties?.Quantity),
      unitPrice: this.extractNumberValue(item.properties?.UnitPrice),
      amount: this.extractNumberValue(item.properties?.Amount),
      productCode: this.extractFieldValue(item.properties?.ProductCode),
      confidence: item.confidence || 0
    }));
  }

  private parseDate(dateString: string): Date | undefined {
    if (!dateString) return undefined;
    
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? undefined : date;
  }

  public getHealthStatus(): { healthy: boolean; details: Record<string, any> } {
    return {
      healthy: this.isInitialized,
      details: {
        initialized: this.isInitialized,
        endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ? 'configured' : 'missing',
        apiKey: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ? 'configured' : 'missing'
      }
    };
  }

  // Helper method to get supported document types
  public getSupportedDocumentTypes(): string[] {
    return [
      'prebuilt-invoice',
      'prebuilt-receipt',
      'prebuilt-document',
      'prebuilt-businessCard',
      'prebuilt-idDocument',
      'certificate',
      'food-safety',
      'customs-declaration'
    ];
  }
}

// Export singleton instance
export const documentIntelligenceService = new DocumentIntelligenceService();
export default documentIntelligenceService;