import { Model, Document, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';
import { Logger } from '../../core/logging/logger';
import { NotFoundError } from '../../core/errors';

export interface IBaseRepository<T extends Document> {
  findAll(filter?: FilterQuery<T>, options?: QueryOptions): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  findOne(filter: FilterQuery<T>): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: UpdateQuery<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  count(filter?: FilterQuery<T>): Promise<number>;
  exists(filter: FilterQuery<T>): Promise<boolean>;
}

export abstract class BaseRepository<T extends Document> implements IBaseRepository<T> {
  protected model: Model<T>;
  protected logger: Logger;

  constructor(model: Model<T>, loggerContext: string) {
    this.model = model;
    this.logger = new Logger(loggerContext);
  }

  async findAll(filter: FilterQuery<T> = {}, options: QueryOptions = {}): Promise<T[]> {
    try {
      const query = this.model.find(filter);
      
      if (options.sort) query.sort(options.sort);
      if (options.limit) query.limit(options.limit);
      if (options.skip) query.skip(options.skip);
      if (options.populate) query.populate(options.populate);
      
      const results = await query.lean().exec();
      this.logger.debug(`Found ${results.length} documents`, { filter });
      return results as T[];
    } catch (error) {
      this.logger.error('Error in findAll:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<T | null> {
    try {
      const result = await this.model.findById(id).lean().exec();
      if (!result) {
        this.logger.debug(`Document not found with id: ${id}`);
      }
      return result as T | null;
    } catch (error) {
      this.logger.error(`Error finding document by id ${id}:`, error);
      throw error;
    }
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    try {
      const result = await this.model.findOne(filter).lean().exec();
      return result as T | null;
    } catch (error) {
      this.logger.error('Error in findOne:', error);
      throw error;
    }
  }

  async create(data: Partial<T>): Promise<T> {
    try {
      const document = new this.model(data);
      const result = await document.save();
      this.logger.info(`Created new document with id: ${result._id}`);
      return result;
    } catch (error) {
      this.logger.error('Error creating document:', error);
      throw error;
    }
  }

  async update(id: string, data: UpdateQuery<T>): Promise<T | null> {
    try {
      const result = await this.model.findByIdAndUpdate(
        id,
        data,
        { new: true, runValidators: true }
      ).exec();
      
      if (!result) {
        this.logger.debug(`Document not found for update with id: ${id}`);
      } else {
        this.logger.info(`Updated document with id: ${id}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error updating document with id ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.model.findByIdAndDelete(id).exec();
      if (result) {
        this.logger.info(`Deleted document with id: ${id}`);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Error deleting document with id ${id}:`, error);
      throw error;
    }
  }

  async count(filter: FilterQuery<T> = {}): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error) {
      this.logger.error('Error counting documents:', error);
      throw error;
    }
  }

  async exists(filter: FilterQuery<T>): Promise<boolean> {
    try {
      const count = await this.model.countDocuments(filter).limit(1).exec();
      return count > 0;
    } catch (error) {
      this.logger.error('Error checking existence:', error);
      throw error;
    }
  }

  // Pagination helper
  async paginate(
    filter: FilterQuery<T> = {},
    page: number = 1,
    limit: number = 20,
    sort: any = { createdAt: -1 }
  ): Promise<{
    data: T[];
    total: number;
    page: number;
    pages: number;
    hasMore: boolean;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      const [data, total] = await Promise.all([
        this.findAll(filter, { skip, limit, sort }),
        this.count(filter)
      ]);
      
      const pages = Math.ceil(total / limit);
      
      return {
        data,
        total,
        page,
        pages,
        hasMore: page < pages
      };
    } catch (error) {
      this.logger.error('Error in paginate:', error);
      throw error;
    }
  }

  // Bulk operations
  async createMany(data: Partial<T>[]): Promise<T[]> {
    try {
      const results = await this.model.insertMany(data);
      this.logger.info(`Created ${results.length} documents`);
      return results;
    } catch (error) {
      this.logger.error('Error in createMany:', error);
      throw error;
    }
  }

  async updateMany(filter: FilterQuery<T>, data: UpdateQuery<T>): Promise<number> {
    try {
      const result = await this.model.updateMany(filter, data).exec();
      this.logger.info(`Updated ${result.modifiedCount} documents`);
      return result.modifiedCount;
    } catch (error) {
      this.logger.error('Error in updateMany:', error);
      throw error;
    }
  }

  async deleteMany(filter: FilterQuery<T>): Promise<number> {
    try {
      const result = await this.model.deleteMany(filter).exec();
      this.logger.info(`Deleted ${result.deletedCount} documents`);
      return result.deletedCount;
    } catch (error) {
      this.logger.error('Error in deleteMany:', error);
      throw error;
    }
  }
}