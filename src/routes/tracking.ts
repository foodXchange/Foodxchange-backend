import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { Sample, SampleWorkflowStage } from '../models/sample.model';
import { Order, LineItemStatus, ShipmentStatus } from '../models/order.model';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../core/errors';
import { Logger } from '../core/logging/logger';
import { CacheService } from '../infrastructure/cache/CacheService';
import { MetricsService } from '../infrastructure/monitoring/MetricsService';

const router = Router();
const logger = new Logger('TrackingRoutes');
const cache = CacheService.getInstance();
const metrics = MetricsService.getInstance();

// Middleware to validate request
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(400, 'Validation failed', errors.array());
  }
  next();
};

/**
 * @route   POST /api/tracking/samples/:id/events
 * @desc    Update sample workflow with new event
 * @access  Private
 */
router.post(
  '/samples/:id/events',
  authenticate,
  [
    param('id').isMongoId().withMessage('Invalid sample ID'),
    body('stage').isIn(Object.values(SampleWorkflowStage)).withMessage('Invalid workflow stage'),
    body('notes').optional().isString().trim(),
    body('location').optional().isString().trim(),
    body('attachments').optional().isArray(),
    body('attachments.*').optional().isURL(),
    body('metadata').optional().isObject()
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { stage, notes, location, attachments, metadata } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;

    // Find sample
    const sample = await Sample.findById(id);
    if (!sample) {
      throw new ApiError(404, 'Sample not found');
    }

    // Check permissions
    const canUpdate = 
      sample.supplier.equals(userId) || 
      sample.buyer.equals(userId) ||
      req.user.role === 'admin';
      
    if (!canUpdate) {
      throw new ApiError(403, 'Not authorized to update this sample');
    }

    // Update stage and add timeline event
    await sample.updateStage(stage, userId, userName, notes);

    // Add additional event details if provided
    if (location || attachments || metadata) {
      const lastEvent = sample.timeline[sample.timeline.length - 1];
      if (location) lastEvent.location = location;
      if (attachments) lastEvent.attachments = attachments;
      if (metadata) lastEvent.metadata = { ...lastEvent.metadata, ...metadata };
      await sample.save();
    }

    // Clear cache
    await cache.delete(`sample:${id}`);
    
    // Track metrics
    metrics.trackBusinessEvent('sample.stage_updated', {
      sampleId: sample.sampleId,
      previousStage: sample.timeline[sample.timeline.length - 2]?.stage,
      newStage: stage,
      userId
    });

    logger.info('Sample workflow updated', { 
      sampleId: sample.sampleId, 
      stage, 
      userId 
    });

    res.status(200).json({
      success: true,
      message: 'Sample workflow updated successfully',
      data: {
        sample: {
          id: sample._id,
          sampleId: sample.sampleId,
          currentStage: sample.currentStage,
          timeline: sample.timeline
        }
      }
    });
  })
);

/**
 * @route   GET /api/tracking/samples/:id/status
 * @desc    Get current sample status with timeline
 * @access  Private
 */
router.get(
  '/samples/:id/status',
  authenticate,
  [
    param('id').isMongoId().withMessage('Invalid sample ID'),
    query('includeTimeline').optional().isBoolean().toBoolean()
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { includeTimeline = true } = req.query;
    const userId = req.user._id;

    // Try cache first
    const cacheKey = `sample:${id}:status`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Find sample
    const sample = await Sample.findById(id)
      .select('sampleId currentStage priority timeline estimatedDeliveryDate actualDeliveryDate supplier buyer productName');
    
    if (!sample) {
      throw new ApiError(404, 'Sample not found');
    }

    // Check permissions
    const canView = 
      sample.supplier.equals(userId) || 
      sample.buyer.equals(userId) ||
      req.user.role === 'admin';
      
    if (!canView) {
      throw new ApiError(403, 'Not authorized to view this sample');
    }

    const response = {
      success: true,
      data: {
        sampleId: sample.sampleId,
        productName: sample.productName,
        currentStage: sample.currentStage,
        priority: sample.priority,
        estimatedDeliveryDate: sample.estimatedDeliveryDate,
        actualDeliveryDate: sample.actualDeliveryDate,
        isOverdue: sample.isOverdue,
        age: sample.age,
        timeline: includeTimeline ? sample.timeline : undefined
      }
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);

    res.json(response);
  })
);

/**
 * @route   POST /api/tracking/orders/:id/shipments
 * @desc    Update order shipment status
 * @access  Private
 */
