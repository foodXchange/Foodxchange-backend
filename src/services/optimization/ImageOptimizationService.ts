import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';

import sharp from 'sharp';

import { Logger } from '../../core/logging/logger';
import { optimizedCache } from '../cache/OptimizedCacheService';


const logger = new Logger('ImageOptimizationService');

interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: string;
  background?: string;
  blur?: number;
  sharpen?: boolean;
  progressive?: boolean;
}

interface ProcessedImage {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
  size: number;
  hash: string;
}

interface ImageVariant {
  name: string;
  width: number;
  height?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
  quality?: number;
}

export class ImageOptimizationService {
  private static instance: ImageOptimizationService;
  private readonly uploadDir: string;
  private readonly cacheDir: string;
  private readonly cdnBaseUrl: string;

  // Default variants for responsive images
  private readonly defaultVariants: ImageVariant[] = [
    { name: 'thumbnail', width: 150, height: 150, quality: 80 },
    { name: 'small', width: 320, quality: 85 },
    { name: 'medium', width: 640, quality: 85 },
    { name: 'large', width: 1024, quality: 90 },
    { name: 'xlarge', width: 1920, quality: 90 },
    { name: 'webp_small', width: 320, format: 'webp', quality: 80 },
    { name: 'webp_medium', width: 640, format: 'webp', quality: 80 },
    { name: 'webp_large', width: 1024, format: 'webp', quality: 85 },
    { name: 'avif_small', width: 320, format: 'avif', quality: 75 },
    { name: 'avif_medium', width: 640, format: 'avif', quality: 75 },
    { name: 'avif_large', width: 1024, format: 'avif', quality: 80 }
  ];

  private constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    this.cacheDir = path.join(this.uploadDir, 'cache');
    this.cdnBaseUrl = process.env.CDN_BASE_URL || '';

