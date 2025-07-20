import { TranslationService } from '../../../../services/i18n/TranslationService';
import { optimizedCache } from '../../../../services/cache/OptimizedCacheService';
import { User } from '../../../../models/User';
import { Company } from '../../../../models/Company';
import { SupportedLanguage, DEFAULT_LANGUAGE } from '../../../../config/i18n';

// Mock dependencies
jest.mock('../../../../services/cache/OptimizedCacheService', () => ({
  optimizedCache: {
    get: jest.fn(),
    set: jest.fn(),
    deletePattern: jest.fn()
  }
}));

jest.mock('../../../../models/User');
jest.mock('../../../../models/Company');

jest.mock('../../../../core/logging/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

jest.mock('../../../../config/i18n', () => ({
  i18n: {
    getFixedT: jest.fn().mockReturnValue((key: string) => `translated_${key}`),
    t: jest.fn().mockReturnValue('translated_text'),
    options: {
      supportedLngs: ['en', 'es', 'fr', 'de']
    }
  },
  translate: jest.fn().mockReturnValue('translated_text'),
  SupportedLanguage: {},
  DEFAULT_LANGUAGE: 'en',
  isLanguageSupported: jest.fn().mockImplementation((lang: string) => 
    ['en', 'es', 'fr', 'de'].includes(lang)
  ),
  SUPPORTED_LANGUAGES: {
    en: { code: 'en', name: 'English' },
    es: { code: 'es', name: 'Spanish' },
    fr: { code: 'fr', name: 'French' },
    de: { code: 'de', name: 'German' }
  }
}));

describe('TranslationService', () => {
  let translationService: TranslationService;
  let mockUser: any;
  let mockCompany: any;

  beforeEach(() => {
    translationService = new TranslationService();
    
    mockUser = {
      _id: 'user123',
      preferences: { language: 'es' },
      findByIdAndUpdate: jest.fn()
    };
    
    mockCompany = {
      _id: 'company123',
      preferences: { language: 'fr' },
      location: { country: 'FR' },
      findByIdAndUpdate: jest.fn()
    };

    jest.clearAllMocks();
  });

  describe('getUserLanguage', () => {
    test('should return cached user language', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue('es');

      const result = await translationService.getUserLanguage('user123');

      expect(result).toBe('es');
      expect(optimizedCache.get).toHaveBeenCalledWith('user_language:user123');
      expect(User.findById).not.toHaveBeenCalled();
    });

    test('should fetch and cache user language from database', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      const result = await translationService.getUserLanguage('user123');

      expect(result).toBe('es');
      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(optimizedCache.set).toHaveBeenCalledWith('user_language:user123', 'es', 3600);
    });

    test('should return default language if user not found', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const result = await translationService.getUserLanguage('user123');

      expect(result).toBe(DEFAULT_LANGUAGE);
    });

    test('should return default language on error', async () => {
      (optimizedCache.get as jest.Mock).mockRejectedValue(new Error('Cache error'));

      const result = await translationService.getUserLanguage('user123');

      expect(result).toBe(DEFAULT_LANGUAGE);
    });

    test('should return default language for unsupported language', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({
          preferences: { language: 'unsupported' }
        })
      });

      const result = await translationService.getUserLanguage('user123');

      expect(result).toBe(DEFAULT_LANGUAGE);
    });
  });

  describe('getCompanyLanguage', () => {
    test('should return cached company language', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue('fr');

      const result = await translationService.getCompanyLanguage('company123');

      expect(result).toBe('fr');
      expect(optimizedCache.get).toHaveBeenCalledWith('company_language:company123');
    });

    test('should fetch company language from database', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (Company.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(mockCompany)
      });

      const result = await translationService.getCompanyLanguage('company123');

      expect(result).toBe('fr');
      expect(optimizedCache.set).toHaveBeenCalledWith('company_language:company123', 'fr', 3600);
    });

    test('should fallback to country-based language detection', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (Company.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({
          preferences: {},
          location: { country: 'DE' }
        })
      });

      const result = await translationService.getCompanyLanguage('company123');

      expect(result).toBe('de');
    });
  });

  describe('setUserLanguage', () => {
    test('should update user language successfully', async () => {
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockUser);

      await translationService.setUserLanguage('user123', 'fr');

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
        'preferences.language': 'fr'
      });
      expect(optimizedCache.set).toHaveBeenCalledWith('user_language:user123', 'fr', 3600);
    });

    test('should throw error for unsupported language', async () => {
      await expect(
        translationService.setUserLanguage('user123', 'unsupported' as SupportedLanguage)
      ).rejects.toThrow('Unsupported language: unsupported');
    });
  });

  describe('setCompanyLanguage', () => {
    test('should update company language successfully', async () => {
      (Company.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockCompany);

      await translationService.setCompanyLanguage('company123', 'de');

      expect(Company.findByIdAndUpdate).toHaveBeenCalledWith('company123', {
        'preferences.language': 'de'
      });
      expect(optimizedCache.set).toHaveBeenCalledWith('company_language:company123', 'de', 3600);
    });

    test('should throw error for unsupported language', async () => {
      await expect(
        translationService.setCompanyLanguage('company123', 'unsupported' as SupportedLanguage)
      ).rejects.toThrow('Unsupported language: unsupported');
    });
  });

  describe('translateKey', () => {
    test('should translate key successfully', async () => {
      const result = await translationService.translateKey('welcome', {
        language: 'es',
        namespace: 'common'
      });

      expect(result).toBe('translated_text');
    });

    test('should return cached translation', async () => {
      // First call
      await translationService.translateKey('welcome', { language: 'es' });
      
      // Second call should use cache
      const result = await translationService.translateKey('welcome', { language: 'es' });
      
      expect(result).toBe('translated_text');
    });

    test('should handle translation with interpolation', async () => {
      const result = await translationService.translateKey('greeting', {
        language: 'es',
        interpolation: { name: 'John' }
      });

      expect(result).toBe('translated_text');
    });

    test('should handle translation with context and count', async () => {
      const result = await translationService.translateKey('items', {
        language: 'es',
        context: 'plural',
        count: 5
      });

      expect(result).toBe('translated_text');
    });

    test('should return default value on error', async () => {
      const mockTranslate = require('../../../../config/i18n').translate;
      mockTranslate.mockImplementationOnce(() => {
        throw new Error('Translation error');
      });

      const result = await translationService.translateKey('error_key', {
        defaultValue: 'fallback_value'
      });

      expect(result).toBe('fallback_value');
    });

    test('should return key as fallback when no default value', async () => {
      const mockTranslate = require('../../../../config/i18n').translate;
      mockTranslate.mockImplementationOnce(() => {
        throw new Error('Translation error');
      });

      const result = await translationService.translateKey('error_key');

      expect(result).toBe('error_key');
    });
  });

  describe('translateBulk', () => {
    test('should translate multiple keys', async () => {
      const translations = [
        { key: 'welcome', options: { namespace: 'common' } },
        { key: 'goodbye', options: { namespace: 'common' } }
      ];

      const results = await translationService.translateBulk({
        translations,
        language: 'es'
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        key: 'welcome',
        translated: 'translated_text',
        language: 'es',
        namespace: 'common'
      });
    });
  });

  describe('getLocalizedContent', () => {
    test('should return localized content for specified language', async () => {
      const content = {
        title: {
          en: 'English Title',
          es: 'Título Español',
          fr: 'Titre Français'
        },
        description: {
          en: 'English Description',
          es: 'Descripción Española'
        }
      };

      const result = await translationService.getLocalizedContent(content, 'es');

      expect(result).toEqual({
        title: 'Título Español',
        description: 'Descripción Española'
      });
    });

    test('should fallback to default language', async () => {
      const content = {
        title: {
          en: 'English Title',
          fr: 'Titre Français'
        }
      };

      const result = await translationService.getLocalizedContent(content, 'es');

      expect(result).toEqual({
        title: 'English Title'
      });
    });

    test('should fallback to key when no translation available', async () => {
      const content = {
        title: {
          fr: 'Titre Français'
        }
      };

      const result = await translationService.getLocalizedContent(content, 'es');

      expect(result).toEqual({
        title: 'title'
      });
    });
  });

  describe('translateEmail', () => {
    test('should translate email template', async () => {
      const result = await translationService.translateEmail(
        'welcome',
        { name: 'John' },
        'es'
      );

      expect(result).toEqual({
        subject: 'translated_text',
        body: 'translated_text'
      });
    });
  });

  describe('translateNotification', () => {
    test('should translate notification template', async () => {
      const result = await translationService.translateNotification(
        'order_shipped',
        { orderNumber: '12345' },
        'es'
      );

      expect(result).toEqual({
        title: 'translated_text',
        message: 'translated_text'
      });
    });
  });

  describe('translateError', () => {
    test('should translate error message', async () => {
      const result = await translationService.translateError(
        'validation.required',
        { field: 'email' },
        'es'
      );

      expect(result).toBe('translated_text');
    });
  });

  describe('translateValidation', () => {
    test('should translate validation message', async () => {
      const result = await translationService.translateValidation(
        'required',
        { field: 'email' },
        'es'
      );

      expect(result).toBe('translated_text');
    });
  });

  describe('formatting methods', () => {
    test('should format currency', () => {
      const result = translationService.formatCurrency(1234.56, 'USD', 'en');
      expect(typeof result).toBe('string');
      expect(result).toContain('1,234.56');
    });

    test('should format number', () => {
      const result = translationService.formatNumber(1234.56, 'en');
      expect(typeof result).toBe('string');
      expect(result).toContain('1,234.56');
    });

    test('should format date', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = translationService.formatDate(date, 'en');
      expect(typeof result).toBe('string');
    });

    test('should format relative time', () => {
      const date = new Date(Date.now() - 3600000); // 1 hour ago
      const result = translationService.formatRelativeTime(date, 'en');
      expect(typeof result).toBe('string');
    });

    test('should handle formatting errors gracefully', () => {
      const result = translationService.formatCurrency(1234.56, 'INVALID', 'en');
      expect(result).toBe('INVALID 1234.56');
    });
  });

  describe('getAvailableTranslations', () => {
    test('should return translations for all supported languages', async () => {
      const result = await translationService.getAvailableTranslations('welcome', 'common');
      
      expect(typeof result).toBe('object');
      expect(Object.keys(result)).toContain('en');
    });
  });

  describe('cache management', () => {
    test('should clear cache successfully', () => {
      translationService.clearCache();
      // No explicit assertion needed - should not throw
    });

    test('should get missing keys', () => {
      const missingKeys = translationService.getMissingKeys();
      expect(Array.isArray(missingKeys)).toBe(true);
    });
  });

  describe('private helper methods', () => {
    test('should get correct locale code', () => {
      const service = translationService as any;
      expect(service.getLocaleCode('en')).toBe('en-US');
      expect(service.getLocaleCode('es')).toBe('es-ES');
      expect(service.getLocaleCode('fr')).toBe('fr-FR');
    });

    test('should get language by country', () => {
      const service = translationService as any;
      expect(service.getLanguageByCountry('US')).toBe('en');
      expect(service.getLanguageByCountry('ES')).toBe('es');
      expect(service.getLanguageByCountry('FR')).toBe('fr');
      expect(service.getLanguageByCountry('UNKNOWN')).toBe(DEFAULT_LANGUAGE);
    });

    test('should create correct cache key', () => {
      const service = translationService as any;
      const cacheKey = service.createCacheKey(
        'welcome',
        'es',
        'common',
        { name: 'John' },
        'greeting',
        1
      );
      
      expect(typeof cacheKey).toBe('string');
      expect(cacheKey).toContain('welcome');
      expect(cacheKey).toContain('es');
    });
  });

  describe('error handling', () => {
    test('should handle database errors in getUserLanguage', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (User.findById as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const result = await translationService.getUserLanguage('user123');
      expect(result).toBe(DEFAULT_LANGUAGE);
    });

    test('should handle database errors in setUserLanguage', async () => {
      (User.findByIdAndUpdate as jest.Mock).mockRejectedValue(new Error('DB Error'));

      await expect(
        translationService.setUserLanguage('user123', 'es')
      ).rejects.toThrow('DB Error');
    });

    test('should handle cache errors gracefully', async () => {
      (optimizedCache.set as jest.Mock).mockRejectedValue(new Error('Cache Error'));
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      // Should still work despite cache error
      const result = await translationService.getUserLanguage('user123');
      expect(result).toBe('es');
    });
  });

  describe('edge cases', () => {
    test('should handle null/undefined user preferences', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue({
          preferences: null
        })
      });

      const result = await translationService.getUserLanguage('user123');
      expect(result).toBe(DEFAULT_LANGUAGE);
    });

    test('should handle empty interpolation data', async () => {
      const result = await translationService.translateKey('welcome', {
        language: 'es',
        interpolation: {}
      });

      expect(result).toBe('translated_text');
    });

    test('should handle very long cache keys', async () => {
      const longKey = 'a'.repeat(1000);
      const result = await translationService.translateKey(longKey, {
        language: 'es',
        interpolation: { veryLongProperty: 'a'.repeat(1000) }
      });

      expect(typeof result).toBe('string');
    });
  });
});