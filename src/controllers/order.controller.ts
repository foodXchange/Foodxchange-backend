import { Request, Response } from 'express';

import { AuthRequest } from '../middleware/auth.middleware';
import { Order } from '../models/Order';
import { RFQ } from '../models/RFQ';

// @desc    Create order from accepted RFQ proposal
// @route   POST /api/orders/from-rfq
// @access  Private
export const createOrderFromRFQ = async (req: AuthRequest, res: Response) => {
  try {
    const { rfqId, proposalId } = req.body;

    // Find the RFQ
    const rfq = await RFQ.findById(rfqId);
    if (!rfq) {
      return res.status(404).json({
        success: false,
        error: 'RFQ not found'
      });
    }

    // Verify the user is the RFQ owner
    if (rfq.buyer.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to create order from this RFQ'
      });
    }

    // Find the accepted quote/proposal
    const proposal = rfq.quotes.find(q => q._id?.toString() === proposalId);
    if (!proposal || proposal.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        error: 'Proposal not found or not accepted'
      });
    }

    // Create order
    const order = await Order.create({
      buyer: rfq.buyer,
      supplier: proposal.supplier,
      rfq: rfq._id,
      proposal: proposal._id,
      items: proposal.items || [{
        name: rfq.title,
        quantity: rfq.items[0]?.quantity || 1,
        unit: rfq.items[0]?.unit || 'unit',
        price: proposal.totalAmount / (rfq.items[0]?.quantity || 1),
        totalPrice: proposal.totalPrice
      }],
      totalAmount: proposal.totalPrice,
      deliveryTerms: proposal.deliveryTerms,
      paymentTerms: proposal.paymentTerms,
      status: 'pending',
      timeline: {
        created: new Date(),
        expectedDelivery: proposal.deliveryDate
      }
    });

    // Update RFQ status
    rfq.status = 'awarded';
    // Link the order to the RFQ
    await rfq.save();

    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error: any) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error creating order'
    });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private
export const getOrders = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      role,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter based on user role
    const filter: any = {};

    // If buyer, show their orders; if supplier, show orders to them
    if (role === 'buyer') {
      filter.buyer = req.userId;
    } else if (role === 'supplier') {
      filter.supplier = req.userId;
    } else {
      // Show all orders for the user (both as buyer and supplier)
      filter.$or = [
        { buyer: req.userId },
        { supplier: req.userId }
      ];
    }

    if (status) filter.status = status;

    // Pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const orders = await Order.find(filter)
      .populate('buyer', 'name email company')
      .populate('supplier', 'name email company')
      .populate('rfq', 'title category')
      .sort({ [sortBy as string]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching orders'
    });
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private (Order participants only)
export const getOrder = async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('buyer', 'name email company phone')
      .populate('supplier', 'name email company phone')
      .populate('rfq')
      .populate('shipments');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if user is part of the order
    if (
      order.buyer._id.toString() !== req.userId &&
      order.supplier._id.toString() !== req.userId
    ) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this order'
      });
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error: any) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching order'
    });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { status, notes } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check authorization based on status change
    const isBuyer = order.buyer.toString() === req.userId;
    const isSupplier = order.supplier.toString() === req.userId;

    // Define who can make which status changes
    const statusPermissions = {
      confirmed: ['supplier'],
      processing: ['supplier'],
      shipped: ['supplier'],
      delivered: ['supplier'],
      received: ['buyer'],
      completed: ['buyer', 'supplier'],
      cancelled: ['buyer', 'supplier'],
      disputed: ['buyer', 'supplier']
    };

    const allowedRoles = statusPermissions[status as keyof typeof statusPermissions];
    const userRole = isBuyer ? 'buyer' : isSupplier ? 'supplier' : null;

    if (!userRole || !allowedRoles?.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to make this status change'
      });
    }

    // Update status
    order.status = status;

    // Update timeline
    const timelineUpdate: any = {};
    switch (status) {
      case 'confirmed':
        timelineUpdate.confirmed = new Date();
        break;
      case 'shipped':
        timelineUpdate.shipped = new Date();
        break;
      case 'delivered':
        timelineUpdate.delivered = new Date();
        break;
      case 'completed':
        timelineUpdate.completed = new Date();
        break;
      case 'cancelled':
        timelineUpdate.cancelled = new Date();
        break;
    }

    // Update order dates based on status
    if (status === 'shipped' && timelineUpdate.shippedAt) {
      order.shippingDate = timelineUpdate.shippedAt;
    } else if (status === 'delivered' && timelineUpdate.deliveredAt) {
      order.deliveryDate = timelineUpdate.deliveredAt;
    }

    // Update order notes if provided
    if (notes) {
      order.notes = (order.notes || '') + `\n[${new Date().toISOString()}] Status changed to ${status}: ${notes}`;
    }

    await order.save();

    res.json({
      success: true,
      data: order
    });
  } catch (error: any) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error updating order status'
    });
  }
};

// @desc    Add shipment tracking
// @route   POST /api/orders/:id/shipment
// @access  Private (Supplier only)
export const addShipmentTracking = async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if user is the supplier
    if (order.supplier.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to add shipment tracking'
      });
    }

    // Add shipment info
    const shipment = {
      ...req.body,
      createdAt: new Date()
    };

    order.shipments.push(shipment);
    order.status = 'shipped';
    order.shippingDate = new Date();

    await order.save();

    res.json({
      success: true,
      message: 'Shipment tracking added',
      data: shipment
    });
  } catch (error: any) {
    console.error('Add shipment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error adding shipment tracking'
    });
  }
};

// @desc    Get order analytics
// @route   GET /api/orders/analytics
// @access  Private
export const getOrderAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { period = '30d', role } = req.query;

    // Calculate date range
    const days = parseInt(period.toString().replace('d', ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build match condition
    const matchCondition: any = {
      'timeline.created': { $gte: startDate }
    };

    if (role === 'buyer') {
      matchCondition.buyer = req.userId;
    } else if (role === 'supplier') {
      matchCondition.supplier = req.userId;
    } else {
      matchCondition.$or = [
        { buyer: req.userId },
        { supplier: req.userId }
      ];
    }

    // Get analytics
    const analytics = await Order.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalValue: { $sum: '$totalAmount' },
          avgOrderValue: { $avg: '$totalAmount' },
          statusCounts: {
            $push: '$status'
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          totalValue: 1,
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          statusBreakdown: {
            $arrayToObject: {
              $map: {
                input: { $setUnion: ['$statusCounts', []] },
                as: 'status',
                in: {
                  k: '$$status',
                  v: {
                    $size: {
                      $filter: {
                        input: '$statusCounts',
                        cond: { $eq: ['$$this', '$$status'] }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);

    const result = analytics[0] || {
      totalOrders: 0,
      totalValue: 0,
      avgOrderValue: 0,
      statusBreakdown: {}
    };

    res.json({
      success: true,
      data: {
        period,
        ...result
      }
    });
  } catch (error: any) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching analytics'
    });
  }
};