    // Ensure directories exist
    this.ensureDirectories();
  }

  static getInstance(): ImageOptimizationService {
    if (!ImageOptimizationService.instance) {
      ImageOptimizationService.instance = new ImageOptimizationService();
    }
    return ImageOptimizationService.instance;
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Create variant subdirectories
      for (const variant of this.defaultVariants) {
        await fs.mkdir(path.join(this.cacheDir, variant.name), { recursive: true });
      }
    } catch (error) {
      logger.error('Failed to create directories:', error);
    }
  }

  /**
   * Optimize and process uploaded image
   */
  async processUploadedImage(
    inputBuffer: Buffer,
    filename: string,
    options?: ImageOptimizationOptions
  ): Promise<ProcessedImage> {
    try {
      const startTime = Date.now();

      // Get image metadata
      const metadata = await sharp(inputBuffer).metadata();

      // Apply optimizations
      let pipeline = sharp(inputBuffer);

      // Auto-rotate based on EXIF data
      pipeline = pipeline.rotate();

      // Resize if needed
      if (options?.width || options?.height) {
        pipeline = pipeline.resize({
          width: options.width,
          height: options.height,
          fit: options.fit || 'inside',
          position: options.position || 'center',
          background: options.background || { r: 255, g: 255, b: 255, alpha: 0 }
        });
      }

      // Apply effects
      if (options?.blur) {
        pipeline = pipeline.blur(options.blur);
      }

      if (options?.sharpen) {
        pipeline = pipeline.sharpen();
      }

      // Convert format
      const format = options?.format || this.getOptimalFormat(metadata.format);
      const quality = options?.quality || this.getOptimalQuality(format);

      switch (format) {
        case 'webp':
          pipeline = pipeline.webp({
            quality,
            effort: 4,
            smartSubsample: true
          });
          break;
        case 'avif':
          pipeline = pipeline.avif({
            quality,
            effort: 4,
            chromaSubsampling: '4:2:0'
          });
          break;
        case 'jpeg':
          pipeline = pipeline.jpeg({
            quality,
            progressive: options?.progressive !== false,
            mozjpeg: true
          });
          break;
        case 'png':
          pipeline = pipeline.png({
            quality,
            compressionLevel: 9,
            progressive: options?.progressive !== false
          });
          break;
      }

      // Process image
      const processedBuffer = await pipeline.toBuffer();
      const processedMetadata = await sharp(processedBuffer).metadata();

      // Generate hash
      const hash = createHash('md5').update(processedBuffer).digest('hex');

      const duration = Date.now() - startTime;
      logger.info(`Image processed in ${duration}ms`, {
        original: {
          format: metadata.format,
          size: inputBuffer.length,
          width: metadata.width,
          height: metadata.height
        },
        processed: {
          format,
          size: processedBuffer.length,
          width: processedMetadata.width,
          height: processedMetadata.height,
          compression: `${((1 - processedBuffer.length / inputBuffer.length) * 100).toFixed(2)  }%`
        }
      });

      return {
        buffer: processedBuffer,
        format,
        width: processedMetadata.width,
        height: processedMetadata.height,
        size: processedBuffer.length,
        hash
      };
    } catch (error) {
      logger.error('Image processing failed:', error);
      throw error;
    }
  }

  /**
   * Generate all responsive variants for an image
   */
  async generateResponsiveVariants(
    inputBuffer: Buffer,
    baseFilename: string,
    customVariants?: ImageVariant[]
  ): Promise<Record<string, ProcessedImage>> {
    const variants = customVariants || this.defaultVariants;
    const results: Record<string, ProcessedImage> = {};

    // Process variants in parallel
    await Promise.all(
      variants.map(async (variant) => {
        try {
          const processed = await this.processUploadedImage(inputBuffer, baseFilename, {
            width: variant.width,
            height: variant.height,
            format: variant.format,
            quality: variant.quality,
            fit: variant.height ? 'cover' : 'inside'
          });

          results[variant.name] = processed;

          // Cache the variant
          const cacheKey = `image:${baseFilename}:${variant.name}`;
          await optimizedCache.set(cacheKey, {
            ...processed,
            buffer: processed.buffer.toString('base64')
          }, { ttl: 86400 }); // Cache for 24 hours
        } catch (error) {
          logger.error(`Failed to generate variant ${variant.name}:`, error);
        }
      })
    );

    return results;
  }

  /**
   * Get optimized image from cache or generate
   */
  async getOptimizedImage(
    filename: string,
    options?: ImageOptimizationOptions
  ): Promise<ProcessedImage | null> {
    try {
      // Generate cache key
      const cacheKey = `image:${filename}:${ImageOptimizationService.generateOptionsHash(options)}`;

      // Check cache
      const cached = await optimizedCache.get<any>(cacheKey);
      if (cached) {
        return {
          ...cached,
          buffer: Buffer.from(cached.buffer, 'base64')
        };
      }

      // Read original image
      const originalPath = path.join(this.uploadDir, filename);
      const originalBuffer = await fs.readFile(originalPath);

      // Process image
      const processed = await this.processUploadedImage(originalBuffer, filename, options);

      // Cache result
      await optimizedCache.set(cacheKey, {
        ...processed,
        buffer: processed.buffer.toString('base64')
      }, { ttl: 86400 });

      return processed;
    } catch (error) {
      logger.error('Failed to get optimized image:', error);
      return null;
    }
  }

  /**
   * Stream optimized image (for large files)
   */
  async streamOptimizedImage(
    filename: string,
    options?: ImageOptimizationOptions
  ): Promise<Readable | null> {
    try {
      const processed = await this.getOptimizedImage(filename, options);
      if (!processed) return null;

      // Convert buffer to stream
      const stream = new Readable();
      stream.push(processed.buffer);
      stream.push(null);

      return stream;
    } catch (error) {
      logger.error('Failed to stream optimized image:', error);
      return null;
    }
  }

  /**
   * Generate srcset for responsive images
   */
  async generateSrcSet(
    filename: string,
    variants?: string[]
  ): Promise<string> {
    const variantNames = variants || ['small', 'medium', 'large', 'xlarge'];
    const srcsetParts: string[] = [];

    for (const variantName of variantNames) {
      const variant = this.defaultVariants.find(v => v.name === variantName);
      if (!variant) continue;

      const url = this.getImageUrl(filename, variant.name);
      srcsetParts.push(`${url} ${variant.width}w`);
    }

    return srcsetParts.join(', ');
  }

  /**
   * Generate picture element HTML for modern format support
   */
  async generatePictureElement(
    filename: string,
    alt: string,
    options?: {
      sizes?: string;
      lazyLoad?: boolean;
      className?: string;
    }
  ): Promise<string> {
    const sizes = options?.sizes || '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
    const loading = options?.lazyLoad ? 'lazy' : 'eager';
    const className = options?.className || '';

    // Generate URLs for different formats
    const avifSrcset = await this.generateSrcSet(filename, ['avif_small', 'avif_medium', 'avif_large']);
    const webpSrcset = await this.generateSrcSet(filename, ['webp_small', 'webp_medium', 'webp_large']);
    const jpegSrcset = await this.generateSrcSet(filename, ['small', 'medium', 'large', 'xlarge']);

    return `
      <picture>
        <source type="image/avif" srcset="${avifSrcset}" sizes="${sizes}">
        <source type="image/webp" srcset="${webpSrcset}" sizes="${sizes}">
        <img 
          src="${this.getImageUrl(filename, 'medium')}" 
          srcset="${jpegSrcset}" 
          sizes="${sizes}"
          alt="${alt}"
          loading="${loading}"
          class="${className}"
        >
      </picture>
    `.trim();
  }

  /**
   * Clean up old cached images
   */
  async cleanupCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      let deletedCount = 0;
      const now = Date.now();

      // Scan cache directory
      const variants = await fs.readdir(this.cacheDir);

      for (const variant of variants) {
        const variantDir = path.join(this.cacheDir, variant);
        const stat = await fs.stat(variantDir);

        if (stat.isDirectory()) {
          const files = await fs.readdir(variantDir);

          for (const file of files) {
            const filePath = path.join(variantDir, file);
            const fileStat = await fs.stat(filePath);

            if (now - fileStat.mtime.getTime() > maxAge) {
              await fs.unlink(filePath);
              deletedCount++;
            }
          }
        }
      }

      logger.info(`Cleaned up ${deletedCount} cached images`);
      return deletedCount;
    } catch (error) {
      logger.error('Cache cleanup failed:', error);
      return 0;
    }
  }

  /**
   * Get image statistics
   */
  async getImageStats(): Promise<{
    totalImages: number;
    totalSize: number;
    cacheSize: number;
    formats: Record<string, number>;
  }> {
    try {
      const stats = {
        totalImages: 0,
        totalSize: 0,
        cacheSize: 0,
        formats: {} as Record<string, number>
      };

      // Scan upload directory
      const files = await fs.readdir(this.uploadDir);

      for (const file of files) {
        const filePath = path.join(this.uploadDir, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          stats.totalImages++;
          stats.totalSize += stat.size;

          const ext = path.extname(file).toLowerCase();
          stats.formats[ext] = (stats.formats[ext] || 0) + 1;
        }
      }

      // Calculate cache size
      const getCacheSize = async (dir: string): Promise<number> => {
        let size = 0;
        const files = await fs.readdir(dir);

        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = await fs.stat(filePath);

          if (stat.isDirectory()) {
            size += await getCacheSize(filePath);
          } else {
            size += stat.size;
          }
        }

        return size;
      };

      stats.cacheSize = await getCacheSize(this.cacheDir);

      return stats;
    } catch (error) {
      logger.error('Failed to get image stats:', error);
      return {
        totalImages: 0,
        totalSize: 0,
        cacheSize: 0,
        formats: {}
      };
    }
  }

  /**
   * Helper methods
   */

  private getOptimalFormat(originalFormat?: string): 'webp' | 'avif' | 'jpeg' | 'png' {
    // AVIF for best compression, WebP for wider support, JPEG as fallback
    if (process.env.IMAGE_FORMAT === 'avif') return 'avif';
    if (process.env.IMAGE_FORMAT === 'webp') return 'webp';

    // Keep PNG for images with transparency
    if (originalFormat === 'png') return 'png';

    // Default to JPEG
    return 'jpeg';
  }

  private getOptimalQuality(format: string): number {
    switch (format) {
      case 'avif': return 75;
      case 'webp': return 80;
      case 'jpeg': return 85;
      case 'png': return 90;
      default: return 85;
    }
  }

  private getImageUrl(filename: string, variant?: string): string {
    if (this.cdnBaseUrl) {
      return `${this.cdnBaseUrl}/images/${variant || 'original'}/${filename}`;
    }
    return `/uploads/${variant ? `cache/${variant}/` : ''}${filename}`;
  }

  private static generateOptionsHash(options?: ImageOptimizationOptions): string {
    if (!options) return 'original';

    const normalized = {
      w: options.width,
      h: options.height,
      q: options.quality,
      f: options.format,
      fit: options.fit,
      blur: options.blur,
      sharpen: options.sharpen
    };

    return createHash('md5')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .substring(0, 8);
  }
}

// Export singleton instance
export const imageOptimizationService = ImageOptimizationService.getInstance();

// Export types
export type { ImageOptimizationOptions, ProcessedImage, ImageVariant };
