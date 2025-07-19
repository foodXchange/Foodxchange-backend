import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { imageOptimizationService } from '../services/optimization/ImageOptimizationService';
import { Logger } from '../core/logging/logger';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('ImageOptimizationMiddleware');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/svg+xml'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images are allowed.'));
  }
};

// Multer configuration
export const uploadConfig = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
    files: parseInt(process.env.MAX_FILES || '10')
  }
});

/**
 * Image optimization middleware for single file upload
 */
export const optimizeSingleImage = (fieldName: string) => {
  return [
    uploadConfig.single(fieldName),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          return next();
        }
        
        const startTime = Date.now();
        const filename = `${uuidv4()}${path.extname(req.file.originalname)}`;
        
        // Process the uploaded image
        const processed = await imageOptimizationService.processUploadedImage(
          req.file.buffer,
          filename,
          {
            width: req.body.width ? parseInt(req.body.width) : undefined,
            height: req.body.height ? parseInt(req.body.height) : undefined,
            quality: req.body.quality ? parseInt(req.body.quality) : undefined,
            format: req.body.format
          }
        );
        
        // Generate responsive variants in background
        imageOptimizationService.generateResponsiveVariants(req.file.buffer, filename)
          .catch(error => logger.error('Failed to generate variants:', error));
        
        // Attach processed image info to request
        (req as any).optimizedImage = {
          filename,
          originalName: req.file.originalname,
          format: processed.format,
          width: processed.width,
          height: processed.height,
          size: processed.size,
          originalSize: req.file.size,
          compressionRatio: ((1 - processed.size / req.file.size) * 100).toFixed(2) + '%',
          processingTime: Date.now() - startTime,
          hash: processed.hash,
          buffer: processed.buffer
        };
        
        next();
      } catch (error) {
        logger.error('Image optimization failed:', error);
        next(error);
      }
    }
  ];
};

/**
 * Image optimization middleware for multiple file uploads
 */
export const optimizeMultipleImages = (fieldName: string, maxCount: number = 10) => {
  return [
    uploadConfig.array(fieldName, maxCount),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.files || !Array.isArray(req.files)) {
          return next();
        }
        
        const optimizedImages = await Promise.all(
          req.files.map(async (file) => {
            const filename = `${uuidv4()}${path.extname(file.originalname)}`;
            
            const processed = await imageOptimizationService.processUploadedImage(
              file.buffer,
              filename,
              {
                width: req.body.width ? parseInt(req.body.width) : undefined,
                height: req.body.height ? parseInt(req.body.height) : undefined,
                quality: req.body.quality ? parseInt(req.body.quality) : undefined,
                format: req.body.format
              }
            );
            
            // Generate variants in background
            imageOptimizationService.generateResponsiveVariants(file.buffer, filename)
              .catch(error => logger.error('Failed to generate variants:', error));
            
            return {
              filename,
              originalName: file.originalname,
              format: processed.format,
              width: processed.width,
              height: processed.height,
              size: processed.size,
              originalSize: file.size,
              compressionRatio: ((1 - processed.size / file.size) * 100).toFixed(2) + '%',
              hash: processed.hash,
              buffer: processed.buffer
            };
          })
        );
        
        (req as any).optimizedImages = optimizedImages;
        next();
      } catch (error) {
        logger.error('Multiple image optimization failed:', error);
        next(error);
      }
    }
  ];
};

/**
 * Serve optimized images with on-the-fly processing
 */
export const serveOptimizedImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params;
    const { w, h, q, f, fit, blur, sharpen } = req.query;
    
    // Parse options
    const options = {
      width: w ? parseInt(w as string) : undefined,
      height: h ? parseInt(h as string) : undefined,
      quality: q ? parseInt(q as string) : undefined,
      format: f as any,
      fit: fit as any,
      blur: blur ? parseInt(blur as string) : undefined,
      sharpen: sharpen === 'true'
    };
    
    // Get optimized image
    const processed = await imageOptimizationService.getOptimizedImage(filename, options);
    
    if (!processed) {
      return res.status(404).json({
        success: false,
        error: 'Image not found'
      });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', `image/${processed.format}`);
    res.setHeader('Content-Length', processed.size.toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `"${processed.hash}"`);
    
    // Check if client has cached version
    if (req.headers['if-none-match'] === `"${processed.hash}"`) {
      return res.status(304).end();
    }
    
    // Send image
    res.send(processed.buffer);
  } catch (error) {
    logger.error('Failed to serve optimized image:', error);
    next(error);
  }
};

/**
 * Generate responsive image metadata
 */
export const generateResponsiveMetadata = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params;
    
    // Generate srcset
    const srcset = await imageOptimizationService.generateSrcSet(filename);
    
    // Generate picture element
    const pictureElement = await imageOptimizationService.generatePictureElement(
      filename,
      req.query.alt as string || 'Image',
      {
        sizes: req.query.sizes as string,
        lazyLoad: req.query.lazy === 'true',
        className: req.query.class as string
      }
    );
    
    res.json({
      success: true,
      data: {
        filename,
        srcset,
        pictureElement,
        variants: {
          thumbnail: `/images/thumbnail/${filename}`,
          small: `/images/small/${filename}`,
          medium: `/images/medium/${filename}`,
          large: `/images/large/${filename}`,
          xlarge: `/images/xlarge/${filename}`,
          webp: {
            small: `/images/webp_small/${filename}`,
            medium: `/images/webp_medium/${filename}`,
            large: `/images/webp_large/${filename}`
          },
          avif: {
            small: `/images/avif_small/${filename}`,
            medium: `/images/avif_medium/${filename}`,
            large: `/images/avif_large/${filename}`
          }
        }
      }
    });
  } catch (error) {
    logger.error('Failed to generate responsive metadata:', error);
    next(error);
  }
};

/**
 * Cleanup old cached images
 */
export const cleanupImageCache = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const maxAge = req.query.maxAge ? parseInt(req.query.maxAge as string) : 7 * 24 * 60 * 60 * 1000;
    const deletedCount = await imageOptimizationService.cleanupCache(maxAge);
    
    res.json({
      success: true,
      data: {
        deletedCount,
        message: `Cleaned up ${deletedCount} cached images older than ${maxAge / (24 * 60 * 60 * 1000)} days`
      }
    });
  } catch (error) {
    logger.error('Failed to cleanup image cache:', error);
    next(error);
  }
};

/**
 * Get image optimization statistics
 */
export const getImageStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await imageOptimizationService.getImageStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        totalSizeFormatted: formatBytes(stats.totalSize),
        cacheSizeFormatted: formatBytes(stats.cacheSize),
        averageSize: stats.totalImages > 0 ? formatBytes(stats.totalSize / stats.totalImages) : '0 B'
      }
    });
  } catch (error) {
    logger.error('Failed to get image stats:', error);
    next(error);
  }
};

// Helper function to format bytes
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}