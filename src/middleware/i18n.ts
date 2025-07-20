import { Request, Response, NextFunction } from 'express';

import { i18n, SupportedLanguage, DEFAULT_LANGUAGE, isLanguageSupported } from '../config/i18n';
import { Logger } from '../core/logging/logger';
import { translationService } from '../services/i18n/TranslationService';

const logger = new Logger('I18nMiddleware');

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      language?: SupportedLanguage;
      t?: (key: string, options?: any) => string;
      locale?: SupportedLanguage;
      user?: {
        id: string;
        role: string;
        companyId?: string;
      };
    }
  }
}

export interface I18nOptions {
  detectFromUser?: boolean;
  detectFromCompany?: boolean;
  cookieName?: string;
  headerName?: string;
  queryParam?: string;
  fallbackLanguage?: SupportedLanguage;
}

// Language detection middleware
export const languageDetectionMiddleware = (options: I18nOptions = {}) => {
  const {
    detectFromUser = true,
    detectFromCompany = false,
    cookieName = 'language',
    headerName = 'accept-language',
    queryParam = 'lang',
    fallbackLanguage = DEFAULT_LANGUAGE
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let detectedLanguage: SupportedLanguage = fallbackLanguage;

      // 1. Check query parameter first (highest priority)
      if (req.query[queryParam]) {
        const queryLang = req.query[queryParam] as string;
        if (isLanguageSupported(queryLang)) {
          detectedLanguage = queryLang;
          logger.debug('Language detected from query parameter', { language: detectedLanguage });
        }
      }

      // 2. Check custom header
      else if (req.headers[headerName.toLowerCase()]) {
        const headerLang = req.headers[headerName.toLowerCase()] as string;
        const primaryLang = headerLang.split(',')[0].split('-')[0].trim();
        if (isLanguageSupported(primaryLang)) {
          detectedLanguage = primaryLang;
          logger.debug('Language detected from header', { language: detectedLanguage });
        }
      }

      // 3. Check cookie
      else if (req.cookies[cookieName]) {
        const cookieLang = req.cookies[cookieName];
        if (isLanguageSupported(cookieLang)) {
          detectedLanguage = cookieLang;
          logger.debug('Language detected from cookie', { language: detectedLanguage });
        }
      }

      // 4. Check user preferences (if authenticated and enabled)
      else if (detectFromUser && req.user?.id) {
        try {
          const userLanguage = await translationService.getUserLanguage(req.user.id);
          detectedLanguage = userLanguage;
          logger.debug('Language detected from user preferences', {
            userId: req.user.id,
            language: detectedLanguage
          });
        } catch (error) {
          logger.warn('Failed to get user language preference', {
            userId: req.user.id,
            error
          });
        }
      }

      // 5. Check company preferences (if enabled and user has company)
      else if (detectFromCompany && req.user?.companyId) {
        try {
          const companyLanguage = await translationService.getCompanyLanguage(req.user.companyId);
          detectedLanguage = companyLanguage;
          logger.debug('Language detected from company preferences', {
            companyId: req.user.companyId,
            language: detectedLanguage
          });
        } catch (error) {
          logger.warn('Failed to get company language preference', {
            companyId: req.user.companyId,
            error
          });
        }
      }

      // Set language on request object
      req.language = detectedLanguage;
      req.locale = detectedLanguage;

      // Set language for i18next
      i18n.changeLanguage(detectedLanguage);

      // Add translation function to request
      req.t = (key: string, options: any = {}) => {
        return i18n.getFixedT(detectedLanguage)(key, options);
      };

      // Set language cookie if it changed
      if (req.cookies[cookieName] !== detectedLanguage) {
        res.cookie(cookieName, detectedLanguage, {
          maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        });
      }

      // Add language to response headers
      res.setHeader('Content-Language', detectedLanguage);

      logger.debug('Language detection completed', {
        detectedLanguage,
        userId: req.user?.id,
        companyId: req.user?.companyId
      });

      next();
    } catch (error) {
      logger.error('Language detection failed', error);
      // Set fallback language and continue
      req.language = fallbackLanguage;
      req.locale = fallbackLanguage;
      req.t = (key: string, options: any = {}) => {
        return i18n.getFixedT(fallbackLanguage)(key, options);
      };
      next();
    }
  };
};

