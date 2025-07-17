import { EventEmitter } from 'events';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { azureStorageService } from './AzureStorageService';
import { productionLogger } from '../utils/productionLogger';
import { config } from '../config';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: 'standard' | 'proforma' | 'credit_note' | 'recurring';
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  
  // Billing parties
  from: BillingParty;
  to: BillingParty;
  
  // Line items
  items: InvoiceItem[];
  
  // Financial details
  subtotal: number;
  tax: TaxDetails[];
  discount?: DiscountDetails;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  
  // Additional information
  notes?: string;
  terms?: string;
  attachments?: Attachment[];
  
  // Metadata
  projectId?: string;
  rfqId?: string;
  consultationId?: string;
  expertId?: string;
  clientId?: string;
  
  // Tracking
  sentAt?: Date;
  viewedAt?: Date;
  remindersSent: number;
  lastReminderAt?: Date;
  
  // Documents
  pdfUrl?: string;
  publicUrl?: string;
  
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    locale: string;
    template: string;
  };
}

export interface BillingParty {
  type: 'individual' | 'company';
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  address: Address;
  taxId?: string;
  registrationNumber?: string;
  logo?: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  subtotal: number;
  tax?: number;
  taxRate?: number;
  discount?: number;
  total: number;
  metadata?: {
    serviceDate?: Date;
    projectPhase?: string;
    milestoneId?: string;
  };
}

export interface TaxDetails {
  name: string;
  rate: number;
  amount: number;
  inclusive: boolean;
  taxId?: string;
}

export interface DiscountDetails {
  type: 'percentage' | 'fixed';
  value: number;
  amount: number;
  reason?: string;
}

export interface Attachment {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  description?: string;
  layout: 'standard' | 'modern' | 'minimal' | 'detailed';
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  sections: string[];
  customCSS?: string;
}

export interface InvoiceGenerationOptions {
  template?: string;
  locale?: string;
  includeQRCode?: boolean;
  includePaymentLink?: boolean;
  watermark?: string;
  digitalSignature?: boolean;
}

export class InvoiceGenerationService extends EventEmitter {
  private static instance: InvoiceGenerationService;
  private invoices: Map<string, Invoice> = new Map();
  private templates: Map<string, InvoiceTemplate> = new Map();
  private invoiceCounter: number = 1000; // Starting invoice number

  private constructor() {
    super();
    this.initializeService();
  }

  static getInstance(): InvoiceGenerationService {
    if (!InvoiceGenerationService.instance) {
      InvoiceGenerationService.instance = new InvoiceGenerationService();
    }
    return InvoiceGenerationService.instance;
  }

  private async initializeService(): Promise<void> {
    this.loadDefaultTemplates();
    await this.loadInvoiceCounter();
    productionLogger.info('Invoice generation service initialized');
  }

  private loadDefaultTemplates(): void {
    // Standard template
    this.templates.set('standard', {
      id: 'standard',
      name: 'Standard Invoice',
      layout: 'standard',
      colors: {
        primary: '#1a73e8',
        secondary: '#f1f3f4',
        accent: '#34a853',
        text: '#202124'
      },
      fonts: {
        heading: 'Helvetica-Bold',
        body: 'Helvetica'
      },
      sections: ['header', 'billing', 'items', 'totals', 'notes', 'footer']
    });

    // Modern template
    this.templates.set('modern', {
      id: 'modern',
      name: 'Modern Invoice',
      layout: 'modern',
      colors: {
        primary: '#6366f1',
        secondary: '#f3f4f6',
        accent: '#10b981',
        text: '#1f2937'
      },
      fonts: {
        heading: 'Helvetica-Bold',
        body: 'Helvetica'
      },
      sections: ['header', 'billing', 'items', 'totals', 'payment', 'footer']
    });
  }

  private async loadInvoiceCounter(): Promise<void> {
    // In production, load from database
    const lastInvoice = await this.getLastInvoiceNumber();
    if (lastInvoice) {
      this.invoiceCounter = parseInt(lastInvoice) + 1;
    }
  }

