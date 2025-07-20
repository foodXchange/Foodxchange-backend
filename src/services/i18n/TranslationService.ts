import { i18n, translate, SupportedLanguage, DEFAULT_LANGUAGE, isLanguageSupported } from '../../config/i18n';
import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { User } from '../../models/User';
import { optimizedCache } from '../cache/OptimizedCacheService';

const logger = new Logger('TranslationService');

export interface TranslationOptions {
  language?: SupportedLanguage;
  namespace?: string;
  interpolation?: Record<string, any>;
  context?: string;
  count?: number;
  defaultValue?: string;
}

export interface TranslationRequest {
  key: string;
  options?: TranslationOptions;
}

export interface BulkTranslationRequest {
  translations: TranslationRequest[];
  language?: SupportedLanguage;
}

export interface TranslationResult {
  key: string;
  translated: string;
  language: SupportedLanguage;
  namespace?: string;
}

export interface LocalizedContent {
  [key: string]: {
    [language in SupportedLanguage]?: string;
  };
}

export class TranslationService {
  private readonly translationCache = new Map<string, string>();
  private readonly missingKeys = new Set<string>();

  // Get user's preferred language
  async getUserLanguage(userId: string): Promise<SupportedLanguage> {
    try {
      const cacheKey = `user_language:${userId}`;
      const cached = await optimizedCache.get(cacheKey);

      if (cached && isLanguageSupported(cached)) {
        return cached;
      }

      const user = await User.findById(userId).select('preferences.language');
      const userLanguage = user?.preferences?.language || DEFAULT_LANGUAGE;

      const language = isLanguageSupported(userLanguage) ? userLanguage : DEFAULT_LANGUAGE;

      // Cache for 1 hour
      await optimizedCache.set(cacheKey, language, 3600);

      return language;
    } catch (error) {
      logger.warn('Failed to get user language', { userId, error });
      return DEFAULT_LANGUAGE;
    }
  }

  // Get company's preferred language
  async getCompanyLanguage(companyId: string): Promise<SupportedLanguage> {
    try {
      const cacheKey = `company_language:${companyId}`;
      const cached = await optimizedCache.get(cacheKey);

      if (cached && isLanguageSupported(cached)) {
        return cached;
      }

      const company = await Company.findById(companyId).select('preferences.language location.country');
      let companyLanguage = company?.preferences?.language;

      // Fallback to country-based language detection
      if (!companyLanguage && company?.location?.country) {
        companyLanguage = this.getLanguageByCountry(company.location.country);
      }

      const language = isLanguageSupported(companyLanguage) ? companyLanguage : DEFAULT_LANGUAGE;

      // Cache for 1 hour
      await optimizedCache.set(cacheKey, language, 3600);

      return language;
    } catch (error) {
      logger.warn('Failed to get company language', { companyId, error });
      return DEFAULT_LANGUAGE;
    }
  }

  // Set user's preferred language
  async setUserLanguage(userId: string, language: SupportedLanguage): Promise<void> {
    try {
      if (!isLanguageSupported(language)) {
        throw new Error(`Unsupported language: ${language}`);
      }

      await User.findByIdAndUpdate(userId, {
        'preferences.language': language
      });

      // Update cache
      const cacheKey = `user_language:${userId}`;
      await optimizedCache.set(cacheKey, language, 3600);

      logger.info('User language updated', { userId, language });
    } catch (error) {
      logger.error('Failed to set user language', { userId, language, error });
      throw error;
    }
  }

  // Set company's preferred language
  async setCompanyLanguage(companyId: string, language: SupportedLanguage): Promise<void> {
    try {
      if (!isLanguageSupported(language)) {
        throw new Error(`Unsupported language: ${language}`);
      }

      await Company.findByIdAndUpdate(companyId, {
        'preferences.language': language
      });

      // Update cache
      const cacheKey = `company_language:${companyId}`;
      await optimizedCache.set(cacheKey, language, 3600);

      logger.info('Company language updated', { companyId, language });
    } catch (error) {
      logger.error('Failed to set company language', { companyId, language, error });
      throw error;
    }
  }

  // Translate a single key
  async translateKey(
    key: string,
    options: TranslationOptions = {}
  ): Promise<string> {
    try {
      const {
        language = DEFAULT_LANGUAGE,
        namespace,
        interpolation,
        context,
        count,
        defaultValue
      } = options;

      // Create cache key
      const cacheKey = this.createCacheKey(key, language, namespace, interpolation, context, count);

      // Check cache first
      if (this.translationCache.has(cacheKey)) {
        return this.translationCache.get(cacheKey);
      }

      // Build full key with namespace
      const fullKey = namespace ? `${namespace}:${key}` : key;

      // Translation options for i18next
      const i18nOptions: any = {
        lng: language,
        fallbackLng: DEFAULT_LANGUAGE,
        defaultValue: defaultValue || key,
        ...interpolation && { ...interpolation },
        ...context && { context },
        ...count !== undefined && { count }
      };

      // Get translation
      const translated = translate(fullKey, i18nOptions, language);

      // Cache the result
      this.translationCache.set(cacheKey, translated);

      // Track missing keys in development
      if (process.env.NODE_ENV === 'development' && translated === key) {
        this.missingKeys.add(`${language}:${fullKey}`);
        logger.warn('Missing translation key', { key: fullKey, language });
      }

      return translated;
    } catch (error) {
      logger.error('Translation failed', { key, options, error });
      return options.defaultValue || key;
    }
  }

  // Translate multiple keys in bulk
  async translateBulk(request: BulkTranslationRequest): Promise<TranslationResult[]> {
    const { translations, language = DEFAULT_LANGUAGE } = request;

    const results: TranslationResult[] = [];

    for (const { key, options = {} } of translations) {
      const translationOptions = { ...options, language };
      const translated = await this.translateKey(key, translationOptions);

      results.push({
        key,
        translated,
        language,
        namespace: options.namespace
      });
    }

    return results;
  }

  // Get localized content
  async getLocalizedContent(
    content: LocalizedContent,
    language?: SupportedLanguage
  ): Promise<Record<string, string>> {
    const targetLanguage = language || DEFAULT_LANGUAGE;
    const result: Record<string, string> = {};

    for (const [key, translations] of Object.entries(content)) {
      result[key] = translations[targetLanguage] ||
                   translations[DEFAULT_LANGUAGE] ||
                   key;
    }

    return result;
  }

  // Translate email templates
  async translateEmail(
    templateKey: string,
    data: Record<string, any> = {},
    language?: SupportedLanguage
  ): Promise<{ subject: string; body: string }> {
    const lang = language || DEFAULT_LANGUAGE;

    const subject = await this.translateKey(`${templateKey}.subject`, {
      language: lang,
      namespace: 'emails',
      interpolation: data
    });

    const body = await this.translateKey(`${templateKey}.body`, {
      language: lang,
      namespace: 'emails',
      interpolation: data
    });

    return { subject, body };
  }

  // Translate notification messages
  async translateNotification(
    messageKey: string,
    data: Record<string, any> = {},
    language?: SupportedLanguage
  ): Promise<{ title: string; message: string }> {
    const lang = language || DEFAULT_LANGUAGE;

    const title = await this.translateKey(`${messageKey}.title`, {
      language: lang,
      namespace: 'notifications',
      interpolation: data
    });

    const message = await this.translateKey(`${messageKey}.message`, {
      language: lang,
      namespace: 'notifications',
      interpolation: data
    });

    return { title, message };
  }

  // Translate error messages
  async translateError(
    errorKey: string,
    data: Record<string, any> = {},
    language?: SupportedLanguage
  ): Promise<string> {
    return this.translateKey(errorKey, {
      language: language || DEFAULT_LANGUAGE,
      namespace: 'errors',
      interpolation: data
    });
  }

  // Translate validation messages
  async translateValidation(
    validationKey: string,
    data: Record<string, any> = {},
    language?: SupportedLanguage
  ): Promise<string> {
    return this.translateKey(`validation.${validationKey}`, {
      language: language || DEFAULT_LANGUAGE,
      namespace: 'errors',
      interpolation: data
    });
  }

  // Get available translations for a key
  async getAvailableTranslations(key: string, namespace?: string): Promise<Record<SupportedLanguage, string>> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    const translations: Record<string, string> = {};

    for (const lang of Object.keys(i18n.options.supportedLngs || [])) {
      if (isLanguageSupported(lang)) {
        translations[lang] = translate(fullKey, {}, lang);
      }
    }

    return translations as Record<SupportedLanguage, string>;
  }

  // Format localized numbers, currencies, and dates
  formatCurrency(
    amount: number,
    currency: string,
    language: SupportedLanguage = DEFAULT_LANGUAGE
  ): string {
    try {
      return new Intl.NumberFormat(this.getLocaleCode(language), {
        style: 'currency',
        currency: currency.toUpperCase()
      }).format(amount);
    } catch (error) {
      logger.warn('Currency formatting failed', { amount, currency, language, error });
      return `${currency} ${amount}`;
    }
  }

  formatNumber(
    number: number,
    language: SupportedLanguage = DEFAULT_LANGUAGE
  ): string {
    try {
      return new Intl.NumberFormat(this.getLocaleCode(language)).format(number);
    } catch (error) {
      logger.warn('Number formatting failed', { number, language, error });
      return number.toString();
    }
  }

  formatDate(
    date: Date,
    language: SupportedLanguage = DEFAULT_LANGUAGE,
    options: Intl.DateTimeFormatOptions = {}
  ): string {
    try {
      return new Intl.DateTimeFormat(this.getLocaleCode(language), options).format(date);
    } catch (error) {
      logger.warn('Date formatting failed', { date, language, error });
      return date.toISOString();
    }
  }

  formatRelativeTime(
    date: Date,
    language: SupportedLanguage = DEFAULT_LANGUAGE
  ): string {
    try {
      const rtf = new Intl.RelativeTimeFormat(this.getLocaleCode(language), {
        numeric: 'auto',
        style: 'long'
      });

      const now = Date.now();
      const targetTime = date.getTime();
      const diffInSeconds = Math.round((targetTime - now) / 1000);

      if (Math.abs(diffInSeconds) < 60) {
        return rtf.format(diffInSeconds, 'second');
      } else if (Math.abs(diffInSeconds) < 3600) {
        return rtf.format(Math.round(diffInSeconds / 60), 'minute');
      } else if (Math.abs(diffInSeconds) < 86400) {
        return rtf.format(Math.round(diffInSeconds / 3600), 'hour');
      }
      return rtf.format(Math.round(diffInSeconds / 86400), 'day');

    } catch (error) {
      logger.warn('Relative time formatting failed', { date, language, error });
      return date.toLocaleDateString();
    }
  }

  // Get missing translation keys (for development)
  getMissingKeys(): string[] {
    return Array.from(this.missingKeys);
  }

  // Clear translation cache
  clearCache(): void {
    this.translationCache.clear();
    this.missingKeys.clear();
    logger.info('Translation cache cleared');
  }

  // Helper methods
  private createCacheKey(
    key: string,
    language: SupportedLanguage,
    namespace?: string,
    interpolation?: Record<string, any>,
    context?: string,
    count?: number
  ): string {
    const parts = [key, language];
    if (namespace) parts.push(namespace);
    if (interpolation) parts.push(JSON.stringify(interpolation));
    if (context) parts.push(context);
    if (count !== undefined) parts.push(count.toString());
    return parts.join(':');
  }

  private getLocaleCode(language: SupportedLanguage): string {
    const localeMap: Record<SupportedLanguage, string> = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      it: 'it-IT',
      pt: 'pt-PT',
      zh: 'zh-CN',
      ja: 'ja-JP',
      ko: 'ko-KR',
      ar: 'ar-SA',
      hi: 'hi-IN',
      ru: 'ru-RU'
    };
    return localeMap[language] || 'en-US';
  }

  private getLanguageByCountry(country: string): SupportedLanguage {
    const countryLanguageMap: Record<string, SupportedLanguage> = {
      'US': 'en', 'GB': 'en', 'CA': 'en', 'AU': 'en', 'NZ': 'en',
      'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es', 'PE': 'es',
      'FR': 'fr', 'BE': 'fr', 'CH': 'fr', 'MA': 'fr',
      'DE': 'de', 'AT': 'de',
      'IT': 'it',
      'PT': 'pt', 'BR': 'pt',
      'CN': 'zh', 'TW': 'zh', 'HK': 'zh', 'SG': 'zh',
      'JP': 'ja',
      'KR': 'ko',
      'SA': 'ar', 'AE': 'ar', 'EG': 'ar', 'JO': 'ar',
      'IN': 'hi',
      'RU': 'ru'
    };

    return countryLanguageMap[country.toUpperCase()] || DEFAULT_LANGUAGE;
  }
}

export const translationService = new TranslationService();
