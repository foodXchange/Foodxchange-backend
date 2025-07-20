import { Request } from 'express';
import { Model, Document, FilterQuery } from 'mongoose';

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  populate?: string | string[];
  select?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class PaginationHelper {
  /**
   * Parse pagination options from request
   */
  static parseOptions(req: Request): PaginationOptions {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    return {
      page: Math.max(1, page),
      limit: Math.min(100, Math.max(1, limit)),
      sortBy,
      sortOrder
    };
  }

  /**
   * Paginate mongoose query
   */
  static async paginate<T extends Document>(
    model: Model<T>,
    filter: FilterQuery<T>,
    options: PaginationOptions
  ): Promise<PaginatedResult<T>> {
    const { page, limit, sortBy, sortOrder, populate, select } = options;
    const skip = (page - 1) * limit;

    // Build query
    let query = model.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 });

    // Add population if specified
    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach(path => {
          query = query.populate(path);
        });
      } else {
        query = query.populate(populate);
      }
    }

    // Add field selection if specified
    if (select) {
      query = query.select(select);
    }

    // Execute queries in parallel
    const [data, total] = await Promise.all([
      query.exec(),
      model.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Create pagination metadata
   */
  static createMetadata(
    page: number,
    limit: number,
    total: number
  ): PaginatedResult<any>['pagination'] {
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }

  /**
   * Paginate array
   */
  static paginateArray<T>(
    array: T[],
    page: number,
    limit: number
  ): PaginatedResult<T> {
    const total = array.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;

    return {
      data: array.slice(start, end),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Build sort object for MongoDB
   */
  static buildSortObject(
    sortBy: string | string[],
    sortOrder: 'asc' | 'desc' | ('asc' | 'desc')[]
  ): Record<string, 1 | -1> {
    if (typeof sortBy === 'string') {
      return { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    }

    const sortObject: Record<string, 1 | -1> = {};

    sortBy.forEach((field, index) => {
      const order = Array.isArray(sortOrder) ? sortOrder[index] || 'desc' : sortOrder;
      sortObject[field] = order === 'asc' ? 1 : -1;
    });

    return sortObject;
  }

  /**
   * Generate pagination links
   */
  static generateLinks(
    baseUrl: string,
    page: number,
    totalPages: number,
    queryParams: Record<string, any> = {}
  ): {
    first?: string;
    prev?: string;
    next?: string;
    last?: string;
  } {
    const buildUrl = (pageNum: number) => {
      const params = new URLSearchParams({ ...queryParams, page: pageNum.toString() });
      return `${baseUrl}?${params.toString()}`;
    };

    const links: any = {};

    if (page > 1) {
      links.first = buildUrl(1);
      links.prev = buildUrl(page - 1);
    }

    if (page < totalPages) {
      links.next = buildUrl(page + 1);
      links.last = buildUrl(totalPages);
    }

    return links;
  }
}
