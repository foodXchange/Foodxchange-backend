import DataLoader from 'dataloader';
import { Types } from 'mongoose';

import { Category } from '../../models/Category';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { Proposal } from '../../models/Proposal';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';


// Batch loading functions
const batchUsers = async (userIds: readonly string[]) => {
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const userMap = new Map(users.map(user => [user._id.toString(), user]));
  return userIds.map(id => userMap.get(id) || null);
};

const batchProducts = async (productIds: readonly string[]) => {
  const products = await Product.find({ _id: { $in: productIds } })
    .populate('category')
    .populate('supplier')
    .lean();
  const productMap = new Map(products.map(product => [product._id.toString(), product]));
  return productIds.map(id => productMap.get(id) || null);
};

const batchCompanies = async (companyIds: readonly string[]) => {
  const companies = await Company.find({ _id: { $in: companyIds } }).lean();
  const companyMap = new Map(companies.map(company => [company._id.toString(), company]));
  return companyIds.map(id => companyMap.get(id) || null);
};

const batchCategories = async (categoryIds: readonly string[]) => {
  const categories = await Category.find({ _id: { $in: categoryIds } }).lean();
  const categoryMap = new Map(categories.map(category => [category._id.toString(), category]));
  return categoryIds.map(id => categoryMap.get(id) || null);
};

const batchOrders = async (orderIds: readonly string[]) => {
  const orders = await Order.find({ _id: { $in: orderIds } })
    .populate('buyer')
    .populate('seller')
    .populate('items.product')
    .lean();
  const orderMap = new Map(orders.map(order => [order._id.toString(), order]));
  return orderIds.map(id => orderMap.get(id) || null);
};

const batchRFQs = async (rfqIds: readonly string[]) => {
  const rfqs = await RFQ.find({ _id: { $in: rfqIds } })
    .populate('buyer')
    .populate('category')
    .lean();
  const rfqMap = new Map(rfqs.map(rfq => [rfq._id.toString(), rfq]));
  return rfqIds.map(id => rfqMap.get(id) || null);
};

const batchProposals = async (proposalIds: readonly string[]) => {
  const proposals = await Proposal.find({ _id: { $in: proposalIds } })
    .populate('rfq')
    .populate('supplier')
    .populate('items.product')
    .lean();
  const proposalMap = new Map(proposals.map(proposal => [proposal._id.toString(), proposal]));
  return proposalIds.map(id => proposalMap.get(id) || null);
};

// Batch loading for related data
const batchProductsBySupplier = async (supplierIds: readonly string[]) => {
  const products = await Product.find({ supplier: { $in: supplierIds } })
    .populate('category')
    .lean();

  const productsBySupplier = new Map<string, any[]>();
  products.forEach(product => {
    const supplierId = product.supplier.toString();
    if (!productsBySupplier.has(supplierId)) {
      productsBySupplier.set(supplierId, []);
    }
    productsBySupplier.get(supplierId).push(product);
  });

  return supplierIds.map(id => productsBySupplier.get(id) || []);
};

const batchOrdersByBuyer = async (buyerIds: readonly string[]) => {
  const orders = await Order.find({ buyer: { $in: buyerIds } })
    .populate('seller')
    .populate('items.product')
    .sort('-createdAt')
    .lean();

  const ordersByBuyer = new Map<string, any[]>();
  orders.forEach(order => {
    const buyerId = order.buyer.toString();
    if (!ordersByBuyer.has(buyerId)) {
      ordersByBuyer.set(buyerId, []);
    }
    ordersByBuyer.get(buyerId).push(order);
  });

  return buyerIds.map(id => ordersByBuyer.get(id) || []);
};

const batchProposalsByRFQ = async (rfqIds: readonly string[]) => {
  const proposals = await Proposal.find({ rfq: { $in: rfqIds } })
    .populate('supplier')
    .populate('items.product')
    .lean();

  const proposalsByRFQ = new Map<string, any[]>();
  proposals.forEach(proposal => {
    const rfqId = proposal.rfq.toString();
    if (!proposalsByRFQ.has(rfqId)) {
      proposalsByRFQ.set(rfqId, []);
    }
    proposalsByRFQ.get(rfqId).push(proposal);
  });

  return rfqIds.map(id => proposalsByRFQ.get(id) || []);
};

// Create DataLoader instances
export function createDataLoaders() {
  return {
    // Entity loaders
    userLoader: new DataLoader(batchUsers),
    productLoader: new DataLoader(batchProducts),
    companyLoader: new DataLoader(batchCompanies),
    categoryLoader: new DataLoader(batchCategories),
    orderLoader: new DataLoader(batchOrders),
    rfqLoader: new DataLoader(batchRFQs),
    proposalLoader: new DataLoader(batchProposals),

    // Relationship loaders
    productsBySupplierLoader: new DataLoader(batchProductsBySupplier),
    ordersByBuyerLoader: new DataLoader(batchOrdersByBuyer),
    proposalsByRFQLoader: new DataLoader(batchProposalsByRFQ),

    // Clear all caches
    clearAll() {
      this.userLoader.clearAll();
      this.productLoader.clearAll();
      this.companyLoader.clearAll();
      this.categoryLoader.clearAll();
      this.orderLoader.clearAll();
      this.rfqLoader.clearAll();
      this.proposalLoader.clearAll();
      this.productsBySupplierLoader.clearAll();
      this.ordersByBuyerLoader.clearAll();
      this.proposalsByRFQLoader.clearAll();
    }
  };
}
