import { AuthenticationError, UserInputError, ApolloError } from 'apollo-server-express';

import { Logger } from '../../core/logging/logger';
import { Category } from '../../models/Category';
import { Product } from '../../models/Product';
import { optimizedCache } from '../../services/cache/OptimizedCacheService';
import { imageOptimizationService } from '../../services/optimization/ImageOptimizationService';
import { Context } from '../context';

const logger = new Logger('ProductResolvers');

export const productResolvers = {
  Query: {
    product: async (_: any, { id }: any, context: Context) => {
      try {
        // Use dataloader for efficient loading
        return await context.dataloaders.productLoader.load(id);
      } catch (error) {
        logger.error('Failed to fetch product', error);
        throw new ApolloError('Failed to fetch product');
      }
    },

    products: async (_: any, args: any, context: Context) => {
      try {
        const { filter, first = 20, after, last, before } = args;

        // Build query
        const query: any = {};
        if (filter) {
          if (filter.categoryId) query.category = filter.categoryId;
          if (filter.status) query.status = filter.status;
          if (filter.supplierId) query.supplier = filter.supplierId;
          if (filter.tags?.length) query.tags = { $in: filter.tags };
          if (filter.search) {
            query.$text = { $search: filter.search };
          }
          if (filter.minPrice || filter.maxPrice) {
            query['price.amount'] = {};
            if (filter.minPrice) query['price.amount'].$gte = filter.minPrice;
            if (filter.maxPrice) query['price.amount'].$lte = filter.maxPrice;
          }
        }

        // Cache key
        const cacheKey = `products:${JSON.stringify({ query, first, after, last, before })}`;

        // Try cache first
        const cached = await optimizedCache.get(cacheKey);
        if (cached) {
          return cached;
        }

        // Pagination logic
        const limit = first || last || 20;
        const skip = 0;

        if (after) {
          const cursor = Buffer.from(after, 'base64').toString('ascii');
          const cursorDate = new Date(cursor);
          query.createdAt = { $lt: cursorDate };
        }

        if (before) {
          const cursor = Buffer.from(before, 'base64').toString('ascii');
          const cursorDate = new Date(cursor);
          query.createdAt = { $gt: cursorDate };
        }

        // Fetch products
        const products = await Product.find(query)
          .populate('category')
          .populate('supplier')
          .sort(last ? 'createdAt' : '-createdAt')
          .limit(limit + 1)
          .lean();

        // Check if there are more results
        const hasMore = products.length > limit;
        if (hasMore) {
          products.pop();
        }

        // Build connection
        const edges = products.map(product => ({
          node: product,
          cursor: Buffer.from(product.createdAt.toISOString()).toString('base64')
        }));

        const result = {
          edges,
          pageInfo: {
            hasNextPage: hasMore && !last,
            hasPreviousPage: hasMore && !first,
            startCursor: edges[0]?.cursor,
            endCursor: edges[edges.length - 1]?.cursor,
            totalCount: await Product.countDocuments(query)
          }
        };

        // Cache result
        await optimizedCache.set(cacheKey, result, { ttl: 300 }); // 5 minutes

        return result;
      } catch (error) {
        logger.error('Failed to fetch products', error);
        throw new ApolloError('Failed to fetch products');
      }
    },

    searchProducts: async (_: any, { query, limit = 10 }: any, context: Context) => {
      try {
        const products = await Product.find({
          $text: { $search: query }
        })
          .populate('category')
          .populate('supplier')
          .limit(limit)
          .lean();

        return products;
      } catch (error) {
        logger.error('Product search failed', error);
        throw new ApolloError('Search failed');
      }
    },

    recommendedProducts: async (_: any, { limit = 10 }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      try {
        // Get user's purchase history for recommendations
        const { ordersByBuyerLoader } = context.dataloaders;
        const orders = await ordersByBuyerLoader.load(context.user.company);

        // Extract categories from past orders
        const purchasedCategories = new Set();
        orders.forEach((order: any) => {
          order.items.forEach((item: any) => {
            if (item.product?.category) {
              purchasedCategories.add(item.product.category);
            }
          });
        });

        // Find products in similar categories
        const products = await Product.find({
          category: { $in: Array.from(purchasedCategories) },
          status: 'ACTIVE'
        })
          .populate('category')
          .populate('supplier')
          .sort('-createdAt')
          .limit(limit)
          .lean();

        return products;
      } catch (error) {
        logger.error('Failed to get recommendations', error);
        throw new ApolloError('Failed to get recommendations');
      }
    }
  },

  Mutation: {
    createProduct: async (_: any, { input }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'SELLER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        // Validate category
        const category = await Category.findById(input.categoryId);
        if (!category) {
          throw new UserInputError('Invalid category');
        }

        // Create product
        const product = new Product({
          ...input,
          category: input.categoryId,
          supplier: context.user.company,
          status: 'DRAFT'
        });

        await product.save();

        // Clear cache
        await optimizedCache.deletePattern('products:*');

        logger.info('Product created', {
          productId: product._id,
          userId: context.user.id
        });

        return product.populate(['category', 'supplier']);
      } catch (error) {
        logger.error('Failed to create product', error);
        throw error;
      }
    },

    updateProduct: async (_: any, { id, input }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'SELLER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const product = await Product.findById(id);
        if (!product) {
          throw new UserInputError('Product not found');
        }

        // Check ownership
        if (product.supplier.toString() !== context.user.company.toString()) {
          throw new AuthenticationError('Not authorized to update this product');
        }

        // Update product
        Object.assign(product, input);
        await product.save();

        // Clear cache
        await optimizedCache.deletePattern('products:*');
        context.dataloaders.productLoader.clear(id);

        logger.info('Product updated', { productId: id, userId: context.user.id });

        return product.populate(['category', 'supplier']);
      } catch (error) {
        logger.error('Failed to update product', error);
        throw error;
      }
    },

    deleteProduct: async (_: any, { id }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'SELLER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const product = await Product.findById(id);
        if (!product) {
          throw new UserInputError('Product not found');
        }

        // Check ownership
        if (product.supplier.toString() !== context.user.company.toString()) {
          throw new AuthenticationError('Not authorized to delete this product');
        }

        // Soft delete
        product.status = 'inactive';
        product.deletedAt = new Date();
        await product.save();

        // Clear cache
        await optimizedCache.deletePattern('products:*');
        context.dataloaders.productLoader.clear(id);

        logger.info('Product deleted', { productId: id, userId: context.user.id });

        return true;
      } catch (error) {
        logger.error('Failed to delete product', error);
        throw error;
      }
    },

    uploadProductImage: async (_: any, { productId, file }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'SELLER') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const product = await Product.findById(productId);
        if (!product) {
          throw new UserInputError('Product not found');
        }

        // Check ownership
        if (product.supplier.toString() !== context.user.company.toString()) {
          throw new AuthenticationError('Not authorized to update this product');
        }

        // Process upload
        const { createReadStream, filename, mimetype } = await file;
        const stream = createReadStream();

        // Convert stream to buffer
        const chunks: any[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // Optimize image
        const processed = await imageOptimizationService.processUploadedImage(
          buffer,
          filename,
          { width: 800, format: 'webp' }
        );

        // Generate variants
        await imageOptimizationService.generateResponsiveVariants(buffer, filename);

        // Save to storage (in real implementation, upload to cloud storage)
        const imageUrl = `/uploads/products/${filename}`;

        // Update product
        if (!product.images) {
          product.images = [];
        }
        product.images.push({
          url: imageUrl,
          alt: filename,
          isPrimary: product.images.length === 0,
          order: product.images.length
        });
        await product.save();

        logger.info('Product image uploaded', {
          productId,
          filename,
          userId: context.user.id
        });

        return imageUrl;
      } catch (error) {
        logger.error('Failed to upload product image', error);
        throw new ApolloError('Failed to upload image');
      }
    }
  },

  Product: {
    supplier: async (product: any, _: any, context: Context) => {
      if (product.supplier?._id) return product.supplier;
      return context.dataloaders.companyLoader.load(product.supplier);
    },

    category: async (product: any, _: any, context: Context) => {
      if (product.category?._id) return product.category;
      return context.dataloaders.categoryLoader.load(product.category);
    }
  }
};