router.post(
  '/orders/:id/shipments',
  authenticate,
  authorize('supplier', 'admin'),
  [
    param('id').isMongoId().withMessage('Invalid order ID'),
    body('shipmentId').optional().isString(),
    body('carrier').isString().trim().notEmpty(),
    body('trackingNumber').isString().trim().notEmpty(),
    body('lineItems').isArray().notEmpty(),
    body('lineItems.*.lineItemId').isMongoId(),
    body('lineItems.*.quantity').isInt({ min: 1 }),
    body('pickupAddress').isObject(),
    body('deliveryAddress').isObject(),
    body('estimatedDeliveryDate').optional().isISO8601()
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const shipmentData = req.body;
    const userId = req.user._id;

    // Find order
    const order = await Order.findById(id);
    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    // Verify supplier
    if (!order.supplier.equals(userId) && req.user.role !== 'admin') {
      throw new ApiError(403, 'Not authorized to update this order');
    }

    // Validate line items
    for (const item of shipmentData.lineItems) {
      const lineItem = order.lineItems.id(item.lineItemId);
      if (!lineItem) {
        throw new ApiError(400, `Line item ${item.lineItemId} not found`);
      }
      
      const remainingQuantity = lineItem.quantity - lineItem.shippedQuantity;
      if (item.quantity > remainingQuantity) {
        throw new ApiError(400, 
          `Cannot ship ${item.quantity} units of ${lineItem.productName}. ` +
          `Only ${remainingQuantity} units remaining.`
        );
      }
    }

    // Add shipment
    await order.addShipment({
      ...shipmentData,
      status: ShipmentStatus.DISPATCHED,
      createdBy: userId
    });

    // Clear cache
    await cache.deletePattern(`order:${id}:*`);
    
    // Track metrics
    metrics.trackBusinessEvent('order.shipment_created', {
      orderId: order.orderId,
      shipmentCount: order.shipments.length,
      userId
    });

    logger.info('Order shipment created', { 
      orderId: order.orderId, 
      trackingNumber: shipmentData.trackingNumber 
    });

    res.status(201).json({
      success: true,
      message: 'Shipment created successfully',
      data: {
        order: {
          id: order._id,
          orderId: order.orderId,
          status: order.status,
          shipments: order.shipments
        }
      }
    });
  })
);

/**
 * @route   GET /api/tracking/orders/:id/lines
 * @desc    Get order line-level tracking details
 * @access  Private
 */
router.get(
  '/orders/:id/lines',
  authenticate,
  [
    param('id').isMongoId().withMessage('Invalid order ID'),
    query('lineItemId').optional().isMongoId()
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { lineItemId } = req.query;
    const userId = req.user._id;

    // Find order
    const order = await Order.findById(id)
      .select('orderId buyer supplier lineItems shipments')
      .populate('lineItems.product', 'name images');
    
    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    // Check permissions
    const canView = 
      order.supplier.equals(userId) || 
      order.buyer.equals(userId) ||
      req.user.role === 'admin';
      
    if (!canView) {
      throw new ApiError(403, 'Not authorized to view this order');
    }

    // Filter line items if specific one requested
    let lineItems = order.lineItems;
    if (lineItemId) {
      const item = order.lineItems.id(lineItemId as string);
      if (!item) {
        throw new ApiError(404, 'Line item not found');
      }
      lineItems = [item];
    }

    // Build response with tracking info
    const lineItemsWithTracking = lineItems.map(item => {
      // Find shipments containing this line item
      const itemShipments = order.shipments.filter(shipment =>
        shipment.lineItems.some(li => li.lineItemId.equals(item._id))
      );

      return {
        id: item._id,
        product: item.product,
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unit: item.unit,
        status: item.status,
        tracking: {
          allocatedQuantity: item.allocatedQuantity,
          shippedQuantity: item.shippedQuantity,
          deliveredQuantity: item.deliveredQuantity,
          returnedQuantity: item.returnedQuantity,
          remainingQuantity: item.quantity - item.shippedQuantity
        },
        shipments: itemShipments.map(shipment => ({
          shipmentId: shipment.shipmentId,
          trackingNumber: shipment.trackingNumber,
          carrier: shipment.carrier,
          status: shipment.status,
          quantity: shipment.lineItems.find(li => 
            li.lineItemId.equals(item._id)
          )?.quantity || 0,
          estimatedDeliveryDate: shipment.estimatedDeliveryDate,
          actualDeliveryDate: shipment.actualDeliveryDate
        })),
        temperatureControl: item.requiresTemperatureControl ? {
          required: true,
          range: item.temperatureRange
        } : undefined,
        timeline: item.timeline
      };
    });

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        lineItems: lineItemsWithTracking
      }
    });
  })
);

