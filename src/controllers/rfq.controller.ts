import { Request, Response } from 'express';
import { RFQ } from '../models/RFQ';
import { AuthRequest } from '../middleware/auth.middleware';

// @desc    Create new RFQ
// @route   POST /api/rfq
// @access  Private (Buyer only)
export const createRFQ = async (req: AuthRequest, res: Response) => {
  try {
    const rfqData = {
      ...req.body,
      buyer: req.userId,
      status: 'open'
    };

    const rfq = await RFQ.create(rfqData);
    
    res.status(201).json({
      success: true,
      data: rfq
    });
  } catch (error: any) {
    console.error('Create RFQ error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error creating RFQ'
    });
  }
};

// @desc    Get all RFQs with filtering
// @route   GET /api/rfq
// @access  Public
export const getRFQs = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter: any = {};
    
    if (status) filter.status = status;
    if (category) filter.category = category;
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Execute query
    const rfqs = await RFQ.find(filter)
      .populate('buyer', 'name email company')
      .sort({ [sortBy as string]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await RFQ.countDocuments(filter);

    res.json({
      success: true,
      data: rfqs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('Get RFQs error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching RFQs'
    });
  }
};

// @desc    Get single RFQ
// @route   GET /api/rfq/:id
// @access  Public
export const getRFQ = async (req: Request, res: Response) => {
  try {
    const rfq = await RFQ.findById(req.params.id)
      .populate('buyer', 'name email company')
      .populate('proposals.supplier', 'name email company');
    
    if (!rfq) {
      return res.status(404).json({
        success: false,
        error: 'RFQ not found'
      });
    }

    res.json({
      success: true,
      data: rfq
    });
  } catch (error: any) {
    console.error('Get RFQ error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching RFQ'
    });
  }
};

// @desc    Update RFQ
// @route   PUT /api/rfq/:id
// @access  Private (Owner only)
export const updateRFQ = async (req: AuthRequest, res: Response) => {
  try {
    let rfq = await RFQ.findById(req.params.id);
    
    if (!rfq) {
      return res.status(404).json({
        success: false,
        error: 'RFQ not found'
      });
    }

    // Check ownership
    if (rfq.buyer.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this RFQ'
      });
    }

    // Don't allow updates to closed RFQs
    if (rfq.status === 'closed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update closed RFQ'
      });
    }

    rfq = await RFQ.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: rfq
    });
  } catch (error: any) {
    console.error('Update RFQ error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error updating RFQ'
    });
  }
};

// @desc    Submit proposal to RFQ
// @route   POST /api/rfq/:id/proposal
// @access  Private (Supplier only)
export const submitProposal = async (req: AuthRequest, res: Response) => {
  try {
    const rfq = await RFQ.findById(req.params.id);
    
    if (!rfq) {
      return res.status(404).json({
        success: false,
        error: 'RFQ not found'
      });
    }

    // Check if RFQ is still open
    if (rfq.status !== 'open') {
      return res.status(400).json({
        success: false,
        error: 'RFQ is not accepting proposals'
      });
    }

    // Check if supplier already submitted a proposal
    const existingProposal = rfq.proposals.find(
      p => p.supplier.toString() === req.userId
    );
    
    if (existingProposal) {
      return res.status(400).json({
        success: false,
        error: 'You have already submitted a proposal'
      });
    }

    // Add proposal
    const proposal = {
      supplier: req.userId,
      ...req.body,
      submittedAt: new Date()
    };

    rfq.proposals.push(proposal);
    await rfq.save();

    res.json({
      success: true,
      message: 'Proposal submitted successfully',
      data: proposal
    });
  } catch (error: any) {
    console.error('Submit proposal error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error submitting proposal'
    });
  }
};

// @desc    Accept proposal
// @route   PUT /api/rfq/:id/accept-proposal/:proposalId
// @access  Private (RFQ owner only)
export const acceptProposal = async (req: AuthRequest, res: Response) => {
  try {
    const rfq = await RFQ.findById(req.params.id);
    
    if (!rfq) {
      return res.status(404).json({
        success: false,
        error: 'RFQ not found'
      });
    }

    // Check ownership
    if (rfq.buyer.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to accept proposals for this RFQ'
      });
    }

    // Find proposal
    const proposal = rfq.proposals.find(
      p => p._id.toString() === req.params.proposalId
    );
    
    if (!proposal) {
      return res.status(404).json({
        success: false,
        error: 'Proposal not found'
      });
    }

    // Update proposal status
    proposal.status = 'accepted';
    rfq.status = 'closed';
    rfq.acceptedProposal = proposal._id;
    
    await rfq.save();

    // Here you would typically create an order from the accepted proposal

    res.json({
      success: true,
      message: 'Proposal accepted successfully',
      data: rfq
    });
  } catch (error: any) {
    console.error('Accept proposal error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error accepting proposal'
    });
  }
};

// @desc    Close RFQ
// @route   PUT /api/rfq/:id/close
// @access  Private (Owner only)
export const closeRFQ = async (req: AuthRequest, res: Response) => {
  try {
    const rfq = await RFQ.findById(req.params.id);
    
    if (!rfq) {
      return res.status(404).json({
        success: false,
        error: 'RFQ not found'
      });
    }

    // Check ownership
    if (rfq.buyer.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to close this RFQ'
      });
    }

    rfq.status = 'closed';
    await rfq.save();

    res.json({
      success: true,
      message: 'RFQ closed successfully',
      data: rfq
    });
  } catch (error: any) {
    console.error('Close RFQ error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error closing RFQ'
    });
  }
};