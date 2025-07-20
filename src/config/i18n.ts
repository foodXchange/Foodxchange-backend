import path from 'path';

import i18n from 'i18next';
import Backend from 'i18next-fs-backend';
import i18nextMiddleware from 'i18next-http-middleware';

import { Logger } from '../core/logging/logger';
import { startupCache } from '../utils/startupCache';

const logger = new Logger('i18n');

// Supported languages configuration
export const SUPPORTED_LANGUAGES = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    rtl: false
  },
  es: {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    rtl: false
  },
  fr: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    rtl: false
  },
  de: {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    rtl: false
  },
  it: {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    rtl: false
  },
  pt: {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇵🇹',
    rtl: false
  },
  zh: {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    rtl: false
  },
  ja: {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    rtl: false
  },
  ko: {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    flag: '🇰🇷',
    rtl: false
  },
  ar: {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🇸🇦',
    rtl: true
  },
  hi: {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    rtl: false
  },
  ru: {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
    rtl: false
  }
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

// Default fallback language
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

// Regional food categories mapping
export const REGIONAL_FOOD_CATEGORIES = {
  en: ['fruits', 'vegetables', 'dairy', 'meat', 'seafood', 'grains', 'spices'],
  es: ['frutas', 'verduras', 'lácteos', 'carne', 'mariscos', 'granos', 'especias'],
  fr: ['fruits', 'légumes', 'produits_laitiers', 'viande', 'fruits_de_mer', 'céréales', 'épices'],
  de: ['obst', 'gemüse', 'milchprodukte', 'fleisch', 'meeresfrüchte', 'getreide', 'gewürze'],
  it: ['frutta', 'verdura', 'latticini', 'carne', 'frutti_di_mare', 'cereali', 'spezie'],
  pt: ['frutas', 'vegetais', 'laticínios', 'carne', 'frutos_do_mar', 'grãos', 'especiarias'],
  zh: ['水果', '蔬菜', '乳制品', '肉类', '海鲜', '谷物', '香料'],
  ja: ['果物', '野菜', '乳製品', '肉類', 'シーフード', '穀物', 'スパイス'],
  ko: ['과일', '채소', '유제품', '육류', '해산물', '곡물', '향신료'],
  ar: ['فواكه', 'خضروات', 'منتجات_الألبان', 'لحوم', 'المأكولات_البحرية', 'حبوب', 'توابل'],
  hi: ['फल', 'सब्जियां', 'डेयरी', 'मांस', 'समुद्री_भोजन', 'अनाज', 'मसाले'],
  ru: ['фрукты', 'овощи', 'молочные_продукты', 'мясо', 'морепродукты', 'зерновые', 'специи']
};

// Currency and number format configuration
export const CURRENCY_CONFIG = {
  en: { currency: 'USD', format: 'en-US' },
  es: { currency: 'EUR', format: 'es-ES' },
  fr: { currency: 'EUR', format: 'fr-FR' },
  de: { currency: 'EUR', format: 'de-DE' },
  it: { currency: 'EUR', format: 'it-IT' },
  pt: { currency: 'EUR', format: 'pt-PT' },
  zh: { currency: 'CNY', format: 'zh-CN' },
  ja: { currency: 'JPY', format: 'ja-JP' },
  ko: { currency: 'KRW', format: 'ko-KR' },
  ar: { currency: 'SAR', format: 'ar-SA' },
  hi: { currency: 'INR', format: 'hi-IN' },
  ru: { currency: 'RUB', format: 'ru-RU' }
};

// Date format configuration
export const DATE_FORMATS = {
  en: 'MM/DD/YYYY',
  es: 'DD/MM/YYYY',
  fr: 'DD/MM/YYYY',
  de: 'DD.MM.YYYY',
  it: 'DD/MM/YYYY',
  pt: 'DD/MM/YYYY',
  zh: 'YYYY/MM/DD',
  ja: 'YYYY/MM/DD',
  ko: 'YYYY.MM.DD',
  ar: 'DD/MM/YYYY',
  hi: 'DD/MM/YYYY',
  ru: 'DD.MM.YYYY'
};

