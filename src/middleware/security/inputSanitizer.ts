import { Request, Response, NextFunction } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/metrics/MetricsService';
import { ValidationError } from '../../core/errors';

const logger = new Logger('InputSanitizer');
const metricsService = new MetricsService();

export interface SanitizationOptions {
  strictMode?: boolean;
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  maxLength?: number;
  enforceContentType?: boolean;
}

export class InputSanitizer {
  private static instance: InputSanitizer;
  private readonly dangerousPatterns: RegExp[];
  private readonly sqlInjectionPatterns: RegExp[];
  private readonly xssPatterns: RegExp[];
  private readonly pathTraversalPatterns: RegExp[];
  private readonly commandInjectionPatterns: RegExp[];

  private constructor() {
    this.dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
      /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /data:text\/html/gi,
      /on\w+\s*=/gi
    ];

    this.sqlInjectionPatterns = [
      /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|MERGE|SELECT|UPDATE|UNION|FROM|WHERE|JOIN)\b)/gi,
      /(\'|\"|;|\-\-|\#|\/\*|\*\/)/g,
      /(\b(OR|AND)\b.*\b(=|LIKE|IN|BETWEEN)\b)/gi,
      /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|EXEC)\b.*\b(FROM|WHERE|INTO|SET|VALUES)\b)/gi
    ];

    this.xssPatterns = [
      /<[^>]*>/g,
      /javascript:/gi,
      /vbscript:/gi,
      /onload|onerror|onclick|onmouseover|onkeydown|onkeyup/gi,
      /expression\s*\(/gi,
      /url\s*\(/gi,
      /@import/gi,
      /\&\#/g
    ];

    this.pathTraversalPatterns = [
      /\.\.\//g,
      /\.\.\\\\g,
      /%2e%2e%2f/gi,
      /%2e%2e%5c/gi,
      /\.\.%2f/gi,
      /\.\.%5c/gi,
      /%2e%2e/gi
    ];

    this.commandInjectionPatterns = [
      /[;&|`$(){}[\]<>]/g,
      /\b(exec|eval|system|shell_exec|passthru|popen|proc_open)\b/gi,
      /\b(cmd|command|bash|sh|powershell|pwsh)\b/gi,
      /(\||;|&|\`|\$\(|\$\{)/g
    ];
  }

  public static getInstance(): InputSanitizer {
    if (!InputSanitizer.instance) {
      InputSanitizer.instance = new InputSanitizer();
    }
    return InputSanitizer.instance;
  }

  public sanitizeString(input: string, options: SanitizationOptions = {}): string {
    if (typeof input !== 'string') {
      return input;
    }

    let sanitized = input;

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Length validation
    if (options.maxLength && sanitized.length > options.maxLength) {
      throw new ValidationError(`Input exceeds maximum length of ${options.maxLength} characters`);
    }

    // Remove dangerous patterns
    if (options.strictMode) {
      this.dangerousPatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
      });

      this.xssPatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
      });
    }

    // Remove SQL injection patterns
    this.sqlInjectionPatterns.forEach(pattern => {
      if (pattern.test(sanitized)) {
        logger.warn('SQL injection attempt detected', { 
          input: input.substring(0, 100),
          pattern: pattern.source
        });
        metricsService.incrementCounter('security_violations_total', {
          type: 'sql_injection',
          severity: 'high'
        });
        sanitized = sanitized.replace(pattern, '');
      }
    });

    // Remove path traversal patterns
    this.pathTraversalPatterns.forEach(pattern => {
      if (pattern.test(sanitized)) {
        logger.warn('Path traversal attempt detected', { 
          input: input.substring(0, 100),
          pattern: pattern.source
        });
        metricsService.incrementCounter('security_violations_total', {
          type: 'path_traversal',
          severity: 'high'
        });
        sanitized = sanitized.replace(pattern, '');
      }
    });

    // Remove command injection patterns
    this.commandInjectionPatterns.forEach(pattern => {
      if (pattern.test(sanitized)) {
        logger.warn('Command injection attempt detected', { 
          input: input.substring(0, 100),
          pattern: pattern.source
        });
        metricsService.incrementCounter('security_violations_total', {
          type: 'command_injection',
          severity: 'critical'
        });
        sanitized = sanitized.replace(pattern, '');
      }
    });

    // Encode HTML entities
    sanitized = this.encodeHtmlEntities(sanitized);

    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  public sanitizeObject(obj: any, options: SanitizationOptions = {}): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj, options);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, options));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize both key and value
        const sanitizedKey = this.sanitizeString(key, { maxLength: 100 });
        sanitized[sanitizedKey] = this.sanitizeObject(value, options);
      }
      return sanitized;
    }

    return obj;
  }

  private encodeHtmlEntities(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  public validateFileUpload(file: any, options: {
    allowedTypes?: string[];
    maxSize?: number;
    allowedExtensions?: string[];
  } = {}): boolean {
    if (!file) {
      return false;
    }

    const {
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
      maxSize = 5 * 1024 * 1024, // 5MB
      allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'pdf']
    } = options;

    // Check file size
    if (file.size > maxSize) {
      logger.warn('File upload rejected: size exceeded', {
        filename: file.originalname,
        size: file.size,
        maxSize
      });
      return false;
    }

    // Check MIME type
    if (!allowedTypes.includes(file.mimetype)) {
      logger.warn('File upload rejected: invalid MIME type', {
        filename: file.originalname,
        mimetype: file.mimetype,
        allowedTypes
      });
      return false;
    }

    // Check file extension
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      logger.warn('File upload rejected: invalid extension', {
        filename: file.originalname,
        extension,
        allowedExtensions
      });
      return false;
    }

    // Check for suspicious file names
    const suspiciousPatterns = [
      /\.(php|asp|aspx|jsp|exe|sh|bat|cmd|scr|vbs|js|jar|war)$/i,
      /\.\./,
      /[<>:"\\|?*]/,
      /^\./,
      /\.$/ 
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(file.originalname)) {
        logger.warn('File upload rejected: suspicious filename', {
          filename: file.originalname,
          pattern: pattern.source
        });
        return false;
      }
    }

    return true;
  }

  public sanitizeFilename(filename: string): string {
    if (!filename) {
      return '';
    }

    // Remove directory traversal attempts
    let sanitized = filename.replace(/\.\./g, '');
    
    // Remove special characters
    sanitized = sanitized.replace(/[<>:"\\|?*]/g, '');
    
    // Remove leading/trailing dots and spaces
    sanitized = sanitized.replace(/^[\s\.]+|[\s\.]+$/g, '');
    
    // Limit length
    if (sanitized.length > 255) {
      const extension = sanitized.substring(sanitized.lastIndexOf('.'));
      sanitized = sanitized.substring(0, 255 - extension.length) + extension;
    }
    
    return sanitized;
  }

  public validateHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const allowedHeaders = [
      'content-type',
      'authorization',
      'accept',
      'accept-language',
      'accept-encoding',
      'user-agent',
      'x-requested-with',
      'x-forwarded-for',
      'x-real-ip',
      'host',
      'origin',
      'referer',
      'cache-control',
      'pragma',
      'expires',
      'if-modified-since',
      'if-none-match',
      'x-request-id',
      'x-correlation-id'
    ];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      if (allowedHeaders.includes(lowerKey)) {
        // Sanitize header value
        const sanitizedValue = this.sanitizeString(value, { maxLength: 1000 });
        sanitized[lowerKey] = sanitizedValue;
      } else if (lowerKey.startsWith('x-')) {
        // Allow custom headers starting with x-
        const sanitizedValue = this.sanitizeString(value, { maxLength: 1000 });
        sanitized[lowerKey] = sanitizedValue;
      }
    }

    return sanitized;
  }

  public detectMaliciousPatterns(input: string): {
    isMalicious: boolean;
    detectedPatterns: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
  } {
    const detectedPatterns: string[] = [];
    let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Check for SQL injection
    for (const pattern of this.sqlInjectionPatterns) {
      if (pattern.test(input)) {
        detectedPatterns.push(`SQL injection: ${pattern.source}`);
        maxSeverity = 'high';
      }
    }

    // Check for XSS
    for (const pattern of this.xssPatterns) {
      if (pattern.test(input)) {
        detectedPatterns.push(`XSS: ${pattern.source}`);
        maxSeverity = 'high';
      }
    }

    // Check for path traversal
    for (const pattern of this.pathTraversalPatterns) {
      if (pattern.test(input)) {
        detectedPatterns.push(`Path traversal: ${pattern.source}`);
        maxSeverity = 'high';
      }
    }

    // Check for command injection
    for (const pattern of this.commandInjectionPatterns) {
      if (pattern.test(input)) {
        detectedPatterns.push(`Command injection: ${pattern.source}`);
        maxSeverity = 'critical';
      }
    }

    return {
      isMalicious: detectedPatterns.length > 0,
      detectedPatterns,
      severity: maxSeverity
    };
  }
}

// Middleware factory
export const createSanitizationMiddleware = (options: SanitizationOptions = {}) => {
  const sanitizer = InputSanitizer.getInstance();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Sanitize request body
      if (req.body) {
        req.body = sanitizer.sanitizeObject(req.body, options);
      }

      // Sanitize query parameters
      if (req.query) {
        req.query = sanitizer.sanitizeObject(req.query, options);
      }

      // Sanitize URL parameters
      if (req.params) {
        req.params = sanitizer.sanitizeObject(req.params, options);
      }

      // Validate and sanitize headers
      req.headers = sanitizer.validateHeaders(req.headers as Record<string, string>);

      // Check for malicious patterns in the entire request
      const requestString = JSON.stringify({
        body: req.body,
        query: req.query,
        params: req.params,
        url: req.url
      });

      const maliciousCheck = sanitizer.detectMaliciousPatterns(requestString);
      if (maliciousCheck.isMalicious) {
        logger.error('Malicious request detected', {
          url: req.url,
          method: req.method,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          patterns: maliciousCheck.detectedPatterns,
          severity: maliciousCheck.severity
        });

        metricsService.incrementCounter('malicious_requests_total', {
          severity: maliciousCheck.severity,
          patterns: maliciousCheck.detectedPatterns.length.toString()
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'MALICIOUS_REQUEST',
            message: 'Request contains potentially malicious content',
            timestamp: new Date().toISOString(),
            statusCode: 400
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Input sanitization error:', error);
      next(error);
    }
  };
};

// MongoDB sanitization middleware
export const mongoSanitizeMiddleware = mongoSanitize({
  replaceWith: '_',
  onSanitize: (key: string, value: any) => {
    logger.warn('MongoDB injection attempt detected', { key, value });
    metricsService.incrementCounter('security_violations_total', {
      type: 'mongo_injection',
      severity: 'high'
    });
  }
});

// Combined security middleware
export const securitySanitizationMiddleware = [
  mongoSanitizeMiddleware,
  createSanitizationMiddleware({
    strictMode: true,
    maxLength: 10000
  })
];

// Export singleton instance
export const inputSanitizer = InputSanitizer.getInstance();
export default inputSanitizer;