  async createInvoice(
    data: {
      type: Invoice['type'];
      from: BillingParty;
      to: BillingParty;
      items: Omit<InvoiceItem, 'id' | 'subtotal' | 'total'>[];
      tax?: TaxDetails[];
      discount?: DiscountDetails;
      notes?: string;
      terms?: string;
      dueInDays?: number;
      metadata?: {
        projectId?: string;
        rfqId?: string;
        consultationId?: string;
        expertId?: string;
        clientId?: string;
      };
    },
    createdBy: string,
    options: InvoiceGenerationOptions = {}
  ): Promise<Invoice> {
    const invoiceId = `inv_${uuidv4()}`;
    const invoiceNumber = this.generateInvoiceNumber();
    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + (data.dueInDays || 30) * 24 * 60 * 60 * 1000);

    // Calculate line items
    const items: InvoiceItem[] = data.items.map(item => {
      const subtotal = item.quantity * item.unitPrice;
      const taxAmount = item.taxRate ? subtotal * (item.taxRate / 100) : 0;
      const discountAmount = item.discount || 0;
      const total = subtotal + taxAmount - discountAmount;

      return {
        id: uuidv4(),
        ...item,
        subtotal,
        tax: taxAmount,
        total
      };
    });

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    
    // Calculate tax
    const taxAmount = data.tax ? data.tax.reduce((sum, tax) => {
      return sum + (tax.inclusive ? 0 : subtotal * (tax.rate / 100));
    }, 0) : 0;

    // Calculate discount
    const discountAmount = data.discount ? (
      data.discount.type === 'percentage' 
        ? subtotal * (data.discount.value / 100)
        : data.discount.value
    ) : 0;

    const total = subtotal + taxAmount - discountAmount;

