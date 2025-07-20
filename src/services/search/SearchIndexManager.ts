import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { User } from '../../models/User';

import { elasticsearchService } from './ElasticsearchService';

const logger = new Logger('SearchIndexManager');

export class SearchIndexManager {
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await elasticsearchService.initialize();
      this.setupEventListeners();
      this.isInitialized = true;
      logger.info('Search index manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize search index manager', error);
      throw error;
    }
  }

  // Setup MongoDB change stream listeners for real-time indexing
  private setupEventListeners(): void {
    // Product change streams
    this.setupProductChangeStream();
    this.setupCompanyChangeStream();
    this.setupUserChangeStream();
    this.setupOrderChangeStream();
  }

  private setupProductChangeStream(): void {
    try {
      const productChangeStream = Product.watch([
        {
          $match: {
            operationType: { $in: ['insert', 'update', 'delete'] }
          }
        }
      ]);

      productChangeStream.on('change', async (change) => {
        try {
          await this.handleProductChange(change);
        } catch (error) {
          logger.error('Failed to handle product change', { change, error });
        }
      });

      logger.info('Product change stream established');
    } catch (error) {
      logger.warn('Could not establish product change stream', error);
    }
  }

  private setupCompanyChangeStream(): void {
    try {
      const companyChangeStream = Company.watch([
        {
          $match: {
            operationType: { $in: ['insert', 'update', 'delete'] }
          }
        }
      ]);

      companyChangeStream.on('change', async (change) => {
        try {
          await this.handleCompanyChange(change);
        } catch (error) {
          logger.error('Failed to handle company change', { change, error });
        }
      });

      logger.info('Company change stream established');
    } catch (error) {
      logger.warn('Could not establish company change stream', error);
    }
  }

  private setupUserChangeStream(): void {
    try {
      const userChangeStream = User.watch([
        {
          $match: {
            operationType: { $in: ['insert', 'update', 'delete'] }
          }
        }
      ]);

      userChangeStream.on('change', async (change) => {
        try {
          await this.handleUserChange(change);
        } catch (error) {
          logger.error('Failed to handle user change', { change, error });
        }
      });

      logger.info('User change stream established');
    } catch (error) {
      logger.warn('Could not establish user change stream', error);
    }
  }

  private setupOrderChangeStream(): void {
    try {
      const orderChangeStream = Order.watch([
        {
          $match: {
            operationType: { $in: ['insert', 'update', 'delete'] }
          }
        }
      ]);

      orderChangeStream.on('change', async (change) => {
        try {
          await this.handleOrderChange(change);
        } catch (error) {
          logger.error('Failed to handle order change', { change, error });
        }
      });

      logger.info('Order change stream established');
    } catch (error) {
      logger.warn('Could not establish order change stream', error);
    }
  }

  // Change handlers
  private async handleProductChange(change: any): Promise<void> {
    const documentId = change.documentKey._id.toString();

    switch (change.operationType) {
      case 'insert':
      case 'update':
        const product = await Product.findById(documentId)
          .populate('supplier', 'name location rating')
          .exec();

        if (product && product.status === 'ACTIVE') {
          const indexDocument = this.transformProductForIndex(product);
          await elasticsearchService.indexDocument('products', documentId, indexDocument);
          logger.debug('Product indexed', { productId: documentId });
        } else if (product && product.status !== 'ACTIVE') {
          await elasticsearchService.deleteDocument('products', documentId);
          logger.debug('Inactive product removed from index', { productId: documentId });
        }
        break;

      case 'delete':
        await elasticsearchService.deleteDocument('products', documentId);
        logger.debug('Product removed from index', { productId: documentId });
        break;
    }
  }

  private async handleCompanyChange(change: any): Promise<void> {
    const documentId = change.documentKey._id.toString();

    switch (change.operationType) {
      case 'insert':
      case 'update':
        const company = await Company.findById(documentId).exec();

        if (company && company.active) {
          const indexDocument = this.transformCompanyForIndex(company);
          await elasticsearchService.indexDocument('companies', documentId, indexDocument);
          logger.debug('Company indexed', { companyId: documentId });
        } else if (company && !company.active) {
          await elasticsearchService.deleteDocument('companies', documentId);
          logger.debug('Inactive company removed from index', { companyId: documentId });
        }
        break;

      case 'delete':
        await elasticsearchService.deleteDocument('companies', documentId);
        logger.debug('Company removed from index', { companyId: documentId });
        break;
    }
  }

  private async handleUserChange(change: any): Promise<void> {
    const documentId = change.documentKey._id.toString();

    switch (change.operationType) {
      case 'insert':
      case 'update':
        const user = await User.findById(documentId)
          .populate('company', 'name type')
          .exec();

        if (user && user.active) {
          const indexDocument = this.transformUserForIndex(user);
          await elasticsearchService.indexDocument('users', documentId, indexDocument);
          logger.debug('User indexed', { userId: documentId });
        } else if (user && !user.active) {
          await elasticsearchService.deleteDocument('users', documentId);
          logger.debug('Inactive user removed from index', { userId: documentId });
        }
        break;

      case 'delete':
        await elasticsearchService.deleteDocument('users', documentId);
        logger.debug('User removed from index', { userId: documentId });
        break;
    }
  }

  private async handleOrderChange(change: any): Promise<void> {
    const documentId = change.documentKey._id.toString();

    switch (change.operationType) {
      case 'insert':
      case 'update':
        const order = await Order.findById(documentId)
          .populate('buyer', 'name company')
          .populate('supplier', 'name company')
          .populate('items.product', 'name category')
          .exec();

        if (order) {
          const indexDocument = this.transformOrderForIndex(order);
          await elasticsearchService.indexDocument('orders', documentId, indexDocument);
          logger.debug('Order indexed', { orderId: documentId });
        }
        break;

      case 'delete':
        await elasticsearchService.deleteDocument('orders', documentId);
        logger.debug('Order removed from index', { orderId: documentId });
        break;
    }
  }

  // Bulk indexing methods
  async indexAllProducts(): Promise<number> {
    let indexed = 0;
    const batchSize = 100;
    let skip = 0;

    while (true) {
      const products = await Product.find({ status: 'ACTIVE' })
        .populate('supplier', 'name location rating')
        .skip(skip)
        .limit(batchSize)
        .exec();

      if (products.length === 0) break;

      const documents = products.map(product => ({
        id: product._id.toString(),
        document: this.transformProductForIndex(product)
      }));

      await elasticsearchService.bulkIndex('products', documents);
      indexed += products.length;
      skip += batchSize;

      logger.info(`Indexed ${indexed} products so far`);
    }

    logger.info(`Completed product indexing: ${indexed} products`);
    return indexed;
  }

  async indexAllCompanies(): Promise<number> {
    let indexed = 0;
    const batchSize = 100;
    let skip = 0;

    while (true) {
      const companies = await Company.find({ active: true })
        .skip(skip)
        .limit(batchSize)
        .exec();

      if (companies.length === 0) break;

      const documents = companies.map(company => ({
        id: company._id.toString(),
        document: this.transformCompanyForIndex(company)
      }));

      await elasticsearchService.bulkIndex('companies', documents);
      indexed += companies.length;
      skip += batchSize;

      logger.info(`Indexed ${indexed} companies so far`);
    }

    logger.info(`Completed company indexing: ${indexed} companies`);
    return indexed;
  }

  async indexAllUsers(): Promise<number> {
    let indexed = 0;
    const batchSize = 100;
    let skip = 0;

    while (true) {
      const users = await User.find({ active: true })
        .populate('company', 'name type')
        .skip(skip)
        .limit(batchSize)
        .exec();

      if (users.length === 0) break;

      const documents = users.map(user => ({
        id: user._id.toString(),
        document: this.transformUserForIndex(user)
      }));

      await elasticsearchService.bulkIndex('users', documents);
      indexed += users.length;
      skip += batchSize;

      logger.info(`Indexed ${indexed} users so far`);
    }

    logger.info(`Completed user indexing: ${indexed} users`);
    return indexed;
  }

  async indexAllOrders(): Promise<number> {
    let indexed = 0;
    const batchSize = 100;
    let skip = 0;

    while (true) {
      const orders = await Order.find()
        .populate('buyer', 'name company')
        .populate('supplier', 'name company')
        .populate('items.product', 'name category')
        .skip(skip)
        .limit(batchSize)
        .exec();

      if (orders.length === 0) break;

      const documents = orders.map(order => ({
        id: order._id.toString(),
        document: this.transformOrderForIndex(order)
      }));

      await elasticsearchService.bulkIndex('orders', documents);
      indexed += orders.length;
      skip += batchSize;

      logger.info(`Indexed ${indexed} orders so far`);
    }

    logger.info(`Completed order indexing: ${indexed} orders`);
    return indexed;
  }

  async reindexAll(): Promise<{ products: number; companies: number; users: number; orders: number }> {
    logger.info('Starting complete reindexing');

    const results = {
      products: await this.indexAllProducts(),
      companies: await this.indexAllCompanies(),
      users: await this.indexAllUsers(),
      orders: await this.indexAllOrders()
    };

    logger.info('Complete reindexing finished', results);
    return results;
  }

  // Document transformation methods
  private transformProductForIndex(product: any): any {
    return {
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      currency: product.currency,
      unit: product.unit,
      supplier: {
        id: product.supplier._id?.toString(),
        name: product.supplier.name,
        location: product.supplier.location?.coordinates,
        rating: product.supplier.rating
      },
      inventory: product.inventory,
      tags: product.tags || [],
      certifications: product.certifications || [],
      nutritionalInfo: product.nutritionalInfo,
      images: product.images || [],
      qualityScore: product.qualityScore || 0,
      popularityScore: product.popularityScore || 0,
      seasonality: product.seasonality,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      status: product.status,
      location: product.location?.coordinates
    };
  }

  private transformCompanyForIndex(company: any): any {
    return {
      name: company.name,
      description: company.description,
      type: company.type,
      industry: company.industry,
      size: company.size,
      location: {
        address: company.address?.full,
        city: company.address?.city,
        state: company.address?.state,
        country: company.address?.country,
        zipCode: company.address?.zipCode,
        coordinates: company.location?.coordinates
      },
      contact: {
        email: company.contactInfo?.email,
        phone: company.contactInfo?.phone,
        website: company.website
      },
      certifications: company.certifications || [],
      rating: company.rating || 0,
      reviewCount: company.reviewCount || 0,
      verified: company.verified || false,
      active: company.active,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt
    };
  }

  private transformUserForIndex(user: any): any {
    return {
      name: user.name,
      email: user.email,
      role: user.role,
      company: {
        id: user.company?._id?.toString(),
        name: user.company?.name,
        type: user.company?.type
      },
      profile: {
        title: user.profile?.title,
        bio: user.profile?.bio,
        expertise: user.profile?.expertise || [],
        interests: user.profile?.interests || [],
        location: user.profile?.location?.coordinates
      },
      active: user.active,
      verified: user.verified || false,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt
    };
  }

  private transformOrderForIndex(order: any): any {
    return {
      orderNumber: order.orderNumber,
      buyer: {
        id: order.buyer._id.toString(),
        name: order.buyer.name,
        company: order.buyer.company?.name
      },
      supplier: {
        id: order.supplier._id.toString(),
        name: order.supplier.name,
        company: order.supplier.company?.name
      },
      items: order.items.map((item: any) => ({
        productId: item.product._id.toString(),
        productName: item.product.name,
        category: item.product.category,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice
      })),
      totalAmount: order.totalAmount,
      currency: order.currency,
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryDate: order.deliveryDate,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    return await elasticsearchService.isHealthy();
  }

  // Cleanup
  async close(): Promise<void> {
    await elasticsearchService.close();
    this.isInitialized = false;
    logger.info('Search index manager closed');
  }
}

export const searchIndexManager = new SearchIndexManager();
