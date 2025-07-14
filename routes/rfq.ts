import express, { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import RFQ from '../models/RFQ';
import { AuthenticatedRequest } from '../types';

const router: Router = express.Router();

// Get all RFQs
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const rfqs = await RFQ.find({ buyerId: req.userId })
      .populate('buyerId', 'name email')
      .sort({ createdAt: -1 });
    
    res.json({ 
      success: true, 
      rfqs,
      count: rfqs.length 
    });
  } catch (error) {
    console.error('Error fetching RFQs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch RFQs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create new RFQ
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      productType,
      specifications,
      quantity,
      unit,
      budget,
      deliveryDate
    } = req.body;

    // Validate required fields
    if (!title || !quantity || !productType) {
      res.status(400).json({
        success: false,
        message: 'Title, quantity, and product type are required'
      });
      return;
    }

    const rfq = new RFQ({
      title,
      description,
      productType,
      specifications: specifications || new Map(),
      quantity,
      unit,
      budget,
      deliveryDate,
      buyerId: req.userId,
      status: 'draft'
    });

    await rfq.save();
    
    res.status(201).json({ 
      success: true, 
      message: 'RFQ created successfully',
      rfq 
    });
  } catch (error) {
    console.error('Error creating RFQ:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create RFQ',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get single RFQ by ID
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const rfq = await RFQ.findById(req.params.id)
      .populate('buyerId', 'name email company');
    
    if (!rfq) {
      res.status(404).json({ 
        success: false, 
        message: 'RFQ not found' 
      });
      return;
    }

    // Check if user has access to this RFQ
    if (rfq.buyerId.toString() !== req.userId) {
      res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
      return;
    }

    res.json({ 
      success: true, 
      rfq 
    });
  } catch (error) {
    console.error('Error fetching RFQ:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch RFQ',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update RFQ
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const rfq = await RFQ.findById(req.params.id);
    
    if (!rfq) {
      res.status(404).json({ 
        success: false, 
        message: 'RFQ not found' 
      });
      return;
    }

    // Check ownership
    if (rfq.buyerId.toString() !== req.userId) {
      res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
      return;
    }

    // Update fields
    Object.assign(rfq, req.body);
    await rfq.save();

    res.json({ 
      success: true, 
      message: 'RFQ updated successfully',
      rfq 
    });
  } catch (error) {
    console.error('Error updating RFQ:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update RFQ',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete RFQ
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const rfq = await RFQ.findById(req.params.id);
    
    if (!rfq) {
      res.status(404).json({ 
        success: false, 
        message: 'RFQ not found' 
      });
      return;
    }

    // Check ownership
    if (rfq.buyerId.toString() !== req.userId) {
      res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
      return;
    }

    await rfq.deleteOne();

    res.json({ 
      success: true, 
      message: 'RFQ deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting RFQ:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete RFQ',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update RFQ status
router.patch('/:id/status', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'active', 'closed', 'awarded'];
    
    if (!validStatuses.includes(status)) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid status' 
      });
      return;
    }

    const rfq = await RFQ.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!rfq) {
      res.status(404).json({ 
        success: false, 
        message: 'RFQ not found' 
      });
      return;
    }

    res.json({ 
      success: true, 
      message: 'Status updated successfully',
      rfq 
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;