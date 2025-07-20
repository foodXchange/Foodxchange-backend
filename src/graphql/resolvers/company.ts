import { AuthenticationError } from 'apollo-server-express';

import { Company } from '../../models/Company';
import { Context } from '../context';

export const companyResolvers = {
  Query: {
    company: async (_: any, { id }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      return context.dataloaders.companyLoader.load(id);
    },

    companies: async (_: any, { verified, limit = 20, offset = 0 }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      const query: any = {};
      if (verified !== undefined) query.verified = verified;

      return Company.find(query)
        .skip(offset)
        .limit(limit)
        .lean();
    }
  },

  Mutation: {
    updateCompanyInfo: async (_: any, { input }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      const company = await Company.findByIdAndUpdate(
        context.user.company,
        { $set: input },
        { new: true, runValidators: true }
      );

      return company;
    }
  },

  Company: {
    products: async (company: any, _: any, context: Context) => {
      const products = await context.dataloaders.productsBySupplierLoader.load(company._id);

      return {
        edges: products.map((product: any) => ({
          node: product,
          cursor: Buffer.from(product._id.toString()).toString('base64')
        })),
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          totalCount: products.length
        }
      };
    }
  }
};