// Translation helper middleware
export const translationMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const language = req.language || DEFAULT_LANGUAGE;

    // Add translation helpers to response locals
    res.locals.t = async (key: string, options: any = {}) => {
      return translationService.translateKey(key, {
        language,
        ...options
      });
    };

    res.locals.formatCurrency = (amount: number, currency: string) => {
      return translationService.formatCurrency(amount, currency, language);
    };

    res.locals.formatNumber = (number: number) => {
      return translationService.formatNumber(number, language);
    };

    res.locals.formatDate = (date: Date, options?: Intl.DateTimeFormatOptions) => {
      return translationService.formatDate(date, language, options);
    };

    res.locals.formatRelativeTime = (date: Date) => {
      return translationService.formatRelativeTime(date, language);
    };

    res.locals.language = language;
    res.locals.locale = language;

    next();
  };
};

// Content localization middleware for API responses
export const responseLocalizationMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json;
    const language = req.language || DEFAULT_LANGUAGE;

    res.json = function(body: any) {
      // Localize specific fields in the response
      if (body && typeof body === 'object') {
        body = localizeResponseContent(body, language);
      }

      return originalJson.call(this, body);
    };

    next();
  };
};

// Localize content in API responses
function localizeResponseContent(obj: any, language: SupportedLanguage): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => localizeResponseContent(item, language));
  }

  const localized = { ...obj };

  // Handle localized content fields
  for (const [key, value] of Object.entries(obj)) {
    if (key.endsWith('_localized') && value && typeof value === 'object') {
      const baseKey = key.replace('_localized', '');
      if (value[language]) {
        localized[baseKey] = value[language];
      } else if (value[DEFAULT_LANGUAGE]) {
        localized[baseKey] = value[DEFAULT_LANGUAGE];
      }
      // Remove the _localized field from response
      delete localized[key];
    } else if (typeof value === 'object' && value !== null) {
      localized[key] = localizeResponseContent(value, language);
    }
  }

  return localized;
}

// Error message localization middleware
export const errorLocalizationMiddleware = () => {
  return async (error: any, req: Request, res: Response, next: NextFunction) => {
    if (error && req.language) {
      try {
        // Translate error message if it has a translation key
        if (error.translationKey) {
          error.message = await translationService.translateError(
            error.translationKey,
            error.interpolation || {},
            req.language
          );
        }

        // Translate validation errors
        if (error.errors && Array.isArray(error.errors)) {
          for (const validationError of error.errors) {
            if (validationError.translationKey) {
              validationError.message = await translationService.translateValidation(
                validationError.translationKey,
                validationError.interpolation || {},
                req.language
              );
            }
          }
        }
      } catch (translationError) {
        logger.warn('Failed to localize error message', {
          originalError: error,
          translationError
        });
      }
    }

    next(error);
  };
};

// Language preference update middleware
export const languagePreferenceMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { language } = req.body;

      if (language && isLanguageSupported(language) && req.user?.id) {
        await translationService.setUserLanguage(req.user.id, language);

        // Update request language
        req.language = language;
        req.locale = language;

        // Update cookie
        res.cookie('language', language, {
          maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        });

        logger.info('User language preference updated', {
          userId: req.user.id,
          language
        });
      }

      next();
    } catch (error) {
      logger.error('Failed to update language preference', error);
      next(error);
    }
  };
};

// RTL (Right-to-Left) detection middleware
export const rtlDetectionMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const language = req.language || DEFAULT_LANGUAGE;
    const rtlLanguages: SupportedLanguage[] = ['ar'];

    const isRTL = rtlLanguages.includes(language);

    res.locals.isRTL = isRTL;
    res.locals.direction = isRTL ? 'rtl' : 'ltr';

    // Add direction to response headers
    res.setHeader('Content-Direction', isRTL ? 'rtl' : 'ltr');

    next();
  };
};

// Export all middleware
export {
  I18nOptions
};

export default {
  languageDetection: languageDetectionMiddleware,
  translation: translationMiddleware,
  responseLocalization: responseLocalizationMiddleware,
  errorLocalization: errorLocalizationMiddleware,
  languagePreference: languagePreferenceMiddleware,
  rtlDetection: rtlDetectionMiddleware
};
