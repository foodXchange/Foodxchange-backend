import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../core/errors';

export interface ApiVersionConfig {
  supportedVersions: string[];
  defaultVersion: string;
  deprecatedVersions: string[];
}

const DEFAULT_CONFIG: ApiVersionConfig = {
  supportedVersions: ['1.0', '1.1', '2.0'],
  defaultVersion: '1.0',
  deprecatedVersions: ['1.0'],
};

export const createApiVersionMiddleware = (config: Partial<ApiVersionConfig> = {}) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const version = extractVersion(req);
    
    // Use default version if none specified
    if (!version) {
      req.apiVersion = finalConfig.defaultVersion;
      addVersionHeaders(res, finalConfig.defaultVersion, finalConfig);
      return next();
    }
    
    // Check if version is supported
    if (!finalConfig.supportedVersions.includes(version)) {
      throw new ApiError(
        `API version ${version} is not supported. Supported versions: ${finalConfig.supportedVersions.join(', ')}`,
        400
      );
    }
    
    req.apiVersion = version;
    addVersionHeaders(res, version, finalConfig);
    
    // Add deprecation warning for deprecated versions
    if (finalConfig.deprecatedVersions.includes(version)) {
      res.setHeader('Warning', `299 - "API version ${version} is deprecated. Please upgrade to a newer version."`);
    }
    
    next();
  };
};

const extractVersion = (req: Request): string | null => {
  // Check header first (preferred)
  const headerVersion = req.headers['api-version'] as string;
  if (headerVersion) {
    return headerVersion;
  }
  
  // Check query parameter
  const queryVersion = req.query.version as string;
  if (queryVersion) {
    return queryVersion;
  }
  
  // Check URL path (e.g., /v1/users)
  const pathVersion = req.path.match(/^\/v(\d+(?:\.\d+)?)/);
  if (pathVersion) {
    return pathVersion[1];
  }
  
  return null;
};

const addVersionHeaders = (res: Response, version: string, config: ApiVersionConfig): void => {
  res.setHeader('API-Version', version);
  res.setHeader('API-Supported-Versions', config.supportedVersions.join(', '));
  res.setHeader('API-Default-Version', config.defaultVersion);
};

// Version-specific route handler
export const versionHandler = (versionHandlers: Record<string, Function>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const version = req.apiVersion || '1.0';
    
    // Find the best matching handler
    const handler = findBestHandler(version, versionHandlers);
    
    if (!handler) {
      throw new ApiError(
        `No handler found for API version ${version}`,
        501
      );
    }
    
    handler(req, res, next);
  };
};

const findBestHandler = (version: string, handlers: Record<string, Function>): Function | null => {
  // Exact match first
  if (handlers[version]) {
    return handlers[version];
  }
  
  // Find the highest compatible version
  const availableVersions = Object.keys(handlers).sort((a, b) => {
    const aVersion = parseVersion(a);
    const bVersion = parseVersion(b);
    return bVersion.major - aVersion.major || bVersion.minor - aVersion.minor;
  });
  
  const requestedVersion = parseVersion(version);
  
  for (const availableVersion of availableVersions) {
    const available = parseVersion(availableVersion);
    
    // Same major version and available minor version <= requested minor version
    if (available.major === requestedVersion.major && available.minor <= requestedVersion.minor) {
      return handlers[availableVersion];
    }
  }
  
  return null;
};

const parseVersion = (version: string): { major: number; minor: number } => {
  const parts = version.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
  };
};

// Default API version middleware
export const apiVersionMiddleware = createApiVersionMiddleware();