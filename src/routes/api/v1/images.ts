import { Router } from 'express';
import {
  optimizeSingleImage,
  optimizeMultipleImages,
  serveOptimizedImage,
  generateResponsiveMetadata,
  cleanupImageCache,
  getImageStats
} from '../../../middleware/imageOptimization';
import { authenticate } from '../../../middleware/auth';
import { authorize } from '../../../middleware/authorize';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { Logger } from '../../../core/logging/logger';
import { promises as fs } from 'fs';
import path from 'path';

const router = Router();
const logger = new Logger('ImageRoutes');

/**
 * @route   POST /api/v1/images/upload
 * @desc    Upload and optimize a single image
 * @access  Private
 */
router.post('/upload',
  authenticate,
  optimizeSingleImage('image'),
  asyncHandler(async (req, res) => {
    const optimizedImage = (req as any).optimizedImage;
    
    if (!optimizedImage) {
      return res.status(400).json({
        success: false,
        error: 'No image provided'
      });
    }
    
    // Save optimized image to disk
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, optimizedImage.filename);
    
    await fs.writeFile(filePath, optimizedImage.buffer);
    
    // Remove buffer from response
    const { buffer, ...imageData } = optimizedImage;
    
    res.json({
      success: true,
      data: {
        ...imageData,
        url: `/images/${optimizedImage.filename}`,
        responsiveUrls: {
          thumbnail: `/images/thumbnail/${optimizedImage.filename}`,
          small: `/images/small/${optimizedImage.filename}`,
          medium: `/images/medium/${optimizedImage.filename}`,
          large: `/images/large/${optimizedImage.filename}`
        }
      }
    });
  })
);

/**
 * @route   POST /api/v1/images/upload-multiple
 * @desc    Upload and optimize multiple images
 * @access  Private
 */
router.post('/upload-multiple',
  authenticate,
  optimizeMultipleImages('images', 10),
  asyncHandler(async (req, res) => {
    const optimizedImages = (req as any).optimizedImages;
    
    if (!optimizedImages || optimizedImages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No images provided'
      });
    }
    
    // Save all optimized images
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    
    const savedImages = await Promise.all(
      optimizedImages.map(async (image: any) => {
        const filePath = path.join(uploadDir, image.filename);
        await fs.writeFile(filePath, image.buffer);
        
        // Remove buffer from response
        const { buffer, ...imageData } = image;
        
        return {
          ...imageData,
          url: `/images/${image.filename}`,
          responsiveUrls: {
            thumbnail: `/images/thumbnail/${image.filename}`,
            small: `/images/small/${image.filename}`,
            medium: `/images/medium/${image.filename}`,
            large: `/images/large/${image.filename}`
          }
        };
      })
    );
    
    res.json({
      success: true,
      data: savedImages
    });
  })
);

/**
 * @route   GET /api/v1/images/:filename
 * @desc    Serve optimized image with query parameters
 * @access  Public
 * @query   w (width), h (height), q (quality), f (format), fit, blur, sharpen
 */
router.get('/:filename', 
  asyncHandler(serveOptimizedImage)
);

/**
 * @route   GET /api/v1/images/:filename/metadata
 * @desc    Get responsive image metadata
 * @access  Public
 */
router.get('/:filename/metadata',
  asyncHandler(generateResponsiveMetadata)
);

/**
 * @route   DELETE /api/v1/images/:filename
 * @desc    Delete an image and its variants
 * @access  Private
 */
router.delete('/:filename',
  authenticate,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    
    try {
      // Delete original image
      const originalPath = path.join(uploadDir, filename);
      await fs.unlink(originalPath);
      
      // Delete cached variants
      const cacheDir = path.join(uploadDir, 'cache');
      const variants = ['thumbnail', 'small', 'medium', 'large', 'xlarge', 
                       'webp_small', 'webp_medium', 'webp_large',
                       'avif_small', 'avif_medium', 'avif_large'];
      
      await Promise.all(
        variants.map(async (variant) => {
          try {
            const variantPath = path.join(cacheDir, variant, filename);
            await fs.unlink(variantPath);
          } catch (error) {
            // Variant might not exist, ignore error
          }
        })
      );
      
      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete image:', error);
      res.status(404).json({
        success: false,
        error: 'Image not found'
      });
    }
  })
);

/**
 * @route   POST /api/v1/images/cleanup
 * @desc    Cleanup old cached images
 * @access  Private (Admin only)
 */
router.post('/cleanup',
  authenticate,
  authorize('admin'),
  asyncHandler(cleanupImageCache)
);

/**
 * @route   GET /api/v1/images/stats
 * @desc    Get image optimization statistics
 * @access  Private (Admin only)
 */
router.get('/stats',
  authenticate,
  authorize('admin'),
  asyncHandler(getImageStats)
);

/**
 * @route   POST /api/v1/images/generate-variants/:filename
 * @desc    Generate all responsive variants for an existing image
 * @access  Private
 */
router.post('/generate-variants/:filename',
  authenticate,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const { imageOptimizationService } = await import('../../../services/optimization/ImageOptimizationService');
    
    try {
      const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
      const imagePath = path.join(uploadDir, filename);
      const imageBuffer = await fs.readFile(imagePath);
      
      const variants = await imageOptimizationService.generateResponsiveVariants(
        imageBuffer,
        filename
      );
      
      res.json({
        success: true,
        data: {
          filename,
          variantsGenerated: Object.keys(variants).length,
          variants: Object.keys(variants).reduce((acc, key) => {
            const variant = variants[key];
            acc[key] = {
              format: variant.format,
              width: variant.width,
              height: variant.height,
              size: variant.size,
              url: `/images/${key}/${filename}`
            };
            return acc;
          }, {} as any)
        }
      });
    } catch (error) {
      logger.error('Failed to generate variants:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate image variants'
      });
    }
  })
);

export default router;