import { Query, Schema } from 'mongoose';

import { Logger } from '../../core/logging/logger';

const logger = new Logger('QueryHooks');

/**
 * Add query optimization hooks to a schema
 */
export function addQueryOptimizationHooks(schema: Schema) {
  // Pre-find hooks to add lean() by default for better performance
  schema.pre(['find', 'findOne', 'findOneAndUpdate'], function() {
    const query = this;

    // Add lean() for read operations unless populate is used
    if (!query.getOptions().populate && !query.getOptions().lean) {
      query.lean();
    }

    // Add query timeout
    query.maxTimeMS(10000); // 10 second timeout
  });

  // Add index hints for common queries
  schema.pre('find', function() {
    const query = this;
    const filter = query.getFilter();

    // Use tenant index for tenant-scoped queries
    if (filter.tenantId && filter.status) {
      query.hint({ tenantId: 1, status: 1, isPublished: 1 });
    }

    // Use text index for text search
    if (filter.$text) {
      query.hint({ '$**': 'text' });
    }
  });

  // Post-find hooks for monitoring
  schema.post(['find', 'findOne'], function(result: any) {
    const query = this;
    const {executionTime} = (query as any);

    if (executionTime > 100) {
      logger.warn('Slow query detected', {
        model: query.model.modelName,
        filter: query.getFilter(),
        executionTime
      });
    }
  });
}

/**
 * Add pagination helpers to schema
 */
export function addPaginationMethods(schema: Schema) {
  schema.statics.paginate = async function(
    filter: any = {},
    options: {
      page?: number;
      limit?: number;
      sort?: any;
      select?: string;
      populate?: any;
    } = {}
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const query = this.find(filter);

    if (options.sort) query.sort(options.sort);
    if (options.select) query.select(options.select);
    if (options.populate) query.populate(options.populate);

    const [data, total] = await Promise.all([
      query.skip(skip).limit(limit).lean().exec(),
      this.countDocuments(filter).exec()
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        hasMore: page < Math.ceil(total / limit)
      }
    };
  };
}

/**
 * Add caching hooks
 */
export function addCachingHooks(schema: Schema, cacheKeyPrefix: string) {
  // Clear cache on save/update/delete
  schema.post('save', async (doc: any) => {
    const cacheKey = `${cacheKeyPrefix}:${doc._id}`;
    logger.debug(`Clearing cache for ${cacheKey}`);
    // Cache clearing would be implemented here
  });

  schema.post('findOneAndUpdate', async (doc: any) => {
    if (doc) {
      const cacheKey = `${cacheKeyPrefix}:${doc._id}`;
      logger.debug(`Clearing cache for ${cacheKey}`);
      // Cache clearing would be implemented here
    }
  });

  schema.post('findOneAndDelete', async (doc: any) => {
    if (doc) {
      const cacheKey = `${cacheKeyPrefix}:${doc._id}`;
      logger.debug(`Clearing cache for ${cacheKey}`);
      // Cache clearing would be implemented here
    }
  });
}

/**
 * Add field selection optimization
 */
export function addFieldSelectionOptimization(schema: Schema) {
  // Define field sets for common use cases
  const fieldSets = {
    list: '-__v -customAttributes -integrations',
    detail: '-__v',
    minimal: '_id name status',
    public: '-__v -customAttributes -integrations -createdBy -updatedBy'
  };

  schema.statics.selectFields = function(fieldSet: keyof typeof fieldSets) {
    return (this as any).select(fieldSets[fieldSet]);
  };
}

/**
 * Add aggregation helpers
 */
export function addAggregationHelpers(schema: Schema) {
  schema.statics.aggregatePaginate = async function(
    pipeline: any[],
    options: {
      page?: number;
      limit?: number;
    } = {}
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    // Add pagination stages
    const paginationPipeline = [
      ...pipeline,
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skip }, { $limit: limit }]
        }
      },
      {
        $project: {
          data: 1,
          total: { $arrayElemAt: ['$metadata.total', 0] }
        }
      }
    ];

    const [result] = await this.aggregate(paginationPipeline).exec();

    return {
      data: result?.data || [],
      pagination: {
        total: result?.total || 0,
        page,
        pages: Math.ceil((result?.total || 0) / limit),
        hasMore: page < Math.ceil((result?.total || 0) / limit)
      }
    };
  };
}