// Initialize i18next with caching optimization
const initializeI18n = async (): Promise<void> => {
  try {
    // Generate cache key based on config
    const configChecksum = require('crypto')
      .createHash('md5')
      .update(JSON.stringify({
        supportedLanguages: Object.keys(SUPPORTED_LANGUAGES),
        defaultLanguage: DEFAULT_LANGUAGE,
        nodeEnv: process.env.NODE_ENV
      }))
      .digest('hex');

    const i18nConfig = await startupCache.getOrSet(
      'i18n-config',
      async () => ({
        // Language detection settings
        detection: {
          order: ['header', 'querystring', 'cookie', 'session'],
          lookupHeader: 'accept-language',
          lookupQuerystring: 'lang',
          lookupCookie: 'i18next',
          lookupSession: 'language',
          caches: ['cookie', 'session'],
          excludeCacheFor: ['cimode']
        },

        // Fallback configuration
        fallbackLng: DEFAULT_LANGUAGE,
        supportedLngs: Object.keys(SUPPORTED_LANGUAGES),
        preload: [DEFAULT_LANGUAGE], // Only preload default language for faster startup

        // Backend configuration
        backend: {
          loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
          addPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.missing.json'),
          jsonIndent: 2
        },

        // Namespace configuration
        ns: [
          'common',
          'auth',
          'products',
          'orders',
          'companies',
          'users',
          'notifications',
          'analytics',
          'compliance',
          'search',
          'errors',
          'validation',
          'emails'
        ],
        defaultNS: 'common',

        // Debug settings
        debug: process.env.NODE_ENV === 'development',

        // Resource loading
        load: 'languageOnly' as const,
        cleanCode: true,

        // Interpolation settings
        interpolation: {
          escapeValue: false, // React already escapes values
          formatSeparator: ',',
          format: (value: any, format?: string, lng?: string) => {
            if (format === 'currency' && lng) {
              const config = CURRENCY_CONFIG[lng as SupportedLanguage];
              return new Intl.NumberFormat(config.format, {
                style: 'currency',
                currency: config.currency
              }).format(value);
            }

            if (format === 'date' && lng) {
              const dateFormat = DATE_FORMATS[lng as SupportedLanguage];
              return new Date(value).toLocaleDateString(lng, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
              });
            }

            if (format === 'number' && lng) {
              const config = CURRENCY_CONFIG[lng as SupportedLanguage];
              return new Intl.NumberFormat(config.format).format(value);
            }

            return value;
          }
        },

        // React specific settings
        react: {
          useSuspense: false,
          bindI18n: 'languageChanged',
          bindI18nStore: 'added removed',
          transEmptyNodeValue: '',
          transSupportBasicHtmlNodes: true,
          transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'em']
        },

        // Missing key handling
        saveMissing: process.env.NODE_ENV === 'development',
        updateMissing: process.env.NODE_ENV === 'development',
        missingKeyHandler: (lng: readonly string[], ns: string, key: string) => {
          if (process.env.NODE_ENV === 'development') {
            logger.warn(`Missing translation key: ${key} for language: ${lng} in namespace: ${ns}`);
          }
        },

        // Performance settings
        initImmediate: false,
        keySeparator: '.',
        nsSeparator: ':',

        // Custom processing
        postProcess: ['interval', 'plural'],

        // Retry settings
        // backend_retry: {
        //   retries: 3,
        //   retryDelay: 100
        // }
      }),
      {
        ttl: 60 * 60 * 1000, // 1 hour cache
        checksum: configChecksum
      }
    );

    await i18n
      .use(Backend)
      .use(i18nextMiddleware.LanguageDetector)
      .init(i18nConfig);

    logger.info('i18n initialized successfully', {
      supportedLanguages: Object.keys(SUPPORTED_LANGUAGES),
      defaultLanguage: DEFAULT_LANGUAGE
    });

  } catch (error) {
    logger.error('Failed to initialize i18n', error);
    throw error;
  }
};

// Helper functions
export const getSupportedLanguages = () => SUPPORTED_LANGUAGES;

export const isLanguageSupported = (lang: string): lang is SupportedLanguage => {
  return lang in SUPPORTED_LANGUAGES;
};

export const getLanguageInfo = (lang: SupportedLanguage) => {
  return SUPPORTED_LANGUAGES[lang];
};

export const formatCurrency = (amount: number, language: SupportedLanguage): string => {
  const config = CURRENCY_CONFIG[language];
  return new Intl.NumberFormat(config.format, {
    style: 'currency',
    currency: config.currency
  }).format(amount);
};

export const formatDate = (date: Date, language: SupportedLanguage): string => {
  const config = CURRENCY_CONFIG[language];
  return date.toLocaleDateString(config.format);
};

export const formatNumber = (number: number, language: SupportedLanguage): string => {
  const config = CURRENCY_CONFIG[language];
  return new Intl.NumberFormat(config.format).format(number);
};

export const getRegionalFoodCategories = (language: SupportedLanguage): string[] => {
  return REGIONAL_FOOD_CATEGORIES[language] || REGIONAL_FOOD_CATEGORIES[DEFAULT_LANGUAGE];
};

// Translation helper
export const translate = (key: string, options?: any, language?: SupportedLanguage): string => {
  if (language) {
    const result = i18n.getFixedT(language)(key, options);
    return typeof result === 'string' ? result : String(result);
  }
  const result = i18n.t(key, options);
  return typeof result === 'string' ? result : String(result);
};

// Middleware factory
export const createI18nMiddleware = () => {
  return i18nextMiddleware.handle(i18n, {
    ignoreRoutes: ['/health', '/api-docs'],
    removeLngFromUrl: false
  });
};

// Export configured i18n instance
export { i18n, initializeI18n };
export default i18n;
