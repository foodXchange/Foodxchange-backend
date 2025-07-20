const Proposal = require('../models/Proposal');
const RFQ = require('../models/RFQ');

// Create new proposal
exports.createProposal = async (req, res) => {
  try {
    const proposalData = {
      ...req.body,
      supplier: req.user._id,
      supplierCompany: req.user.company
    };

    const proposal = new Proposal(proposalData);
    await proposal.save();

    // Update RFQ proposal count
    await RFQ.findByIdAndUpdate(req.body.rfq, {
      $inc: { proposalCount: 1 }
    });

    res.status(201).json(proposal);
  } catch (error) {
    console.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
};

// Get proposals for an RFQ
exports.getProposalsByRFQ = async (req, res) => {
  try {
    const rfq = await RFQ.findById(req.params.rfqId);

    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    // Check if user has access
    if (rfq.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const proposals = await Proposal.find({ rfq: req.params.rfqId })
      .populate('supplier', 'name email')
      .populate('supplierCompany', 'name');

    res.json(proposals);
  } catch (error) {
    console.error('Error fetching proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
};

// Get single proposal
exports.getProposalById = async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id)
      .populate('rfq')
      .populate('supplier', 'name email')
      .populate('supplierCompany', 'name');

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check access
    const rfq = await RFQ.findById(proposal.rfq._id);
    if (proposal.supplier._id.toString() !== req.user._id.toString() &&
        rfq.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(proposal);
  } catch (error) {
    console.error('Error fetching proposal:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
};

// Accept proposal
exports.acceptProposal = async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id).populate('rfq');

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check if user owns the RFQ
    const rfq = await RFQ.findById(proposal.rfq._id);
    if (rfq.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    proposal.status = 'accepted';
    await proposal.save();

    // Update RFQ status
    rfq.status = 'completed';
    await rfq.save();

    // Create order from accepted proposal
    const Order = require('../models/Order');

    // Generate order number
    const orderCount = await Order.countDocuments();
    const orderNumber = `ORD-${new Date().getFullYear()}-${String(orderCount + 1).padStart(6, '0')}`;

    // Map proposal items to order items
    const orderItems = proposal.products.map((item) => ({
      productId: item.product,
      name: item.alternativeProduct?.name || 'Product',
      sku: item.product?.sku || 'SKU',
      description: item.alternativeProduct?.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice || (item.quantity * item.unitPrice),
      unit: item.unit,
      quantityOrdered: item.quantity,
      quantityShipped: 0,
      quantityDelivered: 0,
      quantityReturned: 0,
      quantityRejected: 0,
      status: 'pending',
      notes: item.notes
    }));

    // Create the order
    const order = new Order({
      orderNumber,
      rfqId: rfq._id,
      buyer: rfq.buyer,
      buyerCompany: rfq.buyerCompany,
      supplier: proposal.submittedBy,
      supplierCompany: proposal.supplier,
      tenantId: rfq.tenantId || 'default',
      items: orderItems,

      // Financial information
      subtotal: proposal.pricing.subtotal,
      taxAmount: proposal.pricing.taxes || 0,
      shippingCost: proposal.pricing.shipping || 0,
      discountAmount: 0,
      totalAmount: proposal.pricing.total,
      currency: proposal.pricing.currency || 'USD',

      // Payment information
      paymentTerms: {
        method: 'net30',
        customTerms: proposal.terms?.paymentTerms
      },
      paymentStatus: 'pending',

      // Delivery information from RFQ
      deliveryAddress: rfq.deliveryLocation,
      deliveryTerms: {
        incoterm: rfq.deliveryTerms?.incoterm || 'EXW',
        shippingMethod: rfq.deliveryTerms?.preferredShippingMethod || 'Standard',
        insuranceRequired: false,
        signatureRequired: true
      },
      deliverySchedule: {
        requestedDate: rfq.deliverySchedule?.requestedDate,
        estimatedDate: new Date(Date.now() + (proposal.terms?.leadTime || 7) * 24 * 60 * 60 * 1000)
      },

      // Order status
      status: 'pending',
      statusHistory: [{
        status: 'pending',
        changedAt: new Date(),
        changedBy: req.user._id,
        reason: 'Order created from accepted proposal'
      }],

      // Set dates
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await order.save();

    // Update proposal with order reference
    proposal.orderId = order._id;
    await proposal.save();

    res.json({
      success: true,
      message: 'Proposal accepted and order created successfully',
      data: {
        proposal,
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          status: order.status
        }
      }
    });
  } catch (error) {
    console.error('Error accepting proposal:', error);
    res.status(500).json({ error: 'Failed to accept proposal' });
  }
};
