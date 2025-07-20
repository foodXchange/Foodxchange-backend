import { Category } from '../../models/Category';
import { Context } from '../context';

export const categoryResolvers = {
  Query: {
    categories: async () => {
      return Category.find({ parent: null })
        .populate('children')
        .lean();
    },

    category: async (_: any, { id }: any, context: Context) => {
      return context.dataloaders.categoryLoader.load(id);
    }
  },

  Category: {
    parent: async (category: any, _: any, context: Context) => {
      if (!category.parent) return null;
      if (category.parent._id) return category.parent;
      return context.dataloaders.categoryLoader.load(category.parent);
    },

    children: async (category: any) => {
      if (category.children?.length) return category.children;
      return Category.find({ parent: category._id }).lean();
    },

    productCount: async (category: any) => {
      const { Product } = await import('../../models/Product');
      return Product.countDocuments({ category: category._id });
    }
  }
};
