


const express = require('express');
const router = express.Router();
const RFQ = require('../models/RFQ');
const Company = require('../models/Company');

// @route   GET /api/rfq
// @desc    Get all RFQs with filtering and pagination
// @access  Public
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            category,
            country,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query object
        let query = {};
        
        // Filter by status
        if (status) {
            query['process.status'] = status;
        }
        
        // Filter by category
        if (category) {
            query['products.category'] = { $regex: category, $options: 'i' };
        }
        
        // Filter by country
        if (country) {
            query['delivery.location.country'] = { $regex: country, $options: 'i' };
        }
        
        // Search in title and description
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute query with pagination
        const rfqs = await RFQ.find(query)
            .populate('buyer.companyId', 'name country logo')
            .sort(sort)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        // Get total count for pagination
        const total = await RFQ.countDocuments(query);

        res.json({
            success: true,
            data: rfqs,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Error fetching RFQs:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching RFQs',
            error: error.message
        });
    }
});

// @route   GET /api/rfq/active
// @desc    Get only active RFQs
// @access  Public
router.get('/active', async (req, res) => {
    try {
        const activeRFQs = await RFQ.findActiveRFQs()
            .populate('buyer.companyId', 'name country logo')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: activeRFQs,
            count: activeRFQs.length
        });

    } catch (error) {
        console.error('Error fetching active RFQs:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching active RFQs',
            error: error.message
        });
    }
});

// @route   GET /api/rfq/:id
// @desc    Get single RFQ by ID
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const rfq = await RFQ.findById(req.params.id)
            .populate('buyer.companyId', 'name country logo contactInfo')
            .populate('process.invitedSuppliers', 'name country logo');

        if (!rfq) {
            return res.status(404).json({
                success: false,
                message: 'RFQ not found'
            });
        }

        // Increment view count (optional: only if not the owner)
        await rfq.addView();

        res.json({
            success: true,
            data: rfq
        });

    } catch (error) {
        console.error('Error fetching RFQ:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching RFQ',
            error: error.message
        });
    }
});

// @route   POST /api/rfq
// @desc    Create new RFQ
// @access  Private (requires authentication)
router.post('/', async (req, res) => {
    try {
        const {
            title,
            description,
            buyer,
            products,
            delivery,
            commercial,
            process,
            aiEnhanced
        } = req.body;

        // Validate required fields
        if (!title || !description || !buyer.companyId || !products || products.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: title, description, buyer.companyId, and products'
            });
        }

        // Validate buyer company exists
        const buyerCompany = await Company.findById(buyer.companyId);
        if (!buyerCompany) {
            return res.status(400).json({
                success: false,
                message: 'Buyer company not found'
            });
        }

        // Create new RFQ
        const newRFQ = new RFQ({
            title,
            description,
            buyer,
            products,
            delivery,
            commercial,
            process,
            aiEnhanced
        });

        const savedRFQ = await newRFQ.save();

        // Populate the response
        const populatedRFQ = await RFQ.findById(savedRFQ._id)
            .populate('buyer.companyId', 'name country logo');

        res.status(201).json({
            success: true,
            message: 'RFQ created successfully',
            data: populatedRFQ
        });

    } catch (error) {
        console.error('Error creating RFQ:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating RFQ',
            error: error.message
        });
    }
});

// @route   PUT /api/rfq/:id
// @desc    Update RFQ
// @access  Private (requires authentication and ownership)
router.put('/:id', async (req, res) => {
    try {
        const rfq = await RFQ.findById(req.params.id);

        if (!rfq) {
            return res.status(404).json({
                success: false,
                message: 'RFQ not found'
            });
        }

        // Check if RFQ can be edited (only draft and published status)
        if (!['draft', 'published'].includes(rfq.process.status)) {
            return res.status(400).json({
                success: false,
                message: 'RFQ cannot be edited in current status'
            });
        }

        // Update fields
        Object.keys(req.body).forEach(key => {
            if (req.body[key] !== undefined) {
                rfq[key] = req.body[key];
            }
        });

        const updatedRFQ = await rfq.save();

        // Populate the response
        const populatedRFQ = await RFQ.findById(updatedRFQ._id)
            .populate('buyer.companyId', 'name country logo');

        res.json({
            success: true,
            message: 'RFQ updated successfully',
            data: populatedRFQ
        });

    } catch (error) {
        console.error('Error updating RFQ:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating RFQ',
            error: error.message
        });
    }
});

// @route   PATCH /api/rfq/:id/status
// @desc    Update RFQ status
// @access  Private (requires authentication and ownership)
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        const validStatuses = ['draft', 'published', 'active', 'closed', 'cancelled', 'awarded'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status provided'
            });
        }

        const rfq = await RFQ.findById(req.params.id);

        if (!rfq) {
            return res.status(404).json({
                success: false,
                message: 'RFQ not found'
            });
        }

        await rfq.updateStatus(status);

        res.json({
            success: true,
            message: `RFQ status updated to ${status}`,
            data: { status: rfq.process.status }
        });

    } catch (error) {
        console.error('Error updating RFQ status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating RFQ status',
            error: error.message
        });
    }
});

// @route   DELETE /api/rfq/:id
// @desc    Delete RFQ
// @access  Private (requires authentication and ownership)
router.delete('/:id', async (req, res) => {
    try {
        const rfq = await RFQ.findById(req.params.id);

        if (!rfq) {
            return res.status(404).json({
                success: false,
                message: 'RFQ not found'
            });
        }

        // Only allow deletion of draft RFQs
        if (rfq.process.status !== 'draft') {
            return res.status(400).json({
                success: false,
                message: 'Only draft RFQs can be deleted'
            });
        }

        await RFQ.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'RFQ deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting RFQ:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting RFQ',
            error: error.message
        });
    }
});

// @route   GET /api/rfq/category/:category
// @desc    Get RFQs by category
// @access  Public
router.get('/category/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const rfqs = await RFQ.findByCategory(category)
            .populate('buyer.companyId', 'name country logo')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: rfqs,
            count: rfqs.length,
            category: category
        });

    } catch (error) {
        console.error('Error fetching RFQs by category:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching RFQs by category',
            error: error.message
        });
    }
});

// @route   POST /api/rfq/:id/view
// @desc    Record a view for analytics
// @access  Public
router.post('/:id/view', async (req, res) => {
    try {
        const { companyId } = req.body;
        const rfq = await RFQ.findById(req.params.id);

        if (!rfq) {
            return res.status(404).json({
                success: false,
                message: 'RFQ not found'
            });
        }

        await rfq.addView(companyId);

        res.json({
            success: true,
            message: 'View recorded',
            views: rfq.tracking.views
        });

    } catch (error) {
        console.error('Error recording view:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while recording view',
            error: error.message
        });
    }
});

module.exports = router;