/**
 * @route   POST /api/tracking/orders/:orderId/shipments/:shipmentId/temperature
 * @desc    Add temperature reading to shipment
 * @access  Private
 */
router.post(
  '/orders/:orderId/shipments/:shipmentId/temperature',
  authenticate,
  [
    param('orderId').isMongoId().withMessage('Invalid order ID'),
    param('shipmentId').isMongoId().withMessage('Invalid shipment ID'),
    body('temperature').isNumeric().withMessage('Temperature must be a number'),
    body('unit').isIn(['C', 'F']).withMessage('Unit must be C or F'),
    body('location').optional().isString().trim(),
    body('deviceId').optional().isString().trim()
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId, shipmentId } = req.params;
    const { temperature, unit, location, deviceId } = req.body;

    // Find order
    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    // Add temperature reading
    await order.addTemperatureReading(shipmentId, {
      temperature,
      unit,
      timestamp: new Date(),
      location,
      deviceId
    });

    // Clear cache
    await cache.deletePattern(`order:${orderId}:*`);
    
    // Track metrics
    metrics.trackBusinessEvent('order.temperature_recorded', {
      orderId: order.orderId,
      shipmentId,
      temperature,
      unit
    });

    res.json({
      success: true,
      message: 'Temperature reading recorded',
      data: {
        orderId: order.orderId,
        shipmentId,
        reading: {
          temperature,
          unit,
          timestamp: new Date(),
          location,
          deviceId
        }
      }
    });
  })
);

/**
 * @route   POST /api/tracking/orders/:orderId/lines/:lineItemId/status
 * @desc    Update line item status
 * @access  Private
 */
router.post(
  '/orders/:orderId/lines/:lineItemId/status',
  authenticate,
  authorize('supplier', 'admin'),
  [
    param('orderId').isMongoId().withMessage('Invalid order ID'),
    param('lineItemId').isMongoId().withMessage('Invalid line item ID'),
    body('status').isIn(Object.values(LineItemStatus)).withMessage('Invalid status'),
    body('notes').optional().isString().trim()
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { orderId, lineItemId } = req.params;
    const { status, notes } = req.body;
    const userId = req.user._id;

    // Find order
    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(404, 'Order not found');
    }

    // Verify permissions
    if (!order.supplier.equals(userId) && req.user.role !== 'admin') {
      throw new ApiError(403, 'Not authorized to update this order');
    }

    // Update line item status
    await order.updateLineItemStatus(lineItemId, status, userId, notes);

    // Clear cache
    await cache.deletePattern(`order:${orderId}:*`);
    
    // Track metrics
    metrics.trackBusinessEvent('order.line_item_status_updated', {
      orderId: order.orderId,
      lineItemId,
      status,
      userId
    });

    logger.info('Line item status updated', { 
      orderId: order.orderId, 
      lineItemId, 
      status 
    });

    res.json({
      success: true,
      message: 'Line item status updated',
      data: {
        orderId: order.orderId,
        orderStatus: order.status,
        lineItem: order.lineItems.id(lineItemId)
      }
    });
  })
);

/**
 * @route   GET /api/tracking/shipments/:trackingNumber
 * @desc    Track shipment by tracking number
 * @access  Public (with rate limiting)
 */
router.get(
  '/shipments/:trackingNumber',
  [
    param('trackingNumber').isString().trim().notEmpty()
  ],
  validateRequest,
  asyncHandler(async (req: Request, res: Response) => {
    const { trackingNumber } = req.params;

    // Try cache first
    const cacheKey = `tracking:${trackingNumber}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Find order with this tracking number
    const order = await Order.findOne({
      'shipments.trackingNumber': trackingNumber
    }).select('orderId shipments');

    if (!order) {
      throw new ApiError(404, 'Tracking number not found');
    }

    const shipment = order.shipments.find(s => 
      s.trackingNumber === trackingNumber
    );

    if (!shipment) {
      throw new ApiError(404, 'Shipment not found');
    }

    const response = {
      success: true,
      data: {
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier,
        status: shipment.status,
        estimatedDeliveryDate: shipment.estimatedDeliveryDate,
        actualDeliveryDate: shipment.actualDeliveryDate,
        pickupAddress: {
          city: shipment.pickupAddress.city,
          state: shipment.pickupAddress.state,
          country: shipment.pickupAddress.country
        },
        deliveryAddress: {
          city: shipment.deliveryAddress.city,
          state: shipment.deliveryAddress.state,
          country: shipment.deliveryAddress.country
        },
        trackingEvents: shipment.trackingEvents || []
      }
    };

    // Cache for 10 minutes
    await cache.set(cacheKey, response, 600);

    res.json(response);
  })
);

export default router;