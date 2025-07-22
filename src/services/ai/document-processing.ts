// AI-Powered Document Processing Service
import aiConfig from './config';

class DocumentProcessingService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      const services = await aiConfig.initialize();
      this.formRecognizer = services.formRecognizer;
      this.textAnalytics = services.textAnalytics;
      this.initialized = true;
    }
  }

  async processDocument(documentPath, documentType) {
    await this.initialize();

    try {
      let result;

      switch (documentType) {
        case 'invoice':
          result = await this.processInvoice(documentPath);
          break;
        case 'certificate':
          result = await this.processCertificate(documentPath);
          break;
        case 'contract':
          result = await this.processContract(documentPath);
          break;
        default:
          result = await this.processGeneric(documentPath);
      }

      return {
        success: true,
        documentType,
        data: result,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Document processing error:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async processInvoice(documentPath) {
    if (!this.formRecognizer) {
      return { error: 'Form Recognizer not configured' };
    }

    const poller = await this.formRecognizer.beginAnalyzeDocument(
      'prebuilt-invoice',
      documentPath
    );

    const result = await poller.pollUntilDone();

    return {
      invoiceNumber: result.documents[0]?.fields?.InvoiceId?.value,
      date: result.documents[0]?.fields?.InvoiceDate?.value,
      total: result.documents[0]?.fields?.InvoiceTotal?.value,
      vendor: result.documents[0]?.fields?.VendorName?.value
    };
  }

  async processCertificate(documentPath) {
    if (!this.formRecognizer) {
      return { error: 'Form Recognizer not configured' };
    }

    // Use layout model for certificates
    const poller = await this.formRecognizer.beginAnalyzeDocument(
      'prebuilt-layout',
      documentPath
    );

    const result = await poller.pollUntilDone();

    // Extract text and analyze
    const text = result.content;

    return {
      certificateType: this.extractCertificateType(text),
      issuer: this.extractIssuer(text),
      validUntil: this.extractExpiryDate(text),
      certified: true
    };
  }

  async processContract(documentPath) {
    // Similar implementation for contracts
    return {
      parties: [],
      terms: [],
      effectiveDate: null,
      expiryDate: null
    };
  }

  async processGeneric(documentPath) {
    if (!this.formRecognizer) {
      return { error: 'Form Recognizer not configured' };
    }

    const poller = await this.formRecognizer.beginAnalyzeDocument(
      'prebuilt-layout',
      documentPath
    );

    const result = await poller.pollUntilDone();

    return {
      pages: result.pages?.length || 0,
      text: result.content,
      tables: result.tables?.length || 0
    };
  }

  extractCertificateType(text) {
    const types = ['ISO', 'HACCP', 'Kosher', 'Halal', 'Organic', 'FDA'];
    const found = types.find(type =>
      text.toUpperCase().includes(type.toUpperCase())
    );
    return found || 'Unknown';
  }

  extractIssuer(text) {
    // Basic extraction logic
    const issuerPattern = /issued by[:\s]+([^\n]+)/i;
    const match = text.match(issuerPattern);
    return match ? match[1].trim() : 'Unknown';
  }

  extractExpiryDate(text) {
    // Basic date extraction
    const datePattern = /valid until[:\s]+([^\n]+)/i;
    const match = text.match(datePattern);
    return match ? new Date(match[1].trim()) : null;
  }
}

export default new DocumentProcessingService();