    const invoice: Invoice = {
      id: invoiceId,
      invoiceNumber,
      type: data.type,
      status: 'draft',
      issueDate,
      dueDate,
      from: data.from,
      to: data.to,
      items,
      subtotal,
      tax: data.tax || [],
      discount: data.discount ? { ...data.discount, amount: discountAmount } : undefined,
      total,
      amountPaid: 0,
      amountDue: total,
      currency: 'USD',
      notes: data.notes,
      terms: data.terms || this.getDefaultTerms(),
      remindersSent: 0,
      ...data.metadata,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
        locale: options.locale || 'en-US',
        template: options.template || 'standard'
      }
    };

    // Generate PDF
    const pdfBuffer = await this.generatePDF(invoice, options);
    const pdfUrl = await this.uploadInvoicePDF(invoice.id, pdfBuffer);
    invoice.pdfUrl = pdfUrl;

    // Generate public URL for sharing
    invoice.publicUrl = await this.generatePublicUrl(invoice.id);

    this.invoices.set(invoiceId, invoice);

    productionLogger.info('Invoice created', {
      invoiceId,
      invoiceNumber,
      total,
      currency: invoice.currency
    });

    this.emit('invoice:created', invoice);
    return invoice;
  }

  async updateInvoice(
    invoiceId: string,
    updates: Partial<Invoice>,
    updatedBy: string
  ): Promise<Invoice> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      throw new Error('Cannot update paid or cancelled invoice');
    }

    // Update invoice
    Object.assign(invoice, updates, {
      metadata: {
        ...invoice.metadata,
        updatedAt: new Date()
      }
    });

    // Recalculate totals if items changed
    if (updates.items) {
      this.recalculateTotals(invoice);
    }

    // Regenerate PDF
    const pdfBuffer = await this.generatePDF(invoice);
    const pdfUrl = await this.uploadInvoicePDF(invoice.id, pdfBuffer);
    invoice.pdfUrl = pdfUrl;

    productionLogger.info('Invoice updated', {
      invoiceId,
      updatedBy
    });

    this.emit('invoice:updated', invoice);
    return invoice;
  }

  async sendInvoice(
    invoiceId: string,
    options: {
      emailTemplate?: string;
      cc?: string[];
      bcc?: string[];
      attachments?: Attachment[];
      message?: string;
    } = {}
  ): Promise<void> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'draft') {
      invoice.status = 'sent';
    }
    invoice.sentAt = new Date();

    // Send email notification
    await this.sendInvoiceEmail(invoice, options);

    productionLogger.info('Invoice sent', {
      invoiceId,
      to: invoice.to.email
    });

    this.emit('invoice:sent', invoice);
  }

  async markInvoiceViewed(invoiceId: string): Promise<void> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'sent') {
      invoice.status = 'viewed';
    }
    invoice.viewedAt = invoice.viewedAt || new Date();

    productionLogger.info('Invoice viewed', { invoiceId });
    this.emit('invoice:viewed', invoice);
  }

  async markInvoicePaid(
    invoiceId: string,
    paymentDetails: {
      amount: number;
      paymentDate: Date;
      paymentMethod?: string;
      transactionId?: string;
      notes?: string;
    }
  ): Promise<Invoice> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    invoice.amountPaid = paymentDetails.amount;
    invoice.amountDue = invoice.total - paymentDetails.amount;
    invoice.paidDate = paymentDetails.paymentDate;

    if (invoice.amountDue <= 0) {
      invoice.status = 'paid';
      invoice.amountDue = 0;
    }

    productionLogger.info('Invoice marked as paid', {
      invoiceId,
      amount: paymentDetails.amount,
      status: invoice.status
    });

    this.emit('invoice:paid', invoice);
    return invoice;
  }

  async cancelInvoice(
    invoiceId: string,
    reason?: string
  ): Promise<Invoice> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'paid') {
      throw new Error('Cannot cancel paid invoice');
    }

    invoice.status = 'cancelled';
    invoice.notes = invoice.notes 
      ? `${invoice.notes}\n\nCancellation reason: ${reason || 'No reason provided'}`
      : `Cancellation reason: ${reason || 'No reason provided'}`;

    productionLogger.info('Invoice cancelled', {
      invoiceId,
      reason
    });

    this.emit('invoice:cancelled', invoice);
    return invoice;
  }

  async createCreditNote(
    originalInvoiceId: string,
    items: Omit<InvoiceItem, 'id' | 'subtotal' | 'total'>[],
    reason: string,
    createdBy: string
  ): Promise<Invoice> {
    const originalInvoice = this.invoices.get(originalInvoiceId);
    if (!originalInvoice) {
      throw new Error('Original invoice not found');
    }

    const creditNote = await this.createInvoice(
      {
        type: 'credit_note',
        from: originalInvoice.from,
        to: originalInvoice.to,
        items,
        tax: originalInvoice.tax,
        notes: `Credit note for invoice ${originalInvoice.invoiceNumber}\nReason: ${reason}`,
        metadata: {
          projectId: originalInvoice.projectId,
          rfqId: originalInvoice.rfqId,
          expertId: originalInvoice.expertId,
          clientId: originalInvoice.clientId
        }
      },
      createdBy
    );

    // Link credit note to original invoice
    creditNote.invoiceNumber = `CN-${originalInvoice.invoiceNumber}`;

    productionLogger.info('Credit note created', {
      creditNoteId: creditNote.id,
      originalInvoiceId
    });

    return creditNote;
  }

  async getInvoicesByClient(
    clientId: string,
    options: {
      status?: Invoice['status'];
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ invoices: Invoice[]; total: number }> {
    const allInvoices = Array.from(this.invoices.values());
    
    let filtered = allInvoices.filter(inv => inv.clientId === clientId);

    if (options.status) {
      filtered = filtered.filter(inv => inv.status === options.status);
    }

    if (options.startDate) {
      filtered = filtered.filter(inv => inv.issueDate >= options.startDate!);
    }

    if (options.endDate) {
      filtered = filtered.filter(inv => inv.issueDate <= options.endDate!);
    }

    // Sort by issue date descending
    filtered.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());

    const total = filtered.length;
    const start = options.offset || 0;
    const end = start + (options.limit || 50);
    const invoices = filtered.slice(start, end);

    return { invoices, total };
  }

  async getInvoicesByExpert(
    expertId: string,
    options: {
      status?: Invoice['status'];
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ invoices: Invoice[]; total: number }> {
    const allInvoices = Array.from(this.invoices.values());
    
    let filtered = allInvoices.filter(inv => inv.expertId === expertId);

    if (options.status) {
      filtered = filtered.filter(inv => inv.status === options.status);
    }

    if (options.startDate) {
      filtered = filtered.filter(inv => inv.issueDate >= options.startDate!);
    }

    if (options.endDate) {
      filtered = filtered.filter(inv => inv.issueDate <= options.endDate!);
    }

    // Sort by issue date descending
    filtered.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());

    const total = filtered.length;
    const start = options.offset || 0;
    const end = start + (options.limit || 50);
    const invoices = filtered.slice(start, end);

    return { invoices, total };
  }

  async getInvoiceSummary(
    filters: {
      startDate: Date;
      endDate: Date;
      clientId?: string;
      expertId?: string;
    }
  ): Promise<{
    totalInvoices: number;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    overdueAmount: number;
    byStatus: Record<Invoice['status'], number>;
    byCurrency: Record<string, number>;
  }> {
    const invoices = Array.from(this.invoices.values()).filter(inv => {
      if (inv.issueDate < filters.startDate || inv.issueDate > filters.endDate) {
        return false;
      }
      if (filters.clientId && inv.clientId !== filters.clientId) {
        return false;
      }
      if (filters.expertId && inv.expertId !== filters.expertId) {
        return false;
      }
      return true;
    });

    const now = new Date();
    const summary = {
      totalInvoices: invoices.length,
      totalAmount: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      overdueAmount: 0,
      byStatus: {} as Record<Invoice['status'], number>,
      byCurrency: {} as Record<string, number>
    };

    invoices.forEach(invoice => {
      // Totals
      summary.totalAmount += invoice.total;
      summary.paidAmount += invoice.amountPaid;
      summary.outstandingAmount += invoice.amountDue;

      // Overdue
      if (invoice.status !== 'paid' && invoice.dueDate < now) {
        summary.overdueAmount += invoice.amountDue;
      }

      // By status
      summary.byStatus[invoice.status] = (summary.byStatus[invoice.status] || 0) + 1;

      // By currency
      summary.byCurrency[invoice.currency] = 
        (summary.byCurrency[invoice.currency] || 0) + invoice.total;
    });

    return summary;
  }

  async sendPaymentReminder(
    invoiceId: string,
    options: {
      template?: string;
      message?: string;
    } = {}
  ): Promise<void> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      throw new Error('Cannot send reminder for paid or cancelled invoice');
    }

    invoice.remindersSent++;
    invoice.lastReminderAt = new Date();

    // Update status to overdue if past due date
    if (invoice.dueDate < new Date() && invoice.status !== 'overdue') {
      invoice.status = 'overdue';
    }

    await this.sendReminderEmail(invoice, options);

    productionLogger.info('Payment reminder sent', {
      invoiceId,
      reminderNumber: invoice.remindersSent
    });

    this.emit('invoice:reminder_sent', invoice);
  }

  // PDF Generation
  private async generatePDF(
    invoice: Invoice,
    options: InvoiceGenerationOptions = {}
  ): Promise<Buffer> {
    const template = this.templates.get(options.template || invoice.metadata.template);
    if (!template) {
      throw new Error('Template not found');
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Invoice ${invoice.invoiceNumber}`,
        Author: 'FoodXchange',
        Subject: `Invoice for ${invoice.to.name}`,
        Keywords: 'invoice, foodxchange',
        CreationDate: new Date()
      }
    });

    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));

    // Header
    this.renderHeader(doc, invoice, template);

    // Billing information
    this.renderBillingInfo(doc, invoice, template);

    // Invoice items table
    this.renderItemsTable(doc, invoice, template);

    // Totals
    this.renderTotals(doc, invoice, template);

    // Notes and terms
    this.renderNotesAndTerms(doc, invoice, template);

    // Footer
    this.renderFooter(doc, invoice, template);

    // QR Code if requested
    if (options.includeQRCode) {
      await this.renderQRCode(doc, invoice);
    }

    // Watermark if specified
    if (options.watermark) {
      this.renderWatermark(doc, options.watermark);
    }

    doc.end();

    return new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });
    });
  }

  private renderHeader(doc: PDFKit.PDFDocument, invoice: Invoice, template: InvoiceTemplate): void {
    // Logo
    if (invoice.from.logo) {
      // doc.image(invoice.from.logo, 50, 50, { width: 150 });
    }

    // Invoice title
    doc.fontSize(24)
       .fillColor(template.colors.primary)
       .text(invoice.type === 'credit_note' ? 'CREDIT NOTE' : 'INVOICE', 400, 50);

    // Invoice details
    doc.fontSize(10)
       .fillColor(template.colors.text)
       .text(`Invoice #: ${invoice.invoiceNumber}`, 400, 80)
       .text(`Date: ${format(invoice.issueDate, 'MMM dd, yyyy')}`, 400, 95)
       .text(`Due Date: ${format(invoice.dueDate, 'MMM dd, yyyy')}`, 400, 110);

    doc.moveDown(2);
  }

  private renderBillingInfo(doc: PDFKit.PDFDocument, invoice: Invoice, template: InvoiceTemplate): void {
    const startY = 150;

    // From section
    doc.fontSize(12)
       .fillColor(template.colors.primary)
       .text('FROM', 50, startY);

    doc.fontSize(10)
       .fillColor(template.colors.text)
       .text(invoice.from.companyName || invoice.from.name, 50, startY + 20)
       .text(invoice.from.address.line1, 50, startY + 35);

    if (invoice.from.address.line2) {
      doc.text(invoice.from.address.line2, 50, startY + 50);
    }

    doc.text(`${invoice.from.address.city}, ${invoice.from.address.state} ${invoice.from.address.postalCode}`, 
            50, startY + (invoice.from.address.line2 ? 65 : 50))
       .text(invoice.from.address.country, 50, startY + (invoice.from.address.line2 ? 80 : 65));

    if (invoice.from.taxId) {
      doc.text(`Tax ID: ${invoice.from.taxId}`, 50, startY + (invoice.from.address.line2 ? 95 : 80));
    }

    // To section
    doc.fontSize(12)
       .fillColor(template.colors.primary)
       .text('TO', 300, startY);

    doc.fontSize(10)
       .fillColor(template.colors.text)
       .text(invoice.to.companyName || invoice.to.name, 300, startY + 20)
       .text(invoice.to.address.line1, 300, startY + 35);

    if (invoice.to.address.line2) {
      doc.text(invoice.to.address.line2, 300, startY + 50);
    }

    doc.text(`${invoice.to.address.city}, ${invoice.to.address.state} ${invoice.to.address.postalCode}`, 
            300, startY + (invoice.to.address.line2 ? 65 : 50))
       .text(invoice.to.address.country, 300, startY + (invoice.to.address.line2 ? 80 : 65));

    if (invoice.to.taxId) {
      doc.text(`Tax ID: ${invoice.to.taxId}`, 300, startY + (invoice.to.address.line2 ? 95 : 80));
    }

    doc.moveDown(3);
  }

  private renderItemsTable(doc: PDFKit.PDFDocument, invoice: Invoice, template: InvoiceTemplate): void {
    const tableTop = 300;
    const tableHeaders = ['Description', 'Qty', 'Unit Price', 'Tax', 'Total'];
    const columnWidths = [250, 50, 80, 60, 80];
    const columnPositions = [50, 300, 350, 430, 490];

    // Table header
    doc.fontSize(10)
       .fillColor(template.colors.primary);

    tableHeaders.forEach((header, i) => {
      doc.text(header, columnPositions[i], tableTop, { width: columnWidths[i] });
    });

    // Draw header line
    doc.moveTo(50, tableTop + 15)
       .lineTo(550, tableTop + 15)
       .stroke(template.colors.primary);

    // Table rows
    let yPosition = tableTop + 25;
    doc.fillColor(template.colors.text);

    invoice.items.forEach((item, index) => {
      // Description
      doc.fontSize(9)
         .text(item.description, columnPositions[0], yPosition, { 
           width: columnWidths[0],
           lineBreak: true 
         });

      const descriptionHeight = doc.heightOfString(item.description, { width: columnWidths[0] });
      const rowY = yPosition + (descriptionHeight > 15 ? 0 : 0);

      // Quantity
      doc.text(item.quantity.toString(), columnPositions[1], rowY);

      // Unit price
      doc.text(this.formatCurrency(item.unitPrice, invoice.currency), columnPositions[2], rowY);

      // Tax
      doc.text(item.tax ? this.formatCurrency(item.tax, invoice.currency) : '-', columnPositions[3], rowY);

      // Total
      doc.text(this.formatCurrency(item.total, invoice.currency), columnPositions[4], rowY);

      yPosition += Math.max(descriptionHeight, 20) + 5;

      // Add page break if needed
      if (yPosition > 650) {
        doc.addPage();
        yPosition = 50;
      }
    });

    // Draw bottom line
    doc.moveTo(50, yPosition)
       .lineTo(550, yPosition)
       .stroke(template.colors.secondary);
  }

  private renderTotals(doc: PDFKit.PDFDocument, invoice: Invoice, template: InvoiceTemplate): void {
    const totalsX = 400;
    let totalsY = doc.y + 20;

    doc.fontSize(10)
       .fillColor(template.colors.text);

    // Subtotal
    doc.text('Subtotal:', totalsX, totalsY)
       .text(this.formatCurrency(invoice.subtotal, invoice.currency), totalsX + 100, totalsY, { align: 'right' });

    totalsY += 20;

    // Tax
    if (invoice.tax && invoice.tax.length > 0) {
      invoice.tax.forEach(tax => {
        doc.text(`${tax.name} (${tax.rate}%):`, totalsX, totalsY)
           .text(this.formatCurrency(tax.amount, invoice.currency), totalsX + 100, totalsY, { align: 'right' });
        totalsY += 20;
      });
    }

    // Discount
    if (invoice.discount) {
      const discountLabel = invoice.discount.type === 'percentage' 
        ? `Discount (${invoice.discount.value}%):`
        : 'Discount:';
      doc.text(discountLabel, totalsX, totalsY)
         .text(`-${this.formatCurrency(invoice.discount.amount, invoice.currency)}`, totalsX + 100, totalsY, { align: 'right' });
      totalsY += 20;
    }

    // Total
    doc.fontSize(12)
       .fillColor(template.colors.primary)
       .text('Total:', totalsX, totalsY)
       .text(this.formatCurrency(invoice.total, invoice.currency), totalsX + 100, totalsY, { align: 'right' });

    totalsY += 25;

    // Amount paid
    if (invoice.amountPaid > 0) {
      doc.fontSize(10)
         .fillColor(template.colors.text)
         .text('Amount Paid:', totalsX, totalsY)
         .text(this.formatCurrency(invoice.amountPaid, invoice.currency), totalsX + 100, totalsY, { align: 'right' });
      
      totalsY += 20;

      // Amount due
      doc.fontSize(12)
         .fillColor(template.colors.accent)
         .text('Amount Due:', totalsX, totalsY)
         .text(this.formatCurrency(invoice.amountDue, invoice.currency), totalsX + 100, totalsY, { align: 'right' });
    }
  }

  private renderNotesAndTerms(doc: PDFKit.PDFDocument, invoice: Invoice, template: InvoiceTemplate): void {
    let yPosition = doc.y + 40;

    // Notes
    if (invoice.notes) {
      doc.fontSize(11)
         .fillColor(template.colors.primary)
         .text('Notes', 50, yPosition);

      doc.fontSize(9)
         .fillColor(template.colors.text)
         .text(invoice.notes, 50, yPosition + 20, { width: 500 });

      yPosition += 20 + doc.heightOfString(invoice.notes, { width: 500 }) + 20;
    }

    // Terms
    if (invoice.terms) {
      doc.fontSize(11)
         .fillColor(template.colors.primary)
         .text('Terms & Conditions', 50, yPosition);

      doc.fontSize(9)
         .fillColor(template.colors.text)
         .text(invoice.terms, 50, yPosition + 20, { width: 500 });
    }
  }

  private renderFooter(doc: PDFKit.PDFDocument, invoice: Invoice, template: InvoiceTemplate): void {
    const footerY = doc.page.height - 100;

    doc.fontSize(8)
       .fillColor(template.colors.secondary)
       .text('Thank you for your business!', 50, footerY, { align: 'center', width: 500 })
       .text(`Invoice generated on ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 50, footerY + 15, { align: 'center', width: 500 })
       .text('Powered by FoodXchange', 50, footerY + 30, { align: 'center', width: 500 });
  }

  private async renderQRCode(doc: PDFKit.PDFDocument, invoice: Invoice): Promise<void> {
    // In production, generate actual QR code
    const qrData = {
      invoiceId: invoice.id,
      amount: invoice.total,
      currency: invoice.currency,
      url: invoice.publicUrl
    };

    // Placeholder for QR code
    doc.rect(450, doc.y - 100, 80, 80)
       .stroke('#000000')
       .fontSize(8)
       .text('QR Code', 465, doc.y - 50);
  }

  private renderWatermark(doc: PDFKit.PDFDocument, text: string): void {
    doc.save()
       .rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] })
       .fontSize(60)
       .fillColor('#cccccc')
       .opacity(0.3)
       .text(text, 0, doc.page.height / 2, { align: 'center', width: doc.page.width })
       .restore();
  }

  // Helper methods
  private generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const number = this.invoiceCounter.toString().padStart(5, '0');
    this.invoiceCounter++;
    return `INV-${year}-${number}`;
  }

  private async getLastInvoiceNumber(): Promise<string | null> {
    // In production, query from database
    return null;
  }

  private formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  private getDefaultTerms(): string {
    return 'Payment is due within 30 days of invoice date. Late payments may incur interest charges.';
  }

  private recalculateTotals(invoice: Invoice): void {
    // Recalculate subtotal
    invoice.subtotal = invoice.items.reduce((sum, item) => sum + item.subtotal, 0);

    // Recalculate tax
    const taxAmount = invoice.tax ? invoice.tax.reduce((sum, tax) => {
      return sum + (tax.inclusive ? 0 : invoice.subtotal * (tax.rate / 100));
    }, 0) : 0;

    // Recalculate discount
    const discountAmount = invoice.discount ? (
      invoice.discount.type === 'percentage' 
        ? invoice.subtotal * (invoice.discount.value / 100)
        : invoice.discount.value
    ) : 0;

    invoice.total = invoice.subtotal + taxAmount - discountAmount;
    invoice.amountDue = invoice.total - invoice.amountPaid;
  }

  private async uploadInvoicePDF(invoiceId: string, pdfBuffer: Buffer): Promise<string> {
    const filename = `invoices/${invoiceId}/invoice.pdf`;
    return await azureStorageService.uploadDocument(filename, pdfBuffer, 'pdf');
  }

  private async generatePublicUrl(invoiceId: string): Promise<string> {
    // In production, generate secure public URL
    return `https://invoices.foodxchange.com/view/${invoiceId}`;
  }

  private async sendInvoiceEmail(invoice: Invoice, options: any): Promise<void> {
    // In production, integrate with email service
    productionLogger.info('Invoice email sent', {
      invoiceId: invoice.id,
      to: invoice.to.email
    });
  }

  private async sendReminderEmail(invoice: Invoice, options: any): Promise<void> {
    // In production, integrate with email service
    productionLogger.info('Reminder email sent', {
      invoiceId: invoice.id,
      to: invoice.to.email
    });
  }
}

export const invoiceGenerationService = InvoiceGenerationService.getInstance();