import fs from 'fs/promises';
import path from 'path';

import { Request, Response } from 'express';

import {
  getSupportedLanguages,
  getLanguageInfo,
  SupportedLanguage,
  DEFAULT_LANGUAGE,
  isLanguageSupported,
  getRegionalFoodCategories,
  CURRENCY_CONFIG,
  DATE_FORMATS
} from '../config/i18n';
import { Logger } from '../core/logging/logger';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { optimizedCache } from '../services/cache/OptimizedCacheService';
import { translationService } from '../services/i18n/TranslationService';

const logger = new Logger('I18nController');

type I18nRequest = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
    company?: string;
    companyId?: string;
  };
  language?: SupportedLanguage;
}

export class I18nController {

  // Get supported languages
  async getSupportedLanguages(req: Request, res: Response): Promise<void> {
    try {
      const languages = getSupportedLanguages();

      res.json({
        success: true,
        data: {
          languages,
          default: DEFAULT_LANGUAGE,
          count: Object.keys(languages).length
        }
      });
    } catch (error) {
      logger.error('Failed to get supported languages', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve supported languages'
      });
    }
  }

  // Get language information
  async getLanguageInfo(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.params;

      if (!isLanguageSupported(code)) {
        res.status(404).json({
          success: false,
          message: 'Language not supported'
        });
        return;
      }

      const languageInfo = getLanguageInfo(code);
      const regionalCategories = getRegionalFoodCategories(code);
      const currencyConfig = CURRENCY_CONFIG[code];
      const dateFormat = DATE_FORMATS[code];

      res.json({
        success: true,
        data: {
          ...languageInfo,
          regional: {
            foodCategories: regionalCategories,
            currency: currencyConfig,
            dateFormat
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get language info', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve language information'
      });
    }
  }

  // Get translations for a namespace and language
  async getTranslations(req: Request, res: Response): Promise<void> {
    try {
      const { namespace, language } = req.params;

      if (!isLanguageSupported(language)) {
        res.status(400).json({
          success: false,
          message: 'Unsupported language'
        });
        return;
      }

      const cacheKey = `translations:${namespace}:${language}`;

      // Try cache first
      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true
        });
        return;
      }

      // Load translations from file
      const translationsPath = path.join(
        __dirname,
        '../locales',
        language,
        `${namespace}.json`
      );

      try {
        const translationsContent = await fs.readFile(translationsPath, 'utf8');
        const translations = JSON.parse(translationsContent);

        // Cache for 1 hour
        await optimizedCache.set(cacheKey, translations, { ttl: 3600 });

        res.json({
          success: true,
          data: translations
        });
      } catch (fileError) {
        res.status(404).json({
          success: false,
          message: 'Translation file not found'
        });
      }
    } catch (error) {
      logger.error('Failed to get translations', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve translations'
      });
    }
  }

  // Translate a single key
  async translateKey(req: I18nRequest, res: Response): Promise<void> {
    try {
      const { key, language, namespace, interpolation, context, count, defaultValue } = req.body;

      const targetLanguage = language || req.language || DEFAULT_LANGUAGE;

      const translated = await translationService.translateKey(key, {
        language: targetLanguage,
        namespace,
        interpolation,
        context,
        count,
        defaultValue
      });

      res.json({
        success: true,
        data: {
          key,
          translated,
          language: targetLanguage,
          namespace
        }
      });
    } catch (error) {
      logger.error('Failed to translate key', error);
      res.status(500).json({
        success: false,
        message: 'Translation failed'
      });
    }
  }

  // Translate multiple keys in bulk
  async translateBulk(req: I18nRequest, res: Response): Promise<void> {
    try {
      const { translations, language } = req.body;
      const targetLanguage = language || req.language || DEFAULT_LANGUAGE;

      const results = await translationService.translateBulk({
        translations,
        language: targetLanguage
      });

      res.json({
        success: true,
        data: {
          results,
          language: targetLanguage,
          count: results.length
        }
      });
    } catch (error) {
      logger.error('Failed to translate bulk', error);
      res.status(500).json({
        success: false,
        message: 'Bulk translation failed'
      });
    }
  }

  // Get user language preferences
  async getUserPreferences(req: I18nRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const userLanguage = await translationService.getUserLanguage(req.user.id);
      const languageInfo = getLanguageInfo(userLanguage);

      res.json({
        success: true,
        data: {
          language: userLanguage,
          languageInfo,
          detected: req.language,
          regional: {
            foodCategories: getRegionalFoodCategories(userLanguage),
            currency: CURRENCY_CONFIG[userLanguage],
            dateFormat: DATE_FORMATS[userLanguage]
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get user preferences', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user preferences'
      });
    }
  }

  // Update user language preferences
  async updateUserPreferences(req: I18nRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const { language } = req.body;

      if (!isLanguageSupported(language)) {
        res.status(400).json({
          success: false,
          message: 'Unsupported language'
        });
        return;
      }

      await translationService.setUserLanguage(req.user.id, language);

      res.json({
        success: true,
        message: 'Language preference updated successfully',
        data: {
          language,
          languageInfo: getLanguageInfo(language)
        }
      });
    } catch (error) {
      logger.error('Failed to update user preferences', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update language preference'
      });
    }
  }

  // Get company language preferences
  async getCompanyPreferences(req: I18nRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.companyId) {
        res.status(400).json({
          success: false,
          message: 'Company association required'
        });
        return;
      }

      const companyLanguage = await translationService.getCompanyLanguage(req.user.companyId);
      const languageInfo = getLanguageInfo(companyLanguage);

      res.json({
        success: true,
        data: {
          language: companyLanguage,
          languageInfo,
          regional: {
            foodCategories: getRegionalFoodCategories(companyLanguage),
            currency: CURRENCY_CONFIG[companyLanguage],
            dateFormat: DATE_FORMATS[companyLanguage]
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get company preferences', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve company preferences'
      });
    }
  }

  // Update company language preferences
  async updateCompanyPreferences(req: I18nRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.companyId) {
        res.status(400).json({
          success: false,
          message: 'Company association required'
        });
        return;
      }

      const { language } = req.body;

      if (!isLanguageSupported(language)) {
        res.status(400).json({
          success: false,
          message: 'Unsupported language'
        });
        return;
      }

      await translationService.setCompanyLanguage(req.user.companyId, language);

      res.json({
        success: true,
        message: 'Company language preference updated successfully',
        data: {
          language,
          languageInfo: getLanguageInfo(language)
        }
      });
    } catch (error) {
      logger.error('Failed to update company preferences', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update company language preference'
      });
    }
  }

  // Format currency
  async formatCurrency(req: I18nRequest, res: Response): Promise<void> {
    try {
      const { amount, currency, language } = req.body;
      const targetLanguage = language || req.language || DEFAULT_LANGUAGE;

      const formatted = translationService.formatCurrency(amount, currency, targetLanguage);

      res.json({
        success: true,
        data: {
          original: amount,
          currency,
          formatted,
          language: targetLanguage
        }
      });
    } catch (error) {
      logger.error('Failed to format currency', error);
      res.status(500).json({
        success: false,
        message: 'Currency formatting failed'
      });
    }
  }

  // Format date
  async formatDate(req: I18nRequest, res: Response): Promise<void> {
    try {
      const { date, language, options = {} } = req.body;
      const targetLanguage = language || req.language || DEFAULT_LANGUAGE;

      const dateObj = new Date(date);
      const formatted = translationService.formatDate(dateObj, targetLanguage, options);
      const relative = translationService.formatRelativeTime(dateObj, targetLanguage);

      res.json({
        success: true,
        data: {
          original: date,
          formatted,
          relative,
          language: targetLanguage
        }
      });
    } catch (error) {
      logger.error('Failed to format date', error);
      res.status(500).json({
        success: false,
        message: 'Date formatting failed'
      });
    }
  }

  // Format number
  async formatNumber(req: I18nRequest, res: Response): Promise<void> {
    try {
      const { number, language } = req.body;
      const targetLanguage = language || req.language || DEFAULT_LANGUAGE;

      const formatted = translationService.formatNumber(number, targetLanguage);

      res.json({
        success: true,
        data: {
          original: number,
          formatted,
          language: targetLanguage
        }
      });
    } catch (error) {
      logger.error('Failed to format number', error);
      res.status(500).json({
        success: false,
        message: 'Number formatting failed'
      });
    }
  }

  // Localize content
  async localizeContent(req: I18nRequest, res: Response): Promise<void> {
    try {
      const { content, language } = req.body;
      const targetLanguage = language || req.language || DEFAULT_LANGUAGE;

      const localized = await translationService.getLocalizedContent(content, targetLanguage);

      res.json({
        success: true,
        data: {
          localized,
          language: targetLanguage
        }
      });
    } catch (error) {
      logger.error('Failed to localize content', error);
      res.status(500).json({
        success: false,
        message: 'Content localization failed'
      });
    }
  }

  // Translate email template
  async translateEmailTemplate(req: I18nRequest, res: Response): Promise<void> {
    try {
      const { templateKey, data = {}, language } = req.body;
      const targetLanguage = language || req.language || DEFAULT_LANGUAGE;

      const translated = await translationService.translateEmail(templateKey, data, targetLanguage);

      res.json({
        success: true,
        data: {
          template: templateKey,
          translated,
          language: targetLanguage
        }
      });
    } catch (error) {
      logger.error('Failed to translate email template', error);
      res.status(500).json({
        success: false,
        message: 'Email template translation failed'
      });
    }
  }

  // Translate notification template
  async translateNotificationTemplate(req: I18nRequest, res: Response): Promise<void> {
    try {
      const { templateKey, data = {}, language } = req.body;
      const targetLanguage = language || req.language || DEFAULT_LANGUAGE;

      const translated = await translationService.translateNotification(templateKey, data, targetLanguage);

      res.json({
        success: true,
        data: {
          template: templateKey,
          translated,
          language: targetLanguage
        }
      });
    } catch (error) {
      logger.error('Failed to translate notification template', error);
      res.status(500).json({
        success: false,
        message: 'Notification template translation failed'
      });
    }
  }

  // Get regional settings
  async getRegionalSettings(req: Request, res: Response): Promise<void> {
    try {
      const { language } = req.params;

      if (!isLanguageSupported(language)) {
        res.status(400).json({
          success: false,
          message: 'Unsupported language'
        });
        return;
      }

      const lang = language;

      res.json({
        success: true,
        data: {
          language: lang,
          foodCategories: getRegionalFoodCategories(lang),
          currency: CURRENCY_CONFIG[lang],
          dateFormat: DATE_FORMATS[lang],
          languageInfo: getLanguageInfo(lang)
        }
      });
    } catch (error) {
      logger.error('Failed to get regional settings', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve regional settings'
      });
    }
  }

  // Get language usage statistics
  async getLanguageUsageStats(req: Request, res: Response): Promise<void> {
    try {
      // Get user language distribution
      const userStats = await User.aggregate([
        {
          $group: {
            _id: '$preferences.language',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      // Get company language distribution
      const companyStats = await Company.aggregate([
        {
          $group: {
            _id: '$preferences.language',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      // Calculate totals
      const totalUsers = await User.countDocuments();
      const totalCompanies = await Company.countDocuments();

      res.json({
        success: true,
        data: {
          users: {
            distribution: userStats,
            total: totalUsers
          },
          companies: {
            distribution: companyStats,
            total: totalCompanies
          },
          supportedLanguages: Object.keys(getSupportedLanguages()).length
        }
      });
    } catch (error) {
      logger.error('Failed to get language usage stats', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve usage statistics'
      });
    }
  }

  // Get missing translations (development only)
  async getMissingTranslations(req: Request, res: Response): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({
          success: false,
          message: 'Not available in production'
        });
        return;
      }

      const missingKeys = translationService.getMissingKeys();

      res.json({
        success: true,
        data: {
          missingKeys,
          count: missingKeys.length
        }
      });
    } catch (error) {
      logger.error('Failed to get missing translations', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve missing translations'
      });
    }
  }
}

export const i18nController = new I18nController();